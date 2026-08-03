import type { Agent, Container, CreateAgentInput } from '@oxgeneral/orch';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { registryStore } from '../registry/RegistryStore.js';
import { workspaceManager } from '../workspace/WorkspaceManager.js';

interface TargetParams {
  targetId: string;
}

type JsonRecord = Record<string, unknown>;

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

/** App-level, manual one-way registry routes. No automatic synchronization occurs here. */
export default async function registryRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: TargetParams }>('/api/workspaces/:targetId/registry/links', async (request) =>
    registryStore.listLinks(request.params.targetId));

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
}
