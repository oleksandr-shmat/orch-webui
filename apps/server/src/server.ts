import Fastify from 'fastify';
import eventsRoute from './routes/events.js';
import { workspaceManager } from './workspace/WorkspaceManager.js';

// Never bind wider than loopback — this server can spawn real agent CLI processes on the
// host and there is no auth layer in v1. See AGENTS.md safety constraint.
const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT ?? 4317);

async function main(): Promise<void> {
  await workspaceManager.load();

  const app = Fastify({ logger: true });

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

  await app.listen({ host: HOST, port: PORT });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
