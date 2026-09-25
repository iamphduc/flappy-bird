# Decisions

> Stub — authoritative architectural decisions for your project. One entry per decision; agents link here from `handoff-queue.md` Resolution lines.

<!-- ## YYYY-MM-DD — <title>
Context: <why this came up>
Decision: <what was decided>
Consequences: <trade-offs, follow-ups> -->

## 2026-09-24 — Stack: TypeScript monorepo, Vite canvas client, Fastify + SQLite server
Context: empty repo; plan `flappy-efficiency-mvp` needs a browser game plus a backend that replays games.
Decision: pnpm workspaces with `packages/engine` (shared), `apps/client` (Vite + plain canvas, no game engine), `apps/server` (Node + Fastify, SQLite). TypeScript everywhere.
Consequences: one language and shared types for events; no Docker. SQLite limits hosting to a single instance with a persistent disk, which is fine for now.

## 2026-09-24 — Deterministic shared engine; server is the source of truth
Context: efficiency stats must be fair across devices and not fakeable.
Decision: fixed 60 steps/s physics and a server-issued seed for pipes, in one engine package used by client and server. The server replays inputs to get score, death and per-flap state; client-reported results are never used for metrics.
Consequences: the engine must stay free of DOM/Node APIs and wall-clock time. Needs a client-vs-server replay test. Makes the later ideal-path analysis possible.

## 2026-09-24 — Live WebSocket recording with buffer/resend
Context: every flap should reach the backend.
Decision: stream events over WebSocket with step number + sequence number. The game never waits for the network; the client resends after a reconnect, and the server dedupes. Games with gaps are marked incomplete and left out of the stats.
Consequences: more complex than one upload per game; reconnect cases need tests.

## 2026-09-24 — Nickname-only players; record game inputs only
Context: trends need identity; privacy and scope.
Decision: players pick a nickname, and a player ID is kept in the browser, with no auth. Only flap inputs (Space/click/tap) and game events are recorded, never other keys.
Consequences: names can be reused by anyone (accepted). Real accounts are a later plan.

## 2026-09-24 — Record raw flap presses, not just applied flaps
Context: several presses can land in one engine step, but the engine applies at most one flap per step.
Decision: every flap press accepted while `ready`/`playing` becomes its own `flap` event with its source (`space`/`click`/`tap`/`script`), stamped with the step it is applied on (in `tick`), so presses in one step share a step number. Presses dropped by a pause are never recorded. The server replays the distinct flap steps and stores `pressCount` (all flap events) apart from `flapCount` (applied flaps before death).
Consequences: client and server replays cannot drift; the stats sprint gets both counts.

## 2026-09-24 — Idle games become incomplete after 5 minutes, reversibly
Context: a game can stop getting events (tab closed, network gone) and must not stay `open` forever.
Decision: a sweeper marks a game that has events but none new for `GAME_IDLE_TIMEOUT_MS` (default `300000`) as `incomplete`. Games with no events are never swept. If the missing events arrive later, the game is finalized as `complete`.
Consequences: stats leave out `incomplete` games; a late reconnect still saves the game.

## 2026-09-24 — Seeds come from the server ahead of time, over HTTP
Context: the server must pick the seed, but the game must never wait on the network.
Decision: the client reserves its next game (`POST /api/games` → `{ gameId, seed }`) while in `ready`, and reserves the one after as soon as a game starts. If no reservation is ready when the player flaps (offline), the game plays with a local seed and is not recorded.
Consequences: at most one spare `created` game per player; `created` games with no events are never swept or counted.

## 2026-09-24 — Client-chosen seeds only outside production
Context: the `?seed=&flaps=` scripted run must be recorded and checked against known values.
Decision: outside `NODE_ENV=production` the server accepts a `seed` on `POST /api/games` and stores `seedSource: 'dev'` (normal games: `'server'`). Scripted flaps use flap source `'script'`. A scripted run waits up to 3 s for its server game before it starts (dev only; real play never waits).
Consequences: dev games can be told apart and left out of stats; production seeds stay server-only.

## 2026-09-24 — Shared protocol lives in `packages/engine`
Context: client and server need the same event and message types and the same replay function.
Decision: `packages/engine/src/protocol.ts` holds the event/message types, `parseClientMessage`, `replayEvents` and `contiguousUpTo`. It is pure TypeScript and both apps already import the engine.
Consequences: no new workspace package or lockfile churn; the engine package must stay DOM/Node-free.

## 2026-09-24 — SQLite through Node's built-in `node:sqlite`
Context: native SQLite modules need a build step on Windows/pnpm 11.
Decision: use `node:sqlite` (`DatabaseSync`), unflagged from Node 22.13; root `engines.node` is `>=22.13`. Fallback, only if it cannot load under Vitest or tsx: `better-sqlite3`.
Consequences: no native build; Node 22 prints a harmless `ExperimentalWarning` once per process. Synchronous DB calls also make one socket's messages run strictly in order.

## 2026-09-24 — Unsent events are kept in memory only
Context: the recorder buffers unacked events; a page reload drops that buffer.
Decision: accepted for this plan. A game reloaded mid-game (or with unsent events) ends up `incomplete` after the idle timeout.
Consequences: simple client; a later plan could persist the buffer (e.g. `localStorage`) if lost games matter.
