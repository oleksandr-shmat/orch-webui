# Contributing

Thanks for your interest! This is an early-stage project; small, focused PRs are easiest to review.

## Setup

```bash
nvm use           # reads .nvmrc; Node 22.13+ required
npm install
npm run dev       # server on :4317, web on :4318
```

You need a folder with `.orchestry/` (run `orch init` in it) to point the UI at.

## Before opening a PR

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

CI runs the same checks on Node 22, 24 and 26.

## Guidelines

- Server routes stay thin wrappers over `@oxgeneral/orch`; don't re-implement library logic.
- Never bind the server to anything but `127.0.0.1`, and don't weaken the request guard in
  `apps/server/src/security.ts`.
- Add a test for bug fixes and security-relevant changes (`apps/server/test/unit`,
  `apps/web/test/unit`).
- Code, comments and docs are in English.

See [AGENTS.md](AGENTS.md) for architecture notes.
