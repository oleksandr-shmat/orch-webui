import type { Agent, Container, CreateAgentInput, Task } from '@oxgeneral/orch';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { registryStore } from '../registry/RegistryStore.js';
import { workspaceManager } from '../workspace/WorkspaceManager.js';

interface TargetParams {
  targetId: string;
}

type JsonRecord = Record<string, unknown>;

const UPDATABLE_AGENT_FIELDS = ['name', 'adapter', 'role', 'command', 'model', 'effort', 'approval_policy'] as const;
const RECREATE_ONLY_AGENT_FIELDS = ['skills', 'env', 'max_turns', 'timeout_ms', 'stall_timeout_ms', 'system_prompt', 'workspace_mode'] as const;
const AGENT_SNAPSHOT_FIELDS = [...UPDATABLE_AGENT_FIELDS, ...RECREATE_ONLY_AGENT_FIELDS] as const;
type AgentSnapshotField = typeof AGENT_SNAPSHOT_FIELDS[number];
type AgentSnapshot = CreateAgentInput;
type AgentUpdate = Parameters<Container['agentService']['update']>[1];
type OrchestratorTeam = Awaited<ReturnType<Container['teamService']['get']>>;
type TeamSnapshot = Pick<OrchestratorTeam, 'name' | 'description' | 'config'> & {
  lead_agent_name: string;
  member_agent_names: string[];
};

interface SnapshotDiff {
  field: AgentSnapshotField;
  previous: unknown;
  current: unknown;
}

class RouteError extends Error {
  constructor(readonly statusCode: number, message: string, readonly details?: Record<string, unknown>) {
    super(message);
  }
}

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null;
}

function copyAgentInput(agent: Agent, name = agent.name): CreateAgentInput {
  return {
    name,
    adapter: agent.adapter,
    role: agent.role,
    command: agent.config.command,
    model: agent.config.model,
    effort: agent.config.effort,
    approval_policy: agent.config.approval_policy,
    max_turns: agent.config.max_turns,
    timeout_ms: agent.config.timeout_ms,
    stall_timeout_ms: agent.config.stall_timeout_ms,
    env: agent.config.env && { ...agent.config.env },
    system_prompt: agent.config.system_prompt,
    workspace_mode: agent.config.workspace_mode,
    skills: agent.config.skills && [...agent.config.skills],
  };
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as JsonRecord)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableValue(item)]));
  }
  return value;
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
}

function snapshotDiff(previous: CreateAgentInput | Record<string, unknown>, current: AgentSnapshot): SnapshotDiff[] {
  return AGENT_SNAPSHOT_FIELDS.flatMap((field) => {
    const previousValue = previous[field];
    const currentValue = current[field];
    return sameValue(previousValue, currentValue) ? [] : [{ field, previous: previousValue, current: currentValue }];
  });
}

function updateInputFromDiff(diff: SnapshotDiff[]): AgentUpdate {
  const input: AgentUpdate = {};
  for (const change of diff) {
    if (!UPDATABLE_AGENT_FIELDS.includes(change.field as typeof UPDATABLE_AGENT_FIELDS[number])) continue;
    // ORCH's update() uses undefined as "field omitted". Empty strings are its documented
    // clearing value for optional mutable string fields.
    const value = change.current === undefined && ['role', 'command', 'model', 'effort'].includes(change.field)
      ? ''
      : change.current;
    Object.assign(input, { [change.field]: value });
  }
  return input;
}

async function containerFor(id: string): Promise<Container> {
  if (!workspaceManager.get(id)) throw new RouteError(404, `Unknown workspace: ${id}`);
  if (!workspaceManager.isInitialized(id)) throw new RouteError(409, 'Workspace has no .orchestry/ — run init first');
  try {
    return await workspaceManager.activate(id);
  } catch (err) {
    throw new RouteError(500, `Failed to activate workspace: ${(err as Error).message}`);
  }
}

