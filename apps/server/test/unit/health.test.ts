import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/server.js';

describe('GET /api/health', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('reports ok without an address when the server is not listening', async () => {
    app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/health', headers: { host: '127.0.0.1' } });
    expect(res.json()).toEqual({ ok: true });
  });

  it('reports the actual listening host and port', async () => {
    app = await buildApp();
    await app.listen({ host: '127.0.0.1', port: 0 });
    const { port } = app.server.address() as AddressInfo;
    const res = await app.inject({ method: 'GET', url: '/api/health', headers: { host: '127.0.0.1' } });
    expect(res.json()).toEqual({ ok: true, host: '127.0.0.1', port });
  });
});
