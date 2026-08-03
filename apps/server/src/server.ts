import Fastify, { type FastifyInstance } from 'fastify';
import eventsRoute from './routes/events.js';
import crudRoutes from './routes/crud.js';
import { workspaceManager } from './workspace/WorkspaceManager.js';

// Never bind wider than loopback — this server can spawn real agent CLI processes on the
// host and there is no auth layer in v1. See AGENTS.md safety constraint.
const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT ?? 4317);

export async function buildApp(): Promise<FastifyInstance> {
  await workspaceManager.load();

  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' });

  app.get('/api/health', async () => ({ ok: true }));

  // Minimal stand-in for workspace registration/listing so the SSE route below is reachable
  // end-to-end. Full lifecycle (init/activate/forget, validation, fs browse) is its own task
  // ("Server REST: workspace lifecycle routes") — this is intentionally not that surface.
  app.get('/api/workspaces', async () => workspaceManager.list());

  app.post<{ Body: { projectRoot: string; label?: string } }>('/api/workspaces', async (request, reply) => {
    const { projectRoot, label } = request.body;
    if (!projectRoot) {
      return reply.code(400).send({ error: 'projectRoot is required' });
    }
    try {
      const record = await workspaceManager.register(projectRoot, label);
      return record;
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  await app.register(eventsRoute);
  await app.register(crudRoutes);

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

