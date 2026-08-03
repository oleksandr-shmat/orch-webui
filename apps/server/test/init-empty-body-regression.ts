import { buildApp } from '../src/server.js';
import { workspaceManager } from '../src/workspace/WorkspaceManager.js';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Regression: Fastify 5 rejects POST with Content-Type application/json and zero-length body.
 * UI init/watch endpoints must send `{}` (see apps/web/src/api/client.ts postJson).
 */
async function initEmptyBodyRegression(): Promise<void> {
  process.env.NODE_ENV = 'test';
  const app = await buildApp();
  const folder = await mkdtemp(join(tmpdir(), 'orch-init-body-'));
  const ws = await workspaceManager.register(folder, 'init-body-regression');

  const bad = await app.inject({
    method: 'POST',
    url: `/api/workspaces/${ws.id}/init`,
    headers: { 'content-type': 'application/json' },
    payload: undefined,
  });
  if (bad.statusCode !== 400) {
    throw new Error(`expected 400 for empty JSON body, got ${bad.statusCode}`);
  }

  const good = await app.inject({
    method: 'POST',
    url: `/api/workspaces/${ws.id}/init`,
    headers: { 'content-type': 'application/json' },
    payload: {},
  });
  if (good.statusCode !== 200) {
    throw new Error(`expected 200 for {} JSON body, got ${good.statusCode} ${good.body}`);
  }

  await app.close();
  await workspaceManager.forget(ws.id);
  console.log('Init empty-body regression passed');
}

initEmptyBodyRegression().catch((err) => {
  console.error(err);
  process.exit(1);
});
