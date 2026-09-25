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

## 2026-09-24 — Wasted flap rule
Context: the game-over panel and the trend show how many flaps were wasted; the rule needs to be exact and easy to tune after playtesting.
Decision: a flap is wasted if (a) **rising**: the bird's `vy < 0` in the state the flap is applied to, or (b) **overshoot**: after the flap, with no further flap, the bird's highest point (smallest `y`, found by stepping the engine with no flap until `vy >= 0` or death) is above the top of the next pipe gap (`peakY < gapY - PIPE_GAP / 2`). The next pipe is the first pipe not yet scored in the pre-flap state; with no such pipe there is no overshoot. Rising is checked first, so each wasted flap has one reason. The rule lives in one function, `wastedFlapReason` in `apps/server/src/metrics.ts`.
Consequences: changing the rule is a one-function change, and (metrics are computed on read) it changes every past game's numbers at once. The locked seed-42 smoke run has 0 wasted flaps.

## 2026-09-24 — Stats metrics are computed on read, not stored
Context: the summary and trend need per-flap bird state, which the stored result does not have.
Decision: each stats request replays the stored events with the engine's `createGame`/`step`. No new columns, no migration and no backfill for existing complete games. The trend is capped at the player's last `MAX_TREND_GAMES = 100` counted games to bound the work.
Consequences: tuning the rule needs no data change. A player's stats request replays up to 100 games; if it gets slow, caching is a later change.

## 2026-09-24 — "Flaps" means applied flaps; extra presses are reported apart
Context: several presses can land in one step, but only one flap is applied (see "Record raw flap presses").
Decision: every metric (score per flap, wasted flaps, time between flaps) uses applied flaps: distinct flap steps before death, the stored `flapCount`. Extra presses in the same step (`presses - flaps`) do nothing to the bird, so they are never counted as wasted; the summary reports them as `extraPresses`.
Consequences: a mashing player is not punished twice for one step; the press count stays visible.

## 2026-09-24 — Which games count in the stats
Context: games can be unfinished, cut off, fail to die within the replay cap, or disagree with the client.
Decision: a game counts for its player when its status is `complete`, it has a server death (`death_step` not null) and `mismatch = 0`. `created`/`open`/`incomplete` games never count. A game still alive at the server's replay cap (stored `complete`, null death, `mismatch = 1`) gets no summary (`409 no-server-result`) and no trend point. Other mismatch games still get a summary from the server replay, flagged `mismatch: true, countsInStats: false`, but are left out of the trend. Dev-seeded games (`seedSource: 'dev'`) do count: they only exist outside production, and the smoke check needs them.
Consequences: the trend only has games the player saw the way the server replayed them.

## 2026-09-24 — Flap timing uses game steps
Context: "time between flaps" could be measured with wall-clock event times or with game steps.
Decision: flap gaps are step gaps between consecutive applied flaps, turned into ms with `stepsToMs`. The trend is ordered by `last_event_at` (when the game was last played), then id.
Consequences: paused time and network delay never count; timing matches what the player felt in the game.

## 2026-09-24 — "My stats" is its own page with inline-SVG charts
Context: the trend needs a view, and the client has no framework or chart library.
Decision: "My stats" is a second Vite page (`stats.html`); charts are plain inline SVG strings built by a small helper.
Consequences: no new dependency; the page is simple but the charts are basic.
