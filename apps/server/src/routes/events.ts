import type { FastifyInstance } from 'fastify';
import type { OrchestratorEvent } from '@oxgeneral/orch';
import { workspaceManager } from '../workspace/WorkspaceManager.js';

interface WorkspaceParams {
  id: string;
}

/**
 * GET /api/workspaces/:id/events — Server-Sent Events stream of the workspace's live
 * `OrchestratorEvent` union (task:*, agent:*, run:retry, orchestrator:*, workspace:*, goal:*,
 * team:*, message:*), sourced from `container.eventBus.onAny()`.
 *
 * SSE over WebSocket: only server->client push is needed here (mutations happen via REST POST
 * from other routes), and `EventSource` gives free browser auto-reconnect — see AGENTS.md /
 * memory file Decisions.
 */
export default async function eventsRoute(app: FastifyInstance): Promise<void> {
  app.get<{ Params: WorkspaceParams }>('/api/workspaces/:id/events', async (request, reply) => {
    const { id } = request.params;

    if (!workspaceManager.get(id)) {
      return reply.code(404).send({ error: `Unknown workspace: ${id}` });
    }
    if (!workspaceManager.isInitialized(id)) {
      return reply.code(409).send({ error: 'Workspace has no .orchestry/ — run init first' });
    }

    let container;
    try {
      container = await workspaceManager.activate(id);
    } catch (err) {
      request.log.error({ err, workspaceId: id }, 'failed to activate workspace container');
      return reply.code(500).send({ error: `Failed to activate workspace: ${(err as Error).message}` });
    }

    // Hijack the response so Fastify doesn't attempt its own reply lifecycle (serialization,
    // default headers, auto-close) on top of the raw stream we manage by hand below.
    reply.hijack();
    const res = reply.raw;

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // disable nginx buffering if ever proxied
    });
    res.write(':ok\n\n'); // opening comment — flushes headers, gives EventSource an immediate byte

    const send = (event: OrchestratorEvent): void => {
      // SSE `event:` field lets clients do `source.addEventListener(event.type, ...)`;
      // `data:` carries the full typed payload as JSON for clients that just want onmessage.
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    };

    const unsubscribe = container.eventBus.onAny(send);

    // Keep intermediary proxies/load balancers from timing out an idle SSE connection.
    const heartbeat = setInterval(() => {
      res.write(':heartbeat\n\n');
    }, 30_000);

    const cleanup = (): void => {
      clearInterval(heartbeat);
      unsubscribe();
    };

    request.raw.on('close', cleanup);
    request.raw.on('error', cleanup);
  });
}
