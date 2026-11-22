# Security policy

## Scope and threat model

orch-webui is a **local-only** tool. The server binds to `127.0.0.1`, has no authentication, can
browse the local filesystem, and can start agent processes through `@oxgeneral/orch`. It must
never be exposed on a network interface or behind a public reverse proxy.

To protect against the user's own browser being used as an attack vector, the server rejects any
request whose `Host` header is not a loopback address (DNS rebinding) or whose `Origin` header is
not a loopback origin (cross-site requests). See `apps/server/src/security.ts`.

## Reporting a vulnerability

Please report vulnerabilities privately through
[GitHub private vulnerability reporting](https://github.com/oleksandr-shmat/orch-webui/security/advisories/new)
rather than a public issue. Include steps to reproduce and the affected version or commit.
You can expect an initial response within a few days.

Issues in `@oxgeneral/orch` itself should be reported to that project.
