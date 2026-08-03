import http from 'node:http';
import { buildApp } from '../src/server.js';
import { workspaceManager } from '../src/workspace/WorkspaceManager.js';
import type { TaskCreatedEvent, AgentStatusChangedEvent } from '@oxgeneral/orch';

async function runSseSmokeTest(): Promise<void> {
  console.log('--- Starting SSE Smoke Test ---');

  process.env.NODE_ENV = 'test';
  const app = await buildApp();

  const address = await app.listen({ host: '127.0.0.1', port: 0 });
  console.log(`[1] Fastify server listening on ${address}`);

  // Register local workspace folder with existing .orchestry
  const projectRoot = '~';
  const record = await workspaceManager.register(projectRoot, 'orch-webui-test');
  console.log(`[2] Workspace registered: id=${record.id}, root=${record.projectRoot}`);

  // Ensure container is activated
  const container = await workspaceManager.activate(record.id);
  console.log(`[3] Workspace container activated`);

  // Open HTTP GET request to /api/workspaces/:id/events
  const eventsUrl = `${address}/api/workspaces/${record.id}/events`;
  console.log(`[4] Connecting to SSE stream at ${eventsUrl}`);

  const eventsReceived: Array<{ eventType?: string; data?: any; raw: string }> = [];
  let isOkReceived = false;

  await new Promise<void>((resolve, reject) => {
    const req = http.get(eventsUrl, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Unexpected status code: ${res.statusCode}`));
        return;
      }
      if (res.headers['content-type'] !== 'text/event-stream') {
        reject(new Error(`Unexpected content-type: ${res.headers['content-type']}`));
        return;
      }

      let buffer = '';

      res.on('data', (chunk: Buffer) => {
        const str = chunk.toString('utf-8');
        buffer += str;

        if (buffer.includes(':ok\n\n') && !isOkReceived) {
          isOkReceived = true;
          console.log('[5] Opening comment :ok\\n\\n received from SSE stream');

          // Once opening comment is received, emit events on eventBus
          setTimeout(() => {
            console.log('[6] Emitting test events on container.eventBus...');
            const sampleTaskEvent: TaskCreatedEvent = {
              type: 'task:created',
              task: {
                id: 'tsk_smoke_test_1',
                title: 'Smoke Test Task',
                status: 'todo',
                priority: 2,
                createdAt: new Date().toISOString(),
              } as any,
            };

            const sampleAgentEvent: AgentStatusChangedEvent = {
              type: 'agent:status_changed',
              agentId: 'agt_3V1_LbH',
              status: 'running',
              previousStatus: 'idle',
            };

            container.eventBus.emit(sampleTaskEvent);
            container.eventBus.emit(sampleAgentEvent);
          }, 100);
        }

        // Parse SSE blocks (separated by \n\n)
        const parts = buffer.split('\n\n');
        // Keep unfinished part in buffer
        buffer = parts.pop() ?? '';

        for (const part of parts) {
          if (!part.trim() || part.startsWith(':')) continue; // Skip comments/heartbeats

          const lines = part.split(/\r?\n/);
          let eventType: string | undefined;
          let dataStr: string | undefined;

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('event:')) {
              eventType = trimmed.slice(6).trim();
            } else if (trimmed.startsWith('data:')) {
              dataStr = trimmed.slice(5).trim();
            }
          }

          if (eventType && dataStr) {
            try {
              const data = JSON.parse(dataStr);
              eventsReceived.push({ eventType, data, raw: part });
              console.log(`[7] SSE event received successfully: type="${eventType}" data.type="${data.type}"`);
            } catch (err) {
              console.error('Failed to parse SSE data JSON:', dataStr);
            }
          }
        }

        // Check if both test events have been received
        if (eventsReceived.length >= 2) {
          console.log('[8] Received all expected test events successfully!');
          res.destroy();
          req.destroy();
          resolve();
        }
      });

      res.on('error', (err: any) => {
        if (eventsReceived.length >= 2 || err.code === 'ECONNRESET' || err.message === 'aborted') return;
        console.error('Response stream error:', err);
      });
    });

    req.on('error', (err) => {
      // Ignore socket destroyed error when we explicitly abort/destroy
      if (eventsReceived.length >= 2) return;
      reject(err);
    });

    // Timeout safety
    setTimeout(() => {
      if (eventsReceived.length < 2) {
        req.destroy();
        reject(new Error(`Timeout: Received ${eventsReceived.length} events (expected 2)`));
      }
    }, 5000);
  });

  // Verify events data content
  const taskEvt = eventsReceived.find((e) => e.eventType === 'task:created');
  const agentEvt = eventsReceived.find((e) => e.eventType === 'agent:status_changed');

  if (!taskEvt || taskEvt.data.task.id !== 'tsk_smoke_test_1') {
    throw new Error('Task created event verification failed!');
  }
  if (!agentEvt || agentEvt.data.agentId !== 'agt_3V1_LbH') {
    throw new Error('Agent status changed event verification failed!');
  }

  console.log('[9] Closing server...');
  await app.close();

  console.log('✅ SSE SMOKE TEST PASSED SUCCESSFULLY!');
}

runSseSmokeTest().catch((err) => {
  console.error('❌ SSE SMOKE TEST FAILED:', err);
  process.exit(1);
});
