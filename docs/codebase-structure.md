# Codebase structure

> High-level overview only — what the system is and how its parts fit. No file lists or deep directory trees: those change every sprint, and agents read the code for detail. Name a path only for a part's top-level folder.

The **`## Smoke recipe`** below tells each engineer how to bring the app up for browser verification (per `pod:engineer`'s instructions).

**Status: plan `flappy-efficiency-mvp` done (recording + stats).** Players pick a nickname; every game is streamed to the server over a WebSocket, stored in SQLite and replayed by the server for a trusted result. After each game the page shows a summary computed by the server (score, flaps, score per flap, wasted flaps, time between flaps, death cause), and a "My stats" page shows the player's trend across their complete games.

## What it is

A browser Flappy Bird game. Each flap is streamed to a backend, which replays the game and shows each player how efficient their play is, per game and over time.

## Parts

- **`packages/engine`** — shared, deterministic game engine (fixed 60 steps/s, seeded pipes). Pure TypeScript, no DOM or Node APIs, so both the client and the server can run it.
- **`apps/client`** — Vite + plain HTML canvas game. A pure session state machine (ready / playing / paused / over) wraps the engine; a `requestAnimationFrame` loop runs a fixed-timestep stepper (60 steps/s whatever the refresh rate) and draws the state on a 288 x 512 canvas. The session records game events (start, flap with its source, pause, resume, death, each with a step and a per-game seq); a recorder buffers them and streams them over `/api/ws`, resending unacked events after a reconnect. The page asks for a nickname once (kept in `localStorage` as `flappy.player`) and reserves each game (`POST /api/games`) ahead of time, so play never waits on the network; with no reservation the game plays unrecorded. After a recorded game ends, a summary panel under the canvas shows the server's `GET /api/games/:id/summary` (never numbers from the local session). Dev builds read `?seed=&flaps=` for a scripted run and expose `window.__flappy`. A second page, `stats.html` ("My stats"), reads the stored player and draws their trend from `GET /api/players/:id/stats`: a headline, two inline-SVG charts (score per flap, wasted flaps %) and a table of games, newest first. Vite builds both pages. Talks to the server through the Vite dev proxy (`/api`, including the WebSocket).
- **`apps/server`** — Node + Fastify API. SQLite via Node's built-in `node:sqlite` (players, games, events). HTTP routes register players and reserve games (server seed); `/api/ws` takes a `hello` then event batches, stores each seq once, acks the highest contiguous seq, and replays a finished game with the engine to store the trusted result (client claims are kept only to flag a mismatch). A sweeper marks games with no new event for `GAME_IDLE_TIMEOUT_MS` as `incomplete` (they can still complete if the events arrive later). Stats are **computed on read, not stored**: each summary/stats request replays the stored events with the engine (no metric columns). `GET /api/games/:id/summary` gives one game's summary (409 if the game is not complete or has no server death); `GET /api/players/:id/stats` gives the player's trend over counted games (complete, with a server death, no mismatch; newest 100). The wasted-flap rule (a flap while rising, or one whose peak goes above the next gap) lives in one function, `wastedFlapReason` in the server's metrics module, so it can be tuned in one place. Response types are shared from the engine package.

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

Runs on every PR (the remote is `github.com/iamphduc/flappy-bird`; PRs #2-#7 all passed both jobs).

## Key docs

- `docs/plans/flappy-efficiency-mvp.md` — the current plan and its key decisions
- `docs/decisions.md` — architectural decisions
- `docs/known-issues/` — gotchas (Windows dev-server cleanup, localhost vs 127.0.0.1)

## Smoke recipe

- **Start commands:** `pnpm install` then `pnpm dev` (starts client + server together). For other ports: `WEB_PORT=3010 API_PORT=3011 pnpm dev`.
- **DB setup:** none by hand. The SQLite file is `apps/server/data/flappy.db`, created on first start; delete it (plus `-wal`/`-shm`) to reset. `DB_PATH` points elsewhere (relative to `apps/server`, or absolute; `:memory:` works) — use a temp file for throwaway checks. `GAME_IDLE_TIMEOUT_MS` (default `300000`) sets when a stalled game becomes `incomplete`.
- **Login credentials:** none — no auth. The first visit shows a nickname form; the player is kept in `localStorage` (`flappy.player`). A scripted run with no stored player registers `smoke` by itself.
- **Key URLs:** game at `http://localhost:<WEB_PORT>/` (use `localhost`, not `127.0.0.1` — see known issues); API health at `http://localhost:<WEB_PORT>/api/health` → `{"ok":true,...}`. "My stats" at `http://localhost:<WEB_PORT>/stats.html`.
- **Browser check (recorded scripted run):** open `http://localhost:<WEB_PORT>/?seed=42&flaps=13,52,90,128,166,199,237` (a fresh browser profile works). The run waits up to 3 s for its server game, plays by itself (player flaps are ignored) and ends after about 5 s. Then in the console `window.__flappy` must show `phase: 'over'`, `score: 2`, `step: 296`, `death: { step: 296, cause: 'ground' }`, `flapCount: 7` — the same as `window.__flappy.replay(42, [13,52,90,128,166,199,237])`. `window.__flappy.lastResult` must show `status: 'complete'`, `score: 2`, `deathStep: 296`, `deathCause: 'ground'`, `flapCount: 7`, `mismatch: false`, and `await (await fetch('/api/games/' + __flappy.gameId)).json()` shows `seed: 42`, `seedSource: 'dev'`, status `complete` and events `start`, 7 × `flap` (source `script`), `death` (seqs 0–8). Under the canvas: `Server score 2 (matches)` and `Server OK · engine at 60 steps/s`. The console has no errors.
- **Summary check (same run):** after game over the panel under the canvas shows `Waiting for the server…` briefly, then the heading `Game summary (from the server)` and exactly these lines: `Score: 2`, `Flaps: 7`, `Score per flap: 0.29`, `Wasted flaps: 0 of 7 (0 while rising, 0 too high)`, `Time between flaps: 0.62 s on average (0.55 to 0.65 s)`, `Died: Hit the ground`. `window.__flappy.summary` deep-equals `await (await fetch('/api/games/' + __flappy.gameId + '/summary')).json()`, which is `score: 2`, `deathStep: 296`, `deathCause: 'ground'`, `durationMs: 4933.33…`, `flaps: 7`, `presses: 7`, `extraPresses: 0`, `scorePerFlap: 0.2857…`, `wastedFlaps: 0` (`wastedRising: 0`, `wastedOvershoot: 0`), `flapGapMs: { average: 622.22…, shortest: 550, longest: 650 }`, `mismatch: false`, `countsInStats: true`. A run with waste: `/?seed=42&flaps=13,16,40` gives `score: 0`, `flaps: 3`, `wastedFlaps: 2` (1 rising, 1 overshoot), so the line reads `Wasted flaps: 2 of 3 (1 while rising, 1 too high)`. The panel is hidden while playing and on restart; a game over with the API down shows `This game was not recorded`.
- **Stats check:** with the same player, open `http://localhost:<WEB_PORT>/stats.html` (link `My stats` on the game page) after N recorded scripted runs. It shows the nickname, `Games: N`, `Average score`, `Score per flap`, `Wasted flaps` (%), `Deaths: … ground, … top pipe, … bottom pipe`, two charts (`Score per flap`, `Wasted flaps (%)`) with N points each and a table with N rows, newest first, whose numbers match `GET /api/players/<id>/stats` (`JSON.parse(localStorage['flappy.player']).id`). Example: two locked runs + the waste run → `Games: 3`, `Average score: 1.33`, `Score per flap: 0.24`, `Wasted flaps: 12%`, `Deaths: 3 ground, 0 top pipe, 0 bottom pipe` (one locked run + the waste run → totals `wastedShare: 0.2`). Incomplete games (the idle path of the disconnect check) and unrecorded games (API down) are not listed (an incomplete game's summary route gives 409 `not-complete`; an unrecorded game has no id at all). With no stored player (fresh profile) the page says `No player yet - play a game first`; a server error shows `Could not load your stats`. `Back to the game` goes to `/`.
- **Disconnect check:** during a game run `window.__flappy.disconnectFor(3000)`. Play goes on; `window.__flappy.online` is `false` and `window.__flappy.pending` grows with each flap, then drops to 0 after the reconnect; the stored game ends `complete` with each seq once. For the idle path, start with `GAME_IDLE_TIMEOUT_MS=10000`, run `disconnectFor(600000)` mid-game, die, reload: 10–40 s later the game is `incomplete`.
- **Dev hook fields:** `phase`, `seed`, `step`, `score`, `death`, `flapCount`, `gameId` (null = not recorded), `online`, `pending` (unacked events), `lastResult` (last server `result`), `summary` (last fetched server summary for the current game, or null), `disconnectFor(ms)`, `replay`.
- **Status line** (under the canvas): `Recording as <nickname>`, `Offline - this game is not recorded`, or after a result `Server score <n> (matches)` / `(differs)`. A bird still alive at the server's replay cap gets no result message, so the line stays `Recording as …`.
- **Controls:** Space, mouse click or touch tap on the canvas flaps (the first flap starts the game; a flap after game over starts a new one). P or Escape pauses and resumes. Hiding the tab pauses. Space never scrolls the page.
- **API down:** the game still plays; the line says `Offline - this game is not recorded`, and the console shows only failed `/api` requests (500 from the Vite proxy) and WebSocket connection errors. The page reconnects by itself once the API is back.
- **Stopping:** `pnpm dev` stops both apps when either dies. On Windows check for leftover node processes on your ports (see known issues).
- **Headless tip:** if the DevTools MCP can't start a browser, run Chrome with `--headless=new --user-data-dir=<temp dir> --remote-debugging-port=<port>` and read `window.__flappy` over CDP (`Runtime.evaluate`).
- **Verification:** `pnpm check` (typecheck + tests + build). The build writes both `apps/client/dist/index.html` and `apps/client/dist/stats.html`.
