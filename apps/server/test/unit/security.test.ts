import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/server.js';

describe('request guard (DNS rebinding / cross-site protection)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  const get = (headers: Record<string, string>) =>
    app.inject({ method: 'GET', url: '/api/health', headers });

  it.each(['127.0.0.1:4317', 'localhost:4317', '[::1]:4317', 'localhost'])(
    'allows loopback Host %s',
    async (host) => {
      const res = await get({ host });
      expect(res.statusCode).toBe(200);
    },
  );

  it.each(['evil.example.com', 'evil.example.com:4317', '192.168.1.10:4317', 'localhost.evil.com'])(
    'rejects non-loopback Host %s (DNS rebinding)',
    async (host) => {
      const res = await get({ host });
      expect(res.statusCode).toBe(403);
    },
  );

  it('allows loopback Origin (dev web server on another port)', async () => {
    const res = await get({ host: '127.0.0.1:4317', origin: 'http://localhost:4318' });
    expect(res.statusCode).toBe(200);
  });

  it('rejects foreign Origin on GET', async () => {
    const res = await get({ host: '127.0.0.1:4317', origin: 'https://evil.example.com' });
    expect(res.statusCode).toBe(403);
  });

  it('rejects foreign Origin on state-changing requests', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/workspaces',
      headers: { host: '127.0.0.1:4317', origin: 'https://evil.example.com', 'content-type': 'application/json' },
      payload: { projectRoot: '/tmp' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('rejects opaque Origin "null"', async () => {
    const res = await get({ host: '127.0.0.1:4317', origin: 'null' });
    expect(res.statusCode).toBe(403);
  });

  it('allows requests without Origin (curl, server-side tests)', async () => {
    const res = await get({ host: '127.0.0.1:4317' });
    expect(res.statusCode).toBe(200);
  });
});
