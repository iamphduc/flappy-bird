# Codebase structure

> High-level overview only — what the system is and how its parts fit. No file lists or deep directory trees: those change every sprint, and agents read the code for detail. Name a path only for a part's top-level folder.

The **`## Smoke recipe`** below tells each engineer how to bring the app up for browser verification (per `pod:engineer`'s instructions).

**Status: skeleton only.** The parts below exist and run, but hold placeholders. The real game, recording and stats arrive with plan `flappy-efficiency-mvp` (`docs/plans/`).

## What it is

A browser Flappy Bird game. Each flap is streamed to a backend, which replays the game and shows each player how efficient their play is, per game and over time.

## Parts

- **`packages/engine`** — shared, deterministic game engine (fixed 60 steps/s, seeded pipes). Pure TypeScript, no DOM or Node APIs, so both the client and the server can run it.
- **`apps/client`** — Vite + plain HTML canvas game. Talks to the server through the Vite dev proxy (`/api`).
- **`apps/server`** — Node + Fastify API. SQLite storage and WebSocket game sessions are planned, not built yet.

## How they connect

Client and server both import `@flappy/engine` as TypeScript source (workspace package, no build step). In dev the client calls `/api/*` on its own origin, and Vite forwards it to the server. The server replays inputs with the engine to get trusted results.

## Stack & conventions

- TypeScript everywhere, ESM, `strict` + `noUncheckedIndexedAccess`. Imports inside a package use the `.ts` extension.
- pnpm workspaces (`apps/*`, `packages/*`), Node ≥ 22 (`.nvmrc`: 22).
- Tests: Vitest, next to the code (`*.test.ts`). Server routes are tested with Fastify `inject`, with no real port.
- Server app is built by `buildApp()` (in `app.ts`), kept apart from `main.ts` (which listens) so tests can build it without a port.
- Ports come from env: `WEB_PORT` (default 3000) and `API_PORT` (default 3001).

## CI

GitHub Actions `.github/workflows/pod-ci.yml`, on `pull_request` and on `push` to `main`:
- **verify** — pnpm install, then `pnpm check`.
- **secrets** — gitleaks over full history (free for personal repos; an org repo needs a `GITLEAKS_LICENSE` secret).

Not running yet: the repo has no GitHub remote so far.

## Key docs

- `docs/plans/flappy-efficiency-mvp.md` — the current plan and its key decisions
- `docs/decisions.md` — architectural decisions
- `docs/known-issues/` — gotchas (Windows dev-server cleanup, localhost vs 127.0.0.1)

## Smoke recipe

- **Start commands:** `pnpm install` then `pnpm dev` (starts client + server together). For other ports: `WEB_PORT=3010 API_PORT=3011 pnpm dev`.
- **DB setup:** none yet (SQLite arrives in the recording sprint).
- **Login credentials:** none — no auth. Players will pick a nickname.
- **Key URLs:** game at `http://localhost:<WEB_PORT>/` (use `localhost`, not `127.0.0.1` — see known issues); API health at `http://localhost:<WEB_PORT>/api/health` → `{"ok":true,...}`.
- **Browser check:** the page shows a canvas and the text `Server OK · engine at 60 steps/s` under it.
- **Verification:** `pnpm check` (typecheck + tests + build).