function parseLinkAgentsBody(body: unknown): { sourceWorkspaceId: string; agentIds: string[]; renames: Record<string, string> } {
  const record = asRecord(body);
  const sourceWorkspaceId = record?.sourceWorkspaceId;
  const agentIds = record?.agentIds;
  const suppliedRenames = record?.renames;
  if (typeof sourceWorkspaceId !== 'string' || !sourceWorkspaceId.trim()) throw new RouteError(400, 'sourceWorkspaceId is required');
  if (!Array.isArray(agentIds) || !agentIds.length || !agentIds.every((id) => typeof id === 'string' && id.trim())) throw new RouteError(400, 'agentIds must be a non-empty string array');
  if (new Set(agentIds).size !== agentIds.length) throw new RouteError(400, 'agentIds must not contain duplicates');
  if (suppliedRenames !== undefined && !asRecord(suppliedRenames)) throw new RouteError(400, 'renames must be an object keyed by source agent id');

  const renames: Record<string, string> = {};
  for (const [agentId, value] of Object.entries(asRecord(suppliedRenames) ?? {})) {
    if (typeof value !== 'string' || !value.trim()) throw new RouteError(400, `rename for ${agentId} must be a non-empty string`);
    renames[agentId] = value.trim();
  }
  return { sourceWorkspaceId, agentIds, renames };
}

function parseLinkTeamsBody(body: unknown): { sourceWorkspaceId: string; teamIds: string[]; renames: Record<string, string> } {
  const record = asRecord(body);
  const sourceWorkspaceId = record?.sourceWorkspaceId;
  const teamIds = record?.teamIds;
  const suppliedRenames = record?.renames;
  if (typeof sourceWorkspaceId !== 'string' || !sourceWorkspaceId.trim()) throw new RouteError(400, 'sourceWorkspaceId is required');
  if (!Array.isArray(teamIds) || !teamIds.length || !teamIds.every((id) => typeof id === 'string' && id.trim())) throw new RouteError(400, 'teamIds must be a non-empty string array');
  if (new Set(teamIds).size !== teamIds.length) throw new RouteError(400, 'teamIds must not contain duplicates');
  if (suppliedRenames !== undefined && !asRecord(suppliedRenames)) throw new RouteError(400, 'renames must be an object keyed by source agent id');

  const renames: Record<string, string> = {};
  for (const [agentId, value] of Object.entries(asRecord(suppliedRenames) ?? {})) {
    if (typeof value !== 'string' || !value.trim()) throw new RouteError(400, `rename for ${agentId} must be a non-empty string`);
    renames[agentId] = value.trim();
  }
  return { sourceWorkspaceId, teamIds, renames };
}

function requireAgentLink(targetId: string, linkId: string) {
  const link = registryStore.listLinks(targetId).find((item) => item.id === linkId && item.kind === 'agent');
  if (!link) throw new RouteError(404, `Agent registry link not found: ${linkId}`);
  return link;
}

function requireTeamLink(targetId: string, linkId: string) {
  const link = registryStore.listLinks(targetId).find((item) => item.id === linkId && item.kind === 'team');
  if (!link) throw new RouteError(404, `Team registry link not found: ${linkId}`);
  return link;
}

async function sourceSnapshotForLink(link: ReturnType<typeof requireAgentLink>): Promise<{ source: Container; snapshot: AgentSnapshot }> {
  const source = await containerFor(link.sourceWorkspaceId);
  const agent = await source.agentService.get(link.sourceEntityId).catch(() => undefined);
  if (!agent) throw new RouteError(404, `Source agent no longer exists: ${link.sourceEntityId}`);
  return { source, snapshot: copyAgentInput(agent) };
}

function teamSnapshot(team: OrchestratorTeam, agentsById: Map<string, Agent>): TeamSnapshot {
  const nameFor = (agentId: string) => {
    const agent = agentsById.get(agentId);
    if (!agent) throw new RouteError(409, `Team ${team.id} references a missing agent: ${agentId}`);
    return agent.name;
  };
  return {
    name: team.name,
    description: team.description,
    config: structuredClone(team.config),
    lead_agent_name: nameFor(team.lead_agent_id),
    member_agent_names: team.members.map((member) => nameFor(member.agent_id)).sort(),
  };
}

