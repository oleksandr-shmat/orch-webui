import Fastify, { type FastifyInstance } from 'fastify';
import eventsRoute from './routes/events.js';
import crudRoutes from './routes/crud.js';
import orchestratorRoute from './routes/orchestrator.js';
import registryRoutes from './routes/registry.js';
import { registryStore } from './registry/RegistryStore.js';
import { workspaceManager } from './workspace/WorkspaceManager.js';
import { registerRequestGuard } from './security.js';

// Never bind wider than loopback — this server can spawn real agent CLI processes on the
// host and there is no auth layer in v1. See AGENTS.md safety constraint.
const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT ?? 4317);

function workspaceResponse(id: string) {
  const workspace = workspaceManager.get(id);
  if (!workspace) return undefined;
  return { ...workspace, isInitialized: workspaceManager.isInitialized(id) };
}

export async function buildApp(): Promise<FastifyInstance> {
  await workspaceManager.load();
  await registryStore.load();

  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' });

  registerRequestGuard(app);

  // Reports the address the server actually listens on (absent until listening, e.g. in tests).
  app.get('/api/health', async () => {
    const address = app.server.address();
    return address && typeof address === 'object'
      ? { ok: true, host: address.address, port: address.port }
      : { ok: true };
  });

  app.get('/api/workspaces', async () => workspaceManager.list().map((workspace) => ({
    ...workspace,
    isInitialized: workspaceManager.isInitialized(workspace.id),
  })));

  app.post<{ Body: { projectRoot: string; label?: string } }>('/api/workspaces', async (request, reply) => {
    const { projectRoot, label } = request.body;
    if (!projectRoot) {
      return reply.code(400).send({ error: 'projectRoot is required' });
    }
    try {
      const record = await workspaceManager.register(projectRoot, label);
      return workspaceResponse(record.id);
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  app.delete<{ Params: { id: string } }>('/api/workspaces/:id', async (request, reply) => {
    if (!workspaceManager.get(request.params.id)) {
      return reply.code(404).send({ error: `Unknown workspace: ${request.params.id}` });
    }
    await workspaceManager.forget(request.params.id);
    return reply.code(204).send();
  });

  app.post<{ Params: { id: string } }>('/api/workspaces/:id/init', async (request, reply) => {
    if (!workspaceManager.get(request.params.id)) {
      return reply.code(404).send({ error: `Unknown workspace: ${request.params.id}` });
    }
    try {
      const { alreadyInitialized } = await workspaceManager.initialize(request.params.id);
      return { success: true, alreadyInitialized, workspace: workspaceResponse(request.params.id) };
    } catch (error) {
      request.log.error({ err: error, workspaceId: request.params.id }, 'failed to initialize workspace');
      return reply.code(500).send({
        error: 'WORKSPACE_INIT_FAILED',
        message: error instanceof Error ? error.message : 'Unknown workspace initialization error',
      });
    }
  });

  app.post<{ Params: { id: string } }>('/api/workspaces/:id/activate', async (request, reply) => {
    if (!workspaceManager.get(request.params.id)) {
      return reply.code(404).send({ error: `Unknown workspace: ${request.params.id}` });
    }
    if (!workspaceManager.isInitialized(request.params.id)) {
      return reply.code(409).send({ error: 'Workspace has no .orchestry/ — run init first' });
    }
    try {
      await workspaceManager.activate(request.params.id);
      return { activated: true, workspace: workspaceResponse(request.params.id) };
    } catch (error) {
      request.log.error({ err: error, workspaceId: request.params.id }, 'failed to activate workspace');
      return reply.code(500).send({
        error: 'WORKSPACE_ACTIVATION_FAILED',
        message: error instanceof Error ? error.message : 'Unknown workspace activation error',
      });
    }
  });

  app.get<{ Querystring: { path?: string } }>('/api/fs/browse', async (request, reply) => {
    try {
      return await workspaceManager.browseDirectory(request.query.path);
    } catch (error) {
      return reply.code(400).send({
        error: 'DIRECTORY_BROWSE_FAILED',
        message: error instanceof Error ? error.message : 'Unable to browse directory',
      });
    }
  });

  await app.register(eventsRoute);
  await app.register(crudRoutes);
  await app.register(orchestratorRoute);
  await app.register(registryRoutes);

  return app;
}

export async function startServer(): Promise<FastifyInstance> {
  const app = await buildApp();
  await app.listen({ host: HOST, port: PORT });
  return app;
}

const isMainModule = process.argv[1] && (process.argv[1].endsWith('server.ts') || process.argv[1].endsWith('server.js'));
if (isMainModule) {
  startServer().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

