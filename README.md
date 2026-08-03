# orch-webui

Web UI for [`@oxgeneral/orch`](https://www.npmjs.com/package/@oxgeneral/orch) (AI agent orchestrator).
Consumes it as a library (not by scraping CLI output) and mirrors the Ink TUI (`orch tui`) mental
model — Tasks / Agents / Goals / Teams / live activity — in the browser.

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
PORT=5000 npm run dev:server
```

If you change `PORT`, also update the proxy target in `apps/web/vite.config.ts` (`server.proxy['/api'].target`) —
it is not itself affected by the `PORT` env var.

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

## Tests

No unified test suite yet — a handful of live scripts exercise the server against a real
`.orchestry/` folder:

```bash
npm run test:sse -w apps/server
npm run test:crud -w apps/server
npm run test:registry -w apps/server
npm run test:team-registry -w apps/server
npm run test:checklist -w apps/server
npm run test:init-body -w apps/server
```

`apps/web` has a Playwright config (`apps/web/playwright.config.ts`) for browser tests.

## Notes

- Server routes are thin REST/SSE wrappers over `@oxgeneral/orch` — business logic lives in the
  library, not here.
- `orch init` for a newly-picked folder is the one operation still shelled out to the real `orch`
  CLI binary; everything else goes through the library API.
- See `AGENTS.md` for architecture details, library API surface, and known orchestrator quirks.
