import type { FastifyInstance } from 'fastify';

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Extract the hostname from a `Host` header value (`host`, `host:port`, `[::1]:port`). */
function hostnameFromHostHeader(value: string): string {
  if (value.startsWith('[')) {
    const end = value.indexOf(']');
    return end === -1 ? value : value.slice(0, end + 1);
  }
  return value.split(':')[0] ?? '';
}

function isLoopbackOrigin(origin: string): boolean {
  try {
    // URL.hostname keeps IPv6 brackets (`[::1]`), matching LOOPBACK_HOSTNAMES.
    return LOOPBACK_HOSTNAMES.has(new URL(origin).hostname);
  } catch {
    return false; // includes the opaque origin "null"
  }
}

/**
 * Binding to 127.0.0.1 keeps the network out, but not the user's own browser: any web page can
 * fire requests at localhost, and DNS rebinding lets a hostile domain resolve to 127.0.0.1.
 * This server can read the filesystem and spawn agent processes, so every request must carry a
 * loopback `Host` (defeats rebinding) and, when present, a loopback `Origin` (defeats
 * cross-site requests). Non-browser clients (curl, tests) send no `Origin` and pass.
 */
export function registerRequestGuard(app: FastifyInstance): void {
  app.addHook('onRequest', async (request, reply) => {
    const host = request.headers.host;
    if (!host || !LOOPBACK_HOSTNAMES.has(hostnameFromHostHeader(host).toLowerCase())) {
      return reply.code(403).send({ error: 'FORBIDDEN_HOST', message: 'Host header must be a loopback address' });
    }
    const origin = request.headers.origin;
    if (origin !== undefined && !isLoopbackOrigin(origin)) {
      return reply.code(403).send({ error: 'FORBIDDEN_ORIGIN', message: 'Cross-origin requests are not allowed' });
    }
  });
}
