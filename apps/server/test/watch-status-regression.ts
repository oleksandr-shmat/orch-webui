import { execFile } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { buildApp } from '../src/server.js';
import { workspaceManager } from '../src/workspace/WorkspaceManager.js';

const execFileAsync = promisify(execFile);

/**
 * Regression: GET watch/status must reflect the same in-memory owner flag as start/stop
 * after the workspace container has been activated in this server process.
 */
async function watchStatusRegression(): Promise<void> {
  process.env.NODE_ENV = 'test';
  const app = await buildApp();
  const folder = await mkdtemp(join(tmpdir(), 'orch-watch-status-'));

  const indexUrl = import.meta.resolve('@oxgeneral/orch');
  const cliPath = join(dirname(fileURLToPath(indexUrl)), 'cli.js');
  await execFileAsync(process.execPath, [cliPath, 'init'], { cwd: folder });

  const ws = await workspaceManager.register(folder, 'watch-status-regression');

  const before = await app.inject({
    method: 'GET',
    url: `/api/workspaces/${ws.id}/orchestrator/watch/status`,
  });
  if (before.statusCode !== 200) {
    throw new Error(`status before start: ${before.statusCode} ${before.body}`);
  }
  const beforeJson = JSON.parse(before.body) as { watching: boolean };
  if (beforeJson.watching !== false) {
    throw new Error(`expected watching false before start, got ${JSON.stringify(beforeJson)}`);
  }

  const start = await app.inject({
    method: 'POST',
    url: `/api/workspaces/${ws.id}/orchestrator/watch/start`,
    headers: { 'content-type': 'application/json' },
    payload: {},
  });
  if (start.statusCode !== 200) {
    throw new Error(`start watch failed: ${start.statusCode} ${start.body}`);
  }
  const startJson = JSON.parse(start.body) as { watching: boolean };
  if (!startJson.watching) {
    throw new Error(`expected watching true after start, got ${JSON.stringify(startJson)}`);
  }

  const after = await app.inject({
    method: 'GET',
    url: `/api/workspaces/${ws.id}/orchestrator/watch/status`,
  });
  if (after.statusCode !== 200) {
    throw new Error(`status after start: ${after.statusCode} ${after.body}`);
  }
  const afterJson = JSON.parse(after.body) as { watching: boolean };
  if (!afterJson.watching) {
    throw new Error(
      `GET watch/status must return watching:true after startWatch in same process (simulates page refresh sync); got ${JSON.stringify(afterJson)}`,
    );
  }

  await app.inject({
    method: 'POST',
    url: `/api/workspaces/${ws.id}/orchestrator/watch/stop`,
    headers: { 'content-type': 'application/json' },
    payload: {},
  });

  await app.close();
  await workspaceManager.forget(ws.id);
  console.log('Watch status regression passed');
}

watchStatusRegression().catch((err) => {
  console.error(err);
  process.exit(1);
});