async function sourceTeamSnapshotForLink(link: ReturnType<typeof requireTeamLink>): Promise<{ source: Container; team: OrchestratorTeam; snapshot: TeamSnapshot; agentsById: Map<string, Agent> }> {
  const source = await containerFor(link.sourceWorkspaceId);
  const [team, agents] = await Promise.all([source.teamService.get(link.sourceEntityId).catch(() => undefined), source.agentService.list()]);
  if (!team) throw new RouteError(404, `Source team no longer exists: ${link.sourceEntityId}`);
  const agentsById = new Map(agents.map((agent) => [agent.id, agent]));
  return { source, team, snapshot: teamSnapshot(team, agentsById), agentsById };
}

async function ensureTargetAgents(
  sourceWorkspaceId: string,
  targetId: string,
  sourceAgents: Agent[],
  target: Container,
  renames: Record<string, string>,
): Promise<Map<string, string>> {
  const targetAgents = await target.agentService.list();
  const targetById = new Map(targetAgents.map((agent) => [agent.id, agent]));
  const usedNames = new Set(targetAgents.map((agent) => agent.name));
  const resolved = new Map<string, string>();
  const toCreate: Array<{ source: Agent; input: CreateAgentInput }> = [];

  for (const sourceAgent of sourceAgents) {
    const existing = registryStore.findLink(sourceWorkspaceId, sourceAgent.id, targetId, 'agent');
    if (existing) {
      if (!targetById.has(existing.targetEntityId)) throw new RouteError(409, `Linked target agent no longer exists: ${existing.targetEntityId}`);
      resolved.set(sourceAgent.id, existing.targetEntityId);
      continue;
    }
    const input = copyAgentInput(sourceAgent, renames[sourceAgent.id] ?? sourceAgent.name);
    if (usedNames.has(input.name)) {
      throw new RouteError(409, `Target already has an agent named: ${input.name}`, { sourceAgentId: sourceAgent.id, sourceAgentName: sourceAgent.name, requiresRename: true });
    }
    usedNames.add(input.name);
    toCreate.push({ source: sourceAgent, input });
  }

  for (const { source: sourceAgent, input } of toCreate) {
    const created = await target.agentService.create(input);
    await registryStore.createLink({
      kind: 'agent',
      sourceWorkspaceId,
      sourceEntityId: sourceAgent.id,
      targetWorkspaceId: targetId,
      targetEntityId: created.id,
      lastSyncedSnapshot: copyAgentInput(sourceAgent),
    });
    resolved.set(sourceAgent.id, created.id);
  }
  return resolved;
}

async function recreateWarnings(target: Container, targetAgentId: string): Promise<Record<string, unknown>> {
  const [teams, tasks] = await Promise.all([target.teamService.list(), target.taskService.list()]);
  const leadTeams = teams.filter((team) => team.lead_agent_id === targetAgentId)
    .map((team) => ({ id: team.id, name: team.name }));
  const assigned = (tasks as Task[]).filter((task) => task.assignee === targetAgentId && ['todo', 'in_progress', 'retrying'].includes(task.status));
  return {
    destructive: true,
    loses: ['target agent id', 'agent statistics', 'run history'],
    leadTeams,
    assignedTasks: assigned.map((task) => ({ id: task.id, title: task.title, status: task.status })),
    hasWarnings: leadTeams.length > 0 || assigned.length > 0,
  };
}

async function remapTeamMemberships(target: Container, oldAgentId: string, newAgentId: string): Promise<void> {
  const teams = await target.teamService.list();
  for (const team of teams) {
    if (!team.members.some((member) => member.agent_id === oldAgentId)) continue;
    await target.teamService.join(team.id, newAgentId);
    if (team.lead_agent_id === oldAgentId) await target.teamService.setLead(team.id, newAgentId);
    await target.teamService.leave(team.id, oldAgentId);
  }
}

