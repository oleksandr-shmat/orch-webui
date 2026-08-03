import { OrchestryError } from '@oxgeneral/orch';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { workspaceManager } from '../workspace/WorkspaceManager.js';

interface WorkspaceParams {
  id: string;
}

interface TaskParams extends WorkspaceParams {
  taskId: string;
}

interface AgentParams extends WorkspaceParams {
  agentId: string;
}

function sendOrchestratorError(
  request: FastifyRequest,
  reply: FastifyReply,
  error: unknown,
): FastifyReply {
  if (error instanceof OrchestryError && error.exitCode === 4) {
    return reply.code(409).send({
      error: 'ORCHESTRATOR_LOCKED',
      message: error.message,
      hint: error.hint,
    });
  }

  request.log.error({ err: error }, 'orchestrator operation failed');
  return reply.code(500).send({
    error: 'ORCHESTRATOR_OPERATION_FAILED',
    message: error instanceof Error ? error.message : 'Unknown orchestrator error',
  });
}

async function getContainer(
  request: FastifyRequest<{ Params: WorkspaceParams }>,
  reply: FastifyReply,
) {
  const { id } = request.params;
  if (!workspaceManager.get(id)) {
    return reply.code(404).send({ error: `Unknown workspace: ${id}` });
  }
  if (!workspaceManager.isInitialized(id)) {
    return reply.code(409).send({ error: 'Workspace has no .orchestry/ — run init first' });
  }

  try {
    return await workspaceManager.activate(id);
  } catch (error) {
    request.log.error({ err: error, workspaceId: id }, 'failed to activate workspace container');
    return reply.code(500).send({
      error: 'WORKSPACE_ACTIVATION_FAILED',
      message: error instanceof Error ? error.message : 'Unknown workspace activation error',
    });
  }
}

/**
 * REST controls for the live ORCH instance in a registered workspace.
 *
 * The routes deliberately delegate all scheduling, task state and process management to ORCH's
 * public `Container.orchestrator`; this layer only validates the workspace and maps errors to HTTP.
 */
export default async function orchestratorRoute(app: FastifyInstance): Promise<void> {
  app.get<{ Params: WorkspaceParams }>('/api/workspaces/:id/orchestrator/watch/status', async (request, reply) => {
    const { id } = request.params;
    if (!workspaceManager.get(id)) {
      return reply.code(404).send({ error: `Unknown workspace: ${id}` });
    }

    return { watching: workspaceManager.getActiveContainer(id)?.orchestrator.isOwner ?? false };
  });

  app.post<{ Params: WorkspaceParams }>('/api/workspaces/:id/orchestrator/watch/start', async (request, reply) => {
    const container = await getContainer(request, reply);
    if (!container) return reply;

    if (container.orchestrator.isOwner) {
      return { watching: true, alreadyWatching: true };
    }

    try {
      await container.orchestrator.startWatch();
      return { watching: true, alreadyWatching: false };
    } catch (error) {
      return sendOrchestratorError(request, reply, error);
    }
  });

  app.post<{ Params: WorkspaceParams }>('/api/workspaces/:id/orchestrator/watch/stop', async (request, reply) => {
    const container = await getContainer(request, reply);
    if (!container) return reply;

    if (!container.orchestrator.isOwner) {
      return { watching: false, alreadyStopped: true };
    }

    try {
      await container.orchestrator.stop();
      return { watching: false, alreadyStopped: false };
    } catch (error) {
      return sendOrchestratorError(request, reply, error);
    }
  });

  app.post<{ Params: TaskParams }>('/api/workspaces/:id/orchestrator/tasks/:taskId/run', async (request, reply) => {
    const container = await getContainer(request, reply);
    if (!container) return reply;

    try {
      await container.orchestrator.runTask(request.params.taskId);
      return { accepted: true, taskId: request.params.taskId };
    } catch (error) {
      return sendOrchestratorError(request, reply, error);
    }
  });

  app.post<{ Params: WorkspaceParams }>('/api/workspaces/:id/orchestrator/run-all', async (request, reply) => {
    const container = await getContainer(request, reply);
    if (!container) return reply;

    try {
      await container.orchestrator.runAll();
      return { accepted: true };
    } catch (error) {
      return sendOrchestratorError(request, reply, error);
    }
  });

  app.post<{ Params: TaskParams }>('/api/workspaces/:id/orchestrator/tasks/:taskId/cancel', async (request, reply) => {
    const container = await getContainer(request, reply);
    if (!container) return reply;

    try {
      await container.orchestrator.cancelTask(request.params.taskId);
      return { cancelled: true, taskId: request.params.taskId };
    } catch (error) {
      return sendOrchestratorError(request, reply, error);
    }
  });

  app.post<{ Params: AgentParams }>('/api/workspaces/:id/orchestrator/agents/:agentId/force-stop', async (request, reply) => {
    const container = await getContainer(request, reply);
    if (!container) return reply;

    try {
      await container.orchestrator.forceStopAgent(request.params.agentId);
      return { stopped: true, agentId: request.params.agentId };
    } catch (error) {
      return sendOrchestratorError(request, reply, error);
    }
  });

  app.get<{ Params: WorkspaceParams }>('/api/workspaces/:id/orchestrator/doctor', async (request, reply) => {
    const container = await getContainer(request, reply);
    if (!container) return reply;

    try {
      return await container.doctorService.runAll();
    } catch (error) {
      return sendOrchestratorError(request, reply, error);
    }
  });
}
