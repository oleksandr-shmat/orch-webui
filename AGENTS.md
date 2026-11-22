# AGENTS.md — orch-webui

Web UI for [`@oxgeneral/orch`](https://www.npmjs.com/package/@oxgeneral/orch) (AI agent
orchestrator). It consumes ORCH as a **library**, not by scraping CLI output, and mirrors the
Ink TUI (`orch tui`) mental model — Tasks / Agents / Goals / Teams / live activity — in a browser.

## Stack

- Monorepo, npm workspaces: `apps/server` + `apps/web`.
- `apps/server`: Node 20+, TypeScript, Fastify. Depends on `@oxgeneral/orch` as a library.
- `apps/web`: Vue 3 (`<script setup>` + TS), Vite, PrimeVue, `@tanstack/vue-query` for REST data,
  Pinia for live-event/session state.
- **No database.** ORCH persists to YAML/JSON under `.orchestry/`. This app's own state (recent
  workspaces, agent/team links) lives in flat JSON under `~/.orch-webui/`
  (override with `ORCH_WEBUI_STATE_DIR`).

## Commands

| Task | Command |
| --- | --- |
| Install | `npm install` |
| Dev (both) | `npm run dev` |
| Lint | `npm run lint` |
| Typecheck | `npm run typecheck` |
| Unit tests | `npm test` |
| Build | `npm run build` |

Live scripts (`npm run test:live:* -w apps/server`) exercise the server against a real
`.orchestry/` folder and may start real agent processes. They are manual and not part of CI.

## Conventions

- Server routes are thin REST/SSE wrappers over `@oxgeneral/orch` services — do not duplicate
  business logic the library already provides.
- Import `@oxgeneral/orch` only through its public exports (`buildFullContainer`, service
  classes, `EventBus`, domain types). Never deep-import `dist/*`. The one exception: `orch init`
  for a newly picked folder is CLI-only, so it is run by spawning the `orch` CLI shipped inside
  the package with `cwd` = target folder.
- `AgentService.update()` silently ignores fields outside
  `{ name, adapter, role, command, model, effort, approval_policy }`. `skills`, `env`,
  `max_turns`, `timeout_ms`, `stall_timeout_ms`, `system_prompt` and `workspace_mode` are
  create-time only. `TeamService` has no `update()`.
- SSE (`EventSource`), not WebSocket, for the live activity feed; actions go through REST.
- Web code: check `apps/web/src/composables` and existing components before introducing a new
  pattern. Design tokens live in `apps/web/src/theme/tokens.ts` (see `apps/web/DESIGN.md`).

## Security constraints

- The server binds to `127.0.0.1` only. **Never** change this to `0.0.0.0`: there is no auth
  and the server can read the filesystem and spawn agent processes on the host.
- Every request must pass the guard in `apps/server/src/security.ts` (loopback `Host`, and a
  loopback `Origin` when present). This blocks DNS rebinding and cross-site requests from
  other web pages. Do not weaken or bypass it.

## Testing notes

- Server unit tests use Fastify `app.inject()` with an isolated state dir
  (`apps/server/test/unit/setup.ts`) — they never touch the real `~/.orch-webui`.
- Add a failing test first for bug fixes and security-relevant changes.