/** App-level, manual one-way registry routes. No automatic synchronization occurs here. */
export default async function registryRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: TargetParams }>('/api/workspaces/:targetId/registry/links', async (request) =>
    registryStore.listLinks(request.params.targetId));

  app.get<{ Params: TargetParams }>('/api/workspaces/:targetId/registry/agent-staleness', async (request, reply) => {
    try {
      const links = registryStore.listLinks(request.params.targetId).filter((link) => link.kind === 'agent');
      const results = await Promise.all(links.map(async (link) => {
        try {
          const { snapshot } = await sourceSnapshotForLink(link);
          const diff = snapshotDiff(link.lastSyncedSnapshot, snapshot);
          return { linkId: link.id, targetAgentId: link.targetEntityId, stale: diff.length > 0, sourceMissing: false, diff };
        } catch (err) {
          if (err instanceof RouteError && err.statusCode === 404) {
            return { linkId: link.id, targetAgentId: link.targetEntityId, stale: true, sourceMissing: true, diff: [] };
          }
          throw err;
        }
      }));
      return results;
    } catch (err) {
      if (err instanceof RouteError) return reply.code(err.statusCode).send({ error: err.message, ...err.details });
      request.log.warn({ err, targetWorkspaceId: request.params.targetId }, 'agent registry staleness check failed');
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  app.get('/api/registry/settings', async () => registryStore.getSettings());
  app.put<{ Body: unknown }>('/api/registry/settings', async (request, reply) => {
    const body = asRecord(request.body);
    if (!body || !Object.hasOwn(body, 'defaultRegistryWorkspaceId')) return reply.code(400).send({ error: 'defaultRegistryWorkspaceId is required (string or null)' });
    const value = body.defaultRegistryWorkspaceId;
    if (value !== null && (typeof value !== 'string' || !workspaceManager.get(value))) {
      return reply.code(400).send({ error: 'defaultRegistryWorkspaceId must be a registered workspace id or null' });
    }
    return registryStore.updateSettings(value === null ? {} : { defaultRegistryWorkspaceId: value });
  });

  app.post<{ Params: TargetParams; Body: unknown }>('/api/workspaces/:targetId/registry/link-agents', async (request, reply) => {
    try {
      const targetId = request.params.targetId;
      const { sourceWorkspaceId, agentIds, renames } = parseLinkAgentsBody(request.body);
      if (targetId === sourceWorkspaceId) throw new RouteError(400, 'sourceWorkspaceId and targetId must differ');

      const [source, target] = await Promise.all([containerFor(sourceWorkspaceId), containerFor(targetId)]);
      const [sourceAgents, targetAgents] = await Promise.all([source.agentService.list(), target.agentService.list()]);
      const sourceById = new Map(sourceAgents.map((agent) => [agent.id, agent]));
      const usedNames = new Set(targetAgents.map((agent) => agent.name));
      const prepared: Array<{ source: Agent; input: CreateAgentInput }> = [];

      for (const agentId of agentIds) {
        const sourceAgent = sourceById.get(agentId);
        if (!sourceAgent) throw new RouteError(404, `Source agent not found: ${agentId}`);
        if (registryStore.findLink(sourceWorkspaceId, agentId, targetId, 'agent')) {
          throw new RouteError(409, `Source agent is already linked to this workspace: ${agentId}`);
        }
        const input = copyAgentInput(sourceAgent, renames[agentId] ?? sourceAgent.name);
        if (usedNames.has(input.name)) {
          throw new RouteError(409, `Target already has an agent named: ${input.name}`, { sourceAgentId: agentId, sourceAgentName: sourceAgent.name, requiresRename: true });
        }
        usedNames.add(input.name);
        prepared.push({ source: sourceAgent, input });
      }

      const links = [];
      for (const { source: sourceAgent, input } of prepared) {
        const created = await target.agentService.create(input);
        const link = await registryStore.createLink({
          kind: 'agent',
          sourceWorkspaceId,
          sourceEntityId: sourceAgent.id,
          targetWorkspaceId: targetId,
          targetEntityId: created.id,
          lastSyncedSnapshot: copyAgentInput(sourceAgent),
        });
        links.push({ link, agent: created });
      }
      return reply.code(201).send({ links });
    } catch (err) {
      if (err instanceof RouteError) return reply.code(err.statusCode).send({ error: err.message, ...err.details });
      request.log.warn({ err, targetWorkspaceId: request.params.targetId }, 'agent registry link failed');
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  app.post<{ Params: TargetParams & { linkId: string } }>('/api/workspaces/:targetId/registry/sync-agent/:linkId', async (request, reply) => {
    try {
      const link = requireAgentLink(request.params.targetId, request.params.linkId);
      const [{ snapshot }, target] = await Promise.all([sourceSnapshotForLink(link), containerFor(request.params.targetId)]);
      await target.agentService.get(link.targetEntityId).catch(() => { throw new RouteError(404, `Target agent no longer exists: ${link.targetEntityId}`); });
      const diff = snapshotDiff(link.lastSyncedSnapshot, snapshot);
      const updateDiff = diff.filter((change) => UPDATABLE_AGENT_FIELDS.includes(change.field as typeof UPDATABLE_AGENT_FIELDS[number]));
      const recreateDiff = diff.filter((change) => RECREATE_ONLY_AGENT_FIELDS.includes(change.field as typeof RECREATE_ONLY_AGENT_FIELDS[number]));
      let agent: Agent | undefined;
      if (updateDiff.length) agent = await target.agentService.update(link.targetEntityId, updateInputFromDiff(updateDiff));
      const updatedLink = await registryStore.updateLinkSnapshot(link.id, snapshot);
      return { link: updatedLink, agent, appliedDiff: updateDiff, needsRecreate: recreateDiff.length > 0, recreateDiff };
    } catch (err) {
      if (err instanceof RouteError) return reply.code(err.statusCode).send({ error: err.message, ...err.details });
      request.log.warn({ err, targetWorkspaceId: request.params.targetId, linkId: request.params.linkId }, 'agent registry sync failed');
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  app.get<{ Params: TargetParams & { linkId: string } }>('/api/workspaces/:targetId/registry/recreate-agent/:linkId/preview', async (request, reply) => {
    try {
      const link = requireAgentLink(request.params.targetId, request.params.linkId);
      const target = await containerFor(request.params.targetId);
      await target.agentService.get(link.targetEntityId).catch(() => { throw new RouteError(404, `Target agent no longer exists: ${link.targetEntityId}`); });
      return { linkId: link.id, targetAgentId: link.targetEntityId, ...(await recreateWarnings(target, link.targetEntityId)) };
    } catch (err) {
      if (err instanceof RouteError) return reply.code(err.statusCode).send({ error: err.message, ...err.details });
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  app.post<{ Params: TargetParams & { linkId: string }; Body: unknown }>('/api/workspaces/:targetId/registry/recreate-agent/:linkId', async (request, reply) => {
    try {
      const body = asRecord(request.body);
      if (body?.confirm !== true) throw new RouteError(409, 'Recreate is destructive and requires confirm: true');
      const link = requireAgentLink(request.params.targetId, request.params.linkId);
      const [{ snapshot }, target] = await Promise.all([sourceSnapshotForLink(link), containerFor(request.params.targetId)]);
      await target.agentService.get(link.targetEntityId).catch(() => { throw new RouteError(404, `Target agent no longer exists: ${link.targetEntityId}`); });
      const targetAgents = await target.agentService.list();
      if (targetAgents.some((agent) => agent.id !== link.targetEntityId && agent.name === snapshot.name)) {
        throw new RouteError(409, `Cannot recreate: another target agent is already named ${snapshot.name}`);
      }
      const warnings = await recreateWarnings(target, link.targetEntityId);
      await target.agentService.remove(link.targetEntityId);
      const agent = await target.agentService.create(snapshot);
      await remapTeamMemberships(target, link.targetEntityId, agent.id);
      const updatedLink = await registryStore.updateLinkSnapshot(link.id, snapshot);
      // The target id changes after replacement. Keep the link aligned with the newly created agent.
      if (!updatedLink) throw new RouteError(404, `Agent registry link disappeared during recreate: ${link.id}`);
      const recreatedLink = await registryStore.replaceTargetEntityId(link.id, agent.id);
      return { link: recreatedLink, agent, ...warnings };
    } catch (err) {
      if (err instanceof RouteError) return reply.code(err.statusCode).send({ error: err.message, ...err.details });
      request.log.warn({ err, targetWorkspaceId: request.params.targetId, linkId: request.params.linkId }, 'agent registry recreate failed');
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  app.post<{ Params: TargetParams; Body: unknown }>('/api/workspaces/:targetId/registry/link-teams', async (request, reply) => {
    try {
      const targetId = request.params.targetId;
      const { sourceWorkspaceId, teamIds, renames } = parseLinkTeamsBody(request.body);
      if (targetId === sourceWorkspaceId) throw new RouteError(400, 'sourceWorkspaceId and targetId must differ');

      const [source, target] = await Promise.all([containerFor(sourceWorkspaceId), containerFor(targetId)]);
      const [sourceTeams, sourceAgents, targetTeams] = await Promise.all([source.teamService.list(), source.agentService.list(), target.teamService.list()]);
      const sourceTeamsById = new Map(sourceTeams.map((team) => [team.id, team]));
      const sourceAgentsById = new Map(sourceAgents.map((agent) => [agent.id, agent]));
      const usedNames = new Set(targetTeams.map((team) => team.name));
      const prepared: Array<{ team: OrchestratorTeam; snapshot: TeamSnapshot; sourceAgents: Agent[] }> = [];

      for (const teamId of teamIds) {
        const team = sourceTeamsById.get(teamId);
        if (!team) throw new RouteError(404, `Source team not found: ${teamId}`);
        if (registryStore.findLink(sourceWorkspaceId, team.id, targetId, 'team')) throw new RouteError(409, `Source team is already linked to this workspace: ${team.id}`);
        if (usedNames.has(team.name)) throw new RouteError(409, `Target already has a team named: ${team.name}`, { sourceTeamId: team.id, sourceTeamName: team.name, requiresRename: true });
        usedNames.add(team.name);
        const memberIds = [...new Set([team.lead_agent_id, ...team.members.map((member) => member.agent_id)])];
        const members = memberIds.map((agentId) => {
          const agent = sourceAgentsById.get(agentId);
          if (!agent) throw new RouteError(409, `Source team ${team.id} references a missing agent: ${agentId}`);
          return agent;
        });
        prepared.push({ team, snapshot: teamSnapshot(team, sourceAgentsById), sourceAgents: members });
      }

      const allSourceAgents = [...new Map(prepared.flatMap((item) => item.sourceAgents).map((agent) => [agent.id, agent])).values()];
      const targetAgentIds = await ensureTargetAgents(sourceWorkspaceId, targetId, allSourceAgents, target, renames);
      const links = [];
      for (const { team, snapshot } of prepared) {
        const memberAgentIds = [...new Set(team.members.map((member) => targetAgentIds.get(member.agent_id)))];
        const leadAgentId = targetAgentIds.get(team.lead_agent_id);
        if (!leadAgentId || memberAgentIds.some((id) => !id)) throw new RouteError(409, `Could not map all source agents for team: ${team.id}`);
        const created = await target.teamService.create({
          name: team.name,
          description: team.description,
          lead_agent_id: leadAgentId,
          member_agent_ids: memberAgentIds as string[],
          config: structuredClone(team.config),
        });
        const link = await registryStore.createLink({
          kind: 'team',
          sourceWorkspaceId,
          sourceEntityId: team.id,
          targetWorkspaceId: targetId,
          targetEntityId: created.id,
          lastSyncedSnapshot: snapshot,
        });
        links.push({ link, team: created });
      }
      return reply.code(201).send({ links });
    } catch (err) {
      if (err instanceof RouteError) return reply.code(err.statusCode).send({ error: err.message, ...err.details });
      request.log.warn({ err, targetWorkspaceId: request.params.targetId }, 'team registry link failed');
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  app.post<{ Params: TargetParams & { linkId: string } }>('/api/workspaces/:targetId/registry/sync-team/:linkId', async (request, reply) => {
    try {
      const link = requireTeamLink(request.params.targetId, request.params.linkId);
      const [{ team: sourceTeam, snapshot, agentsById }, target] = await Promise.all([sourceTeamSnapshotForLink(link), containerFor(request.params.targetId)]);
      const targetTeam = await target.teamService.get(link.targetEntityId).catch(() => undefined);
      if (!targetTeam) throw new RouteError(404, `Target team no longer exists: ${link.targetEntityId}`);

      const sourceMemberIds = [...new Set([sourceTeam.lead_agent_id, ...sourceTeam.members.map((member) => member.agent_id)])];
      const sourceMembers = sourceMemberIds.map((agentId) => {
        const agent = agentsById.get(agentId);
        if (!agent) throw new RouteError(409, `Source team ${sourceTeam.id} references a missing agent: ${agentId}`);
        return agent;
      });
      const targetAgentIds = await ensureTargetAgents(link.sourceWorkspaceId, request.params.targetId, sourceMembers, target, {});
      const desiredMemberIds = new Set(sourceTeam.members.map((member) => targetAgentIds.get(member.agent_id)).filter((id): id is string => Boolean(id)));
      const desiredLeadId = targetAgentIds.get(sourceTeam.lead_agent_id);
      if (!desiredLeadId) throw new RouteError(409, `Could not map source team lead: ${sourceTeam.lead_agent_id}`);

      const currentMemberIds = new Set(targetTeam.members.map((member) => member.agent_id));
      const addedMemberIds = [...desiredMemberIds].filter((id) => !currentMemberIds.has(id));
      const removedMemberIds = [...currentMemberIds].filter((id) => !desiredMemberIds.has(id));
      for (const agentId of addedMemberIds) await target.teamService.join(targetTeam.id, agentId);
      if (targetTeam.lead_agent_id !== desiredLeadId) await target.teamService.setLead(targetTeam.id, desiredLeadId);
      for (const agentId of removedMemberIds) await target.teamService.leave(targetTeam.id, agentId);

      const previous = link.lastSyncedSnapshot as TeamSnapshot;
      const manualOnlyDiff = (['name', 'description', 'config'] as const).flatMap((field) =>
        sameValue(previous[field], snapshot[field]) ? [] : [{ field, previous: previous[field], current: snapshot[field], manualOnly: true }],
      );
      const updatedLink = await registryStore.updateLinkSnapshot(link.id, snapshot);
      const team = await target.teamService.get(targetTeam.id);
      return {
        link: updatedLink,
        team,
        appliedDiff: {
          addedMemberNames: sourceMembers.filter((agent) => addedMemberIds.includes(targetAgentIds.get(agent.id) ?? '')).map((agent) => agent.name),
          removedMemberIds,
          leadChanged: targetTeam.lead_agent_id !== desiredLeadId,
        },
        manualOnlyDiff,
      };
    } catch (err) {
      if (err instanceof RouteError) return reply.code(err.statusCode).send({ error: err.message, ...err.details });
      request.log.warn({ err, targetWorkspaceId: request.params.targetId, linkId: request.params.linkId }, 'team registry sync failed');
      return reply.code(400).send({ error: (err as Error).message });
    }
  });
}
