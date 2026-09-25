# Codebase structure

> High-level overview only — what the system is and how its parts fit. No file lists or deep directory trees: those change every sprint, and agents read the code for detail. Name a path only for a part's top-level folder.

The **`## Smoke recipe`** below tells each engineer how to bring the app up for browser verification (per `pod:engineer`'s instructions).

**Status: playable game with live recording.** Players pick a nickname; every game is streamed to the server over a WebSocket, stored in SQLite and replayed by the server for a trusted result. Stats and the efficiency view arrive later in plan `flappy-efficiency-mvp` (`docs/plans/`).

## What it is

A browser Flappy Bird game. Each flap is streamed to a backend, which replays the game and shows each player how efficient their play is, per game and over time.

## Parts

- **`packages/engine`** — shared, deterministic game engine (fixed 60 steps/s, seeded pipes). Pure TypeScript, no DOM or Node APIs, so both the client and the server can run it.
- **`apps/client`** — Vite + plain HTML canvas game. A pure session state machine (ready / playing / paused / over) wraps the engine; a `requestAnimationFrame` loop runs a fixed-timestep stepper (60 steps/s whatever the refresh rate) and draws the state on a 288 x 512 canvas. The session records game events (start, flap with its source, pause, resume, death, each with a step and a per-game seq); a recorder buffers them and streams them over `/api/ws`, resending unacked events after a reconnect. The page asks for a nickname once (kept in `localStorage` as `flappy.player`) and reserves each game (`POST /api/games`) ahead of time, so play never waits on the network; with no reservation the game plays unrecorded. Dev builds read `?seed=&flaps=` for a scripted run and expose `window.__flappy`. Talks to the server through the Vite dev proxy (`/api`, including the WebSocket).
- **`apps/server`** — Node + Fastify API. SQLite via Node's built-in `node:sqlite` (players, games, events). HTTP routes register players and reserve games (server seed); `/api/ws` takes a `hello` then event batches, stores each seq once, acks the highest contiguous seq, and replays a finished game with the engine to store the trusted result (client claims are kept only to flag a mismatch). A sweeper marks games with no new event for `GAME_IDLE_TIMEOUT_MS` as `incomplete` (they can still complete if the events arrive later).

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
- **DB setup:** none by hand. The SQLite file is `apps/server/data/flappy.db`, created on first start; delete it (plus `-wal`/`-shm`) to reset. `DB_PATH` points elsewhere (relative to `apps/server`, or absolute; `:memory:` works) — use a temp file for throwaway checks. `GAME_IDLE_TIMEOUT_MS` (default `300000`) sets when a stalled game becomes `incomplete`.
- **Login credentials:** none — no auth. The first visit shows a nickname form; the player is kept in `localStorage` (`flappy.player`). A scripted run with no stored player registers `smoke` by itself.
- **Key URLs:** game at `http://localhost:<WEB_PORT>/` (use `localhost`, not `127.0.0.1` — see known issues); API health at `http://localhost:<WEB_PORT>/api/health` → `{"ok":true,...}`.
- **Browser check (recorded scripted run):** open `http://localhost:<WEB_PORT>/?seed=42&flaps=13,52,90,128,166,199,237` (a fresh browser profile works). The run waits up to 3 s for its server game, plays by itself (player flaps are ignored) and ends after about 5 s. Then in the console `window.__flappy` must show `phase: 'over'`, `score: 2`, `step: 296`, `death: { step: 296, cause: 'ground' }`, `flapCount: 7` — the same as `window.__flappy.replay(42, [13,52,90,128,166,199,237])`. `window.__flappy.lastResult` must show `status: 'complete'`, `score: 2`, `deathStep: 296`, `deathCause: 'ground'`, `flapCount: 7`, `mismatch: false`, and `await (await fetch('/api/games/' + __flappy.gameId)).json()` shows `seed: 42`, `seedSource: 'dev'`, status `complete` and events `start`, 7 × `flap` (source `script`), `death` (seqs 0–8). Under the canvas: `Server score 2 (matches)` and `Server OK · engine at 60 steps/s`. The console has no errors.
- **Disconnect check:** during a game run `window.__flappy.disconnectFor(3000)`. Play goes on; `window.__flappy.online` is `false` and `window.__flappy.pending` grows with each flap, then drops to 0 after the reconnect; the stored game ends `complete` with each seq once. For the idle path, start with `GAME_IDLE_TIMEOUT_MS=10000`, run `disconnectFor(600000)` mid-game, die, reload: 10–40 s later the game is `incomplete`.
- **Dev hook fields:** `phase`, `seed`, `step`, `score`, `death`, `flapCount`, `gameId` (null = not recorded), `online`, `pending` (unacked events), `lastResult` (last server `result`), `disconnectFor(ms)`, `replay`.
- **Status line** (under the canvas): `Recording as <nickname>`, `Offline - this game is not recorded`, or after a result `Server score <n> (matches)` / `(differs)`. A bird still alive at the server's replay cap gets no result message, so the line stays `Recording as …`.
- **Controls:** Space, mouse click or touch tap on the canvas flaps (the first flap starts the game; a flap after game over starts a new one). P or Escape pauses and resumes. Hiding the tab pauses. Space never scrolls the page.
- **API down:** the game still plays; the line says `Offline - this game is not recorded`, and the console shows only failed `/api` requests (500 from the Vite proxy) and WebSocket connection errors. The page reconnects by itself once the API is back.
- **Stopping:** `pnpm dev` stops both apps when either dies. On Windows check for leftover node processes on your ports (see known issues).
- **Headless tip:** if the DevTools MCP can't start a browser, run Chrome with `--headless=new --user-data-dir=<temp dir> --remote-debugging-port=<port>` and read `window.__flappy` over CDP (`Runtime.evaluate`).
- **Verification:** `pnpm check` (typecheck + tests + build).
