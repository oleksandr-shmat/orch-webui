import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/server.js';

const headers = { host: '127.0.0.1:4317' };

describe('workspace routes', () => {
  let app: FastifyInstance;
  let root: string;

  beforeAll(async () => {
    app = await buildApp();
    root = realpathSync(mkdtempSync(join(tmpdir(), 'orch-webui-ws-')));
  });

  afterAll(async () => {
    await app.close();
  });

  const post = (url: string, payload?: unknown) =>
    app.inject({ method: 'POST', url, headers: { ...headers, 'content-type': 'application/json' }, payload: (payload ?? {}) as object });

  it('rejects registration without projectRoot', async () => {
    const res = await post('/api/workspaces', {});
    expect(res.statusCode).toBe(400);
  });

  it('rejects registration of a missing folder', async () => {
    const res = await post('/api/workspaces', { projectRoot: join(root, 'does-not-exist') });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/does not exist/);
  });

  it('registers a folder, reports it uninitialized, and de-duplicates', async () => {
    const first = await post('/api/workspaces', { projectRoot: root, label: 'demo' });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ projectRoot: root, label: 'demo', isInitialized: false });

    const second = await post('/api/workspaces', { projectRoot: root });
    expect(second.json().id).toBe(first.json().id);

    const list = await app.inject({ method: 'GET', url: '/api/workspaces', headers });
    expect(list.json()).toHaveLength(1);
  });

  it('refuses to activate a workspace without .orchestry/', async () => {
    const { id } = (await app.inject({ method: 'GET', url: '/api/workspaces', headers })).json()[0];
    const res = await post(`/api/workspaces/${id}/activate`);
    expect(res.statusCode).toBe(409);
  });

  it('returns 404 for unknown workspace ids', async () => {
    expect((await post('/api/workspaces/ws_nope/init')).statusCode).toBe(404);
    expect((await post('/api/workspaces/ws_nope/activate')).statusCode).toBe(404);
    const del = await app.inject({ method: 'DELETE', url: '/api/workspaces/ws_nope', headers });
    expect(del.statusCode).toBe(404);
  });

  it('forgets a registered workspace', async () => {
    const { id } = (await app.inject({ method: 'GET', url: '/api/workspaces', headers })).json()[0];
    const del = await app.inject({ method: 'DELETE', url: `/api/workspaces/${id}`, headers });
    expect(del.statusCode).toBe(204);
    const list = await app.inject({ method: 'GET', url: '/api/workspaces', headers });
    expect(list.json()).toEqual([]);
  });
});

describe('GET /api/fs/browse', () => {
  let app: FastifyInstance;
  let root: string;

  beforeAll(async () => {
    app = await buildApp();
    root = realpathSync(mkdtempSync(join(tmpdir(), 'orch-webui-browse-')));
    mkdirSync(join(root, 'beta'));
    mkdirSync(join(root, 'alpha', '.orchestry'), { recursive: true });
    writeFileSync(join(root, 'file.txt'), 'x');
  });

  afterAll(async () => {
    await app.close();
  });

  const browse = (path?: string) =>
    app.inject({ method: 'GET', url: '/api/fs/browse', query: path ? { path } : {}, headers });

  it('lists only directories, sorted, flagging .orchestry', async () => {
    const res = await browse(root);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.currentPath).toBe(root);
    expect(body.items.map((i: { name: string }) => i.name)).toEqual(['alpha', 'beta']);
    expect(body.items[0].hasOrchestry).toBe(true);
    expect(body.items[1].hasOrchestry).toBe(false);
  });

  it('exposes the parent path', async () => {
    const res = await browse(join(root, 'alpha'));
    expect(res.json().parentPath).toBe(root);
  });

  it('rejects a file path', async () => {
    const res = await browse(join(root, 'file.txt'));
    expect(res.statusCode).toBe(400);
  });

  it('rejects a missing path', async () => {
    const res = await browse(join(root, 'nope'));
    expect(res.statusCode).toBe(400);
  });
});
