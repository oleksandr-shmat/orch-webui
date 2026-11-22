# orch-webui

> **Status: early / alpha.** Unofficial community project, not affiliated with the authors of ORCH. Local-only by design (see [Security](#security)).

Web UI for [`@oxgeneral/orch`](https://www.npmjs.com/package/@oxgeneral/orch) (AI agent orchestrator).
Consumes it as a library (not by scraping CLI output) and mirrors the Ink TUI (`orch tui`) mental
model — Tasks / Agents / Goals / Teams / live activity — in the browser.

## Screenshots

| Tasks | Agents |
| --- | --- |
| ![Tasks board](docs/screenshots/tasks.png) | ![Agents](docs/screenshots/agents.png) |

![Goals](docs/screenshots/goals.png)

## Stack

- Monorepo, npm workspaces: `apps/server` + `apps/web`.
- `apps/server` — Node 20+, TypeScript, Fastify. Talks to `@oxgeneral/orch` as a library.
- `apps/web` — Vue 3 + Vite + PrimeVue, `@tanstack/vue-query` for REST data, Pinia for
  live-event/session state.
- No database. `@oxgeneral/orch` persists to YAML/JSON under `.orchestry/`; this app's own state
  (recent workspaces, agent/team links) persists to flat JSON under `~/.orch-webui/`.

## Requirements

- Node.js **20+** (developed against v22.12.0).
  ```bash
  nvm use 22   # or: nvm use --lts
  ```
- A project folder with `.orchestry/` (run `orch init` there first) to point the UI at.

## Install

```bash
npm install
```

Installs both workspaces (`apps/server`, `apps/web`) from the root.

## Run (development)

```bash
npm run dev
```

Runs backend + frontend together (via `concurrently`), each in its own labeled/colored log
stream. Open **http://localhost:4318**.

- Server (`apps/server`) listens on `127.0.0.1:4317` — binds to localhost only, no auth in v1,
  must never be exposed on a network interface.
- Web dev server (Vite, `apps/web`) runs on port `4318` and proxies `/api` to
  `http://127.0.0.1:4317`.
- Ports `4317`/`4318` are deliberately non-default (not `3000`/`5173`/`8080`) so this project
  doesn't collide with other local projects' dev servers running at the same time.

To run them separately instead: `npm run dev:server` / `npm run dev:web`.

### Custom server port

```bash
PORT=5000 npm run dev
```

The Vite proxy reads the same `PORT` variable, so both processes stay in sync.

## Build

```bash
npm run build              # builds both apps/server and apps/web
```

Run the built server:

```bash
npm run start -w apps/server
```

## Typecheck

```bash
npm run typecheck          # both workspaces
npm run typecheck:server
npm run typecheck:web
```

## Lint, typecheck, tests

```bash
npm run lint
npm run typecheck
npm test              # unit tests for both workspaces (Vitest)
```

Manual live scripts that run against a real `.orchestry/` folder (may start real agents):

```bash
npm run test:live:sse -w apps/server
npm run test:live:crud -w apps/server
npm run test:live:registry -w apps/server
```

## Security

This app is a **local-only** tool. The server listens on `127.0.0.1`, has no authentication, and
can browse the filesystem and spawn agent processes. It rejects requests whose `Host` or
`Origin` is not loopback (DNS-rebinding / cross-site protection). Do not expose it on a network
interface or behind a public reverse proxy.

## Notes

- Server routes are thin REST/SSE wrappers over `@oxgeneral/orch` — business logic lives in the
  library, not here.
- `orch init` for a newly-picked folder is the one operation still shelled out to the real `orch`
  CLI binary; everything else goes through the library API.
- See `AGENTS.md` for architecture notes and contributor conventions.

## License

[MIT](LICENSE)
