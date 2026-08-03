import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type {
  CreateAgentInput,
  CreateTaskInput,
  TaskStatus,
} from '@oxgeneral/orch';
import { workspaceManager } from '../workspace/WorkspaceManager.js';

interface WorkspaceParams {
  id: string;
}

interface EntityParams extends WorkspaceParams {
  entityId: string;
}

const taskStatuses = new Set<TaskStatus>(['todo', 'in_progress', 'retrying', 'review', 'done', 'failed', 'cancelled']);
const goalStatuses = new Set(['active', 'paused', 'achieved', 'abandoned']);
const agentStatuses = new Set(['idle', 'running', 'error', 'disabled']);
const messageChannels = new Set(['direct', 'broadcast', 'lead']);

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null;
}

function requiredString(body: JsonRecord, key: string): string | null {
  const value = body[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function optionalString(body: JsonRecord, key: string): string | undefined {
  const value = body[key];
  return typeof value === 'string' ? value : undefined;
}

function optionalStringArray(body: JsonRecord, key: string): string[] | undefined | null {
  const value = body[key];
  if (value === undefined) return undefined;
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : null;
}

function badRequest(reply: FastifyReply, error: string) {
  return reply.code(400).send({ error });
}

async function containerFor(request: FastifyRequest<{ Params: WorkspaceParams }>, reply: FastifyReply) {
  const { id } = request.params;
  if (!workspaceManager.get(id)) {
    return { reply: reply.code(404).send({ error: `Unknown workspace: ${id}` }) };
  }
  if (!workspaceManager.isInitialized(id)) {
    return { reply: reply.code(409).send({ error: 'Workspace has no .orchestry/ — run init first' }) };
  }
  try {
    return { container: await workspaceManager.activate(id) };
  } catch (err) {
    request.log.error({ err, workspaceId: id }, 'failed to activate workspace container');
    return { reply: reply.code(500).send({ error: `Failed to activate workspace: ${(err as Error).message}` }) };
  }
}

async function withContainer(
  request: FastifyRequest<{ Params: WorkspaceParams }>,
  reply: FastifyReply,
  action: (container: Awaited<ReturnType<typeof workspaceManager.activate>>) => Promise<unknown>,
) {
  const result = await containerFor(request, reply);
  if (!result.container) return result.reply;
  try {
    return await action(result.container);
  } catch (err) {
    request.log.warn({ err, workspaceId: request.params.id }, 'ORCH service request failed');
    return reply.code(400).send({ error: (err as Error).message });
  }
}

/** Thin HTTP wrappers over public ORCH service methods. */
export default async function crudRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: WorkspaceParams }>('/api/workspaces/:id/tasks', (request, reply) =>
    withContainer(request, reply, (container) => container.taskService.list(request.query as { status?: TaskStatus; goalId?: string })),
  );
  app.get<{ Params: EntityParams }>('/api/workspaces/:id/tasks/:entityId', (request, reply) =>
    withContainer(request, reply, (container) => container.taskService.get(request.params.entityId)),
  );
  app.post<{ Params: WorkspaceParams; Body: unknown }>('/api/workspaces/:id/tasks', (request, reply) => {
    const body = asRecord(request.body);
    const title = body && requiredString(body, 'title');
    if (!body || !title) return badRequest(reply, 'title is required');
    return withContainer(request, reply, (container) => container.taskService.create(body as unknown as CreateTaskInput));
  });
  app.patch<{ Params: EntityParams; Body: unknown }>('/api/workspaces/:id/tasks/:entityId', (request, reply) => {
    const body = asRecord(request.body);
    if (!body) return badRequest(reply, 'body must be an object');
    const fields = ['title', 'description', 'priority', 'labels', 'attachments'];
    if (!Object.keys(body).some((key) => fields.includes(key))) return badRequest(reply, 'no mutable task fields provided');
    return withContainer(request, reply, (container) => container.taskService.update(request.params.entityId, body));
  });
  app.delete<{ Params: EntityParams }>('/api/workspaces/:id/tasks/:entityId', (request, reply) =>
    withContainer(request, reply, async (container) => { await container.taskService.delete(request.params.entityId); return reply.code(204).send(); }),
  );
  app.post<{ Params: EntityParams; Body: unknown }>('/api/workspaces/:id/tasks/:entityId/status', (request, reply) => {
    const body = asRecord(request.body); const status = body && requiredString(body, 'status');
    if (!status || !taskStatuses.has(status as TaskStatus)) return badRequest(reply, 'valid task status is required');
    return withContainer(request, reply, (container) => container.taskService.updateStatus(request.params.entityId, status as TaskStatus));
  });
  app.post<{ Params: EntityParams; Body: unknown }>('/api/workspaces/:id/tasks/:entityId/assign', (request, reply) => {
    const body = asRecord(request.body); const agentId = body && requiredString(body, 'agentId');
    if (!agentId) return badRequest(reply, 'agentId is required');
    return withContainer(request, reply, (container) => container.taskService.assign(request.params.entityId, agentId));
  });
  for (const action of ['cancel', 'retry'] as const) app.post<{ Params: EntityParams }>(`/api/workspaces/:id/tasks/:entityId/${action}`, (request, reply) =>
    withContainer(request, reply, (container) => container.taskService[action](request.params.entityId)),
  );
  app.post<{ Params: EntityParams; Body: unknown }>('/api/workspaces/:id/tasks/:entityId/reject', (request, reply) => {
    const body = asRecord(request.body) ?? {};
    return withContainer(request, reply, (container) => container.taskService.reject(request.params.entityId, optionalString(body, 'feedback')));
  });

  app.get<{ Params: WorkspaceParams }>('/api/workspaces/:id/agents', (request, reply) => withContainer(request, reply, (container) => container.agentService.list()));
  app.get<{ Params: EntityParams }>('/api/workspaces/:id/agents/:entityId', (request, reply) => withContainer(request, reply, (container) => container.agentService.get(request.params.entityId)));
  app.post<{ Params: WorkspaceParams; Body: unknown }>('/api/workspaces/:id/agents', (request, reply) => {
    const body = asRecord(request.body);
    if (!body || !requiredString(body, 'name') || !requiredString(body, 'adapter')) return badRequest(reply, 'name and adapter are required');
    return withContainer(request, reply, (container) => container.agentService.create(body as unknown as CreateAgentInput));
  });
  app.patch<{ Params: EntityParams; Body: unknown }>('/api/workspaces/:id/agents/:entityId', (request, reply) => {
    const body = asRecord(request.body);
    if (!body) return badRequest(reply, 'body must be an object');
    const fields = ['name', 'adapter', 'role', 'command', 'model', 'effort', 'approval_policy'];
    const update = Object.fromEntries(Object.entries(body).filter(([key]) => fields.includes(key)));
    if (!Object.keys(update).length) return badRequest(reply, 'no mutable agent fields provided');
    return withContainer(request, reply, (container) => container.agentService.update(request.params.entityId, update));
  });
  app.delete<{ Params: EntityParams }>('/api/workspaces/:id/agents/:entityId', (request, reply) => withContainer(request, reply, async (container) => { await container.agentService.remove(request.params.entityId); return reply.code(204).send(); }));
  for (const action of ['disable', 'enable'] as const) app.post<{ Params: EntityParams }>(`/api/workspaces/:id/agents/:entityId/${action}`, (request, reply) => withContainer(request, reply, (container) => container.agentService[action](request.params.entityId)));
  app.post<{ Params: EntityParams; Body: unknown }>('/api/workspaces/:id/agents/:entityId/autonomous', (request, reply) => {
    const body = asRecord(request.body);
    const enabled = body?.enabled;
    if (typeof enabled !== 'boolean') return badRequest(reply, 'enabled boolean is required');
    return withContainer(request, reply, (container) => container.agentService.setAutonomous(request.params.entityId, enabled));
  });
  app.post<{ Params: EntityParams; Body: unknown }>('/api/workspaces/:id/agents/:entityId/status', (request, reply) => {
    const body = asRecord(request.body); const status = body && requiredString(body, 'status');
    if (!status || !agentStatuses.has(status)) return badRequest(reply, 'valid agent status is required');
    return withContainer(request, reply, (container) => container.agentService.setStatus(request.params.entityId, status as 'idle' | 'running' | 'error' | 'disabled'));
  });

  app.get<{ Params: WorkspaceParams }>('/api/workspaces/:id/goals', (request, reply) => withContainer(request, reply, (container) => container.goalService.list(request.query as { status?: never })));
  app.get<{ Params: EntityParams }>('/api/workspaces/:id/goals/:entityId', (request, reply) => withContainer(request, reply, (container) => container.goalService.get(request.params.entityId)));
  app.post<{ Params: WorkspaceParams; Body: unknown }>('/api/workspaces/:id/goals', (request, reply) => { const body = asRecord(request.body); if (!body || !requiredString(body, 'title')) return badRequest(reply, 'title is required'); return withContainer(request, reply, (container) => container.goalService.create(body as { title: string; description?: string; assignee?: string })); });
  app.patch<{ Params: EntityParams; Body: unknown }>('/api/workspaces/:id/goals/:entityId', (request, reply) => { const body = asRecord(request.body); if (!body) return badRequest(reply, 'body must be an object'); return withContainer(request, reply, (container) => container.goalService.update(request.params.entityId, body)); });
  app.delete<{ Params: EntityParams }>('/api/workspaces/:id/goals/:entityId', (request, reply) => withContainer(request, reply, async (container) => { await container.goalService.delete(request.params.entityId); return reply.code(204).send(); }));
  app.post<{ Params: EntityParams; Body: unknown }>('/api/workspaces/:id/goals/:entityId/status', (request, reply) => { const body = asRecord(request.body); const status = body && requiredString(body, 'status'); if (!status || !goalStatuses.has(status)) return badRequest(reply, 'valid goal status is required'); return withContainer(request, reply, (container) => container.goalService.updateStatus(request.params.entityId, status as 'active' | 'paused' | 'achieved' | 'abandoned', typeof body?.force === 'boolean' ? { force: body.force } : undefined)); });
  app.get<{ Params: EntityParams }>('/api/workspaces/:id/goals/:entityId/tasks', (request, reply) => withContainer(request, reply, (container) => container.goalService.listTasksForGoal(request.params.entityId)));
  app.get<{ Params: EntityParams }>('/api/workspaces/:id/goals/:entityId/progress', (request, reply) => withContainer(request, reply, (container) => container.goalService.getProgressReport(request.params.entityId)));

  app.get<{ Params: WorkspaceParams }>('/api/workspaces/:id/teams', (request, reply) => withContainer(request, reply, (container) => container.teamService.list()));
  app.get<{ Params: EntityParams }>('/api/workspaces/:id/teams/:entityId', (request, reply) => withContainer(request, reply, (container) => container.teamService.get(request.params.entityId)));
  app.post<{ Params: WorkspaceParams; Body: unknown }>('/api/workspaces/:id/teams', (request, reply) => { const body = asRecord(request.body); if (!body || !requiredString(body, 'name') || !requiredString(body, 'lead_agent_id')) return badRequest(reply, 'name and lead_agent_id are required'); return withContainer(request, reply, (container) => container.teamService.create(body as { name: string; description?: string; lead_agent_id: string; member_agent_ids?: string[]; config?: { auto_claim: boolean } })); });
  app.delete<{ Params: EntityParams }>('/api/workspaces/:id/teams/:entityId', (request, reply) => withContainer(request, reply, async (container) => { await container.teamService.disband(request.params.entityId); return reply.code(204).send(); }));
  for (const action of ['join', 'leave', 'add-task', 'remove-task', 'lead'] as const) app.post<{ Params: EntityParams; Body: unknown }>(`/api/workspaces/:id/teams/:entityId/${action}`, (request, reply) => { const body = asRecord(request.body); const key = action.includes('task') ? 'taskId' : 'agentId'; const value = body && requiredString(body, key); if (!value) return badRequest(reply, `${key} is required`); return withContainer(request, reply, (container) => action === 'join' ? container.teamService.join(request.params.entityId, value) : action === 'leave' ? container.teamService.leave(request.params.entityId, value) : action === 'add-task' ? container.teamService.addTask(request.params.entityId, value) : action === 'remove-task' ? container.teamService.removeTask(request.params.entityId, value) : container.teamService.setLead(request.params.entityId, value)); });

  app.get<{ Params: WorkspaceParams }>('/api/workspaces/:id/messages', (request, reply) => withContainer(request, reply, (container) => container.messageService.listAll()));
  app.get<{ Params: EntityParams }>('/api/workspaces/:id/agents/:entityId/messages', (request, reply) => withContainer(request, reply, (container) => container.messageService.listForAgent(request.params.entityId)));
  app.post<{ Params: WorkspaceParams; Body: unknown }>('/api/workspaces/:id/messages', (request, reply) => { const body = asRecord(request.body); const channel = body && requiredString(body, 'channel'); if (!body || !channel || !messageChannels.has(channel) || !requiredString(body, 'from_agent_id') || !requiredString(body, 'subject') || !requiredString(body, 'body')) return badRequest(reply, 'valid channel, from_agent_id, subject and body are required'); return withContainer(request, reply, (container) => container.messageService.send(body as { channel: 'direct' | 'broadcast' | 'lead'; from_agent_id: string; to_agent_id?: string; subject: string; body: string; ttl_ms?: number; team_id?: string; reply_to?: string })); });

  app.get<{ Params: WorkspaceParams }>('/api/workspaces/:id/runs', (request, reply) => withContainer(request, reply, (container) => container.runService.listAll()));
  app.get<{ Params: EntityParams }>('/api/workspaces/:id/runs/:entityId', (request, reply) => withContainer(request, reply, async (container) => { const run = await container.runService.get(request.params.entityId); if (!run) return reply.code(404).send({ error: `Run not found: ${request.params.entityId}` }); return run; }));
  app.get<{ Params: EntityParams }>('/api/workspaces/:id/tasks/:entityId/runs', (request, reply) => withContainer(request, reply, (container) => container.runService.listForTask(request.params.entityId)));
  app.get<{ Params: EntityParams }>('/api/workspaces/:id/agents/:entityId/runs', (request, reply) => withContainer(request, reply, (container) => container.runService.listForAgent(request.params.entityId)));
  app.get<{ Params: EntityParams }>('/api/workspaces/:id/runs/:entityId/events', (request, reply) => withContainer(request, reply, (container) => container.runService.readEvents(request.params.entityId)));
  app.get<{ Params: EntityParams }>('/api/workspaces/:id/runs/:entityId/events/tail', (request, reply) => { const count = Number((request.query as { count?: string }).count ?? 100); if (!Number.isInteger(count) || count < 1 || count > 1000) return badRequest(reply, 'count must be an integer from 1 to 1000'); return withContainer(request, reply, (container) => container.runService.readEventsTail(request.params.entityId, count)); });
}
