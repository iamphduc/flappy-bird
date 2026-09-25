# Sprint: recording

_From plan: docs/plans/flappy-efficiency-mvp.md · Slug: recording · Status: archived · Generated: 2026-09-24_

## Status board

| Wave | Slice | Title | Branch | PR | Status | Depends on |
|------|-------|-------|--------|----|--------|------------|
| 1 | P1 | Shared event protocol in the engine: event/message types, message validation, `replayEvents`, `contiguousUpTo` | recording-p1 | merged | done | — |
| 1 | S1 | Server storage: deps, SQLite (`node:sqlite`) schema, player and game HTTP routes | recording-s1 | merged | done | — |
| 2 | S2 | WebSocket ingest: dedupe, acks, server replay into stored results, idle sweep | recording-s2 | merged | done | P1, S1 |
| 2 | C1 | Client recording core: session emits events, recorder with buffer/resend, player/game API helpers | recording-c1 | merged | done | P1 |
| 3 | C2 | Wire recording into the game: nickname prompt, game reservation, WS proxy, dev hook, smoke recipe, decisions | recording-c2 | merged | done | S2, C1 |

Wave membership lives in the **Wave** column — **computed by the planner, not authored** (see Field semantics). Slices in a wave run in parallel and own disjoint files. Authored levels: **plan → sprint → slice**. Engineers push branches; the orchestrator integrates each wave into **one PR** on the plan branch (see **Branch naming**).

Why three waves: the client wiring (C2) can only be browser-checked end to end once both the WebSocket server (S2) and the client recorder (C1) exist, so it gets its own last wave. Stats, metrics, the wasted-flap rule and any summary screen are NOT in this sprint (that is `stats`).

### Decisions made in this sprint (C2 writes them to `docs/decisions.md`)

- **Raw presses are recorded, not just applied flaps** (folds in the C2 PENDING "several player flaps in one frame collapse into one pending flap"). Every flap press the game accepts while `ready`/`playing` becomes its own `flap` event with its `source`. The engine still applies at most one flap per step. Flap events are emitted **when the step runs** (in `tick`), stamped with that step, so presses that land in the same step share a step number and every recorded flap step is a step the engine really flapped on. Presses dropped by a pause (pause still clears the pending flap) are **never recorded**, so client and server replays cannot drift. The server replays the **distinct** flap steps; it stores `pressCount` (all flap events) and `flapCount` (applied flaps before death) separately, for the stats sprint.
- **Idle timeout = 5 minutes.** A game that has events but gets no new event for 5 minutes (`GAME_IDLE_TIMEOUT_MS`, default `300000`) is marked `incomplete` by a sweeper. This is reversible: if the missing events arrive later (client reconnects with its buffer), the game is finalized as `complete`. Games with no events at all are never swept.
- **Seeds come from the server ahead of time, over HTTP.** The client reserves its next game (`POST /api/games` → `{ gameId, seed }`) while the player is in `ready`, and reserves the one after as soon as a game starts. If no reservation is ready when the player flaps (offline), the game plays with a local seed and is **not recorded**. The game never waits on the network.
- **Dev seeds:** outside `NODE_ENV=production` the server accepts a client-chosen `seed` on `POST /api/games` and stores `seedSource: 'dev'` (normal games: `'server'`). This lets the `?seed=&flaps=` scripted run be recorded and checked. Scripted flaps use flap source `'script'`.
- **Shared protocol lives in `packages/engine`** (`protocol.ts`): it is pure TypeScript, both apps already import the engine, and no new workspace package (or lockfile churn) is needed.
- **SQLite driver: Node's built-in `node:sqlite`** (`DatabaseSync`), unflagged from Node 22.13, so no native build on Windows/pnpm 11. Root `engines.node` becomes `>=22.13`. Fallback only if `node:sqlite` cannot load under Vitest or tsx: `better-sqlite3` + `allowBuilds` in `pnpm-workspace.yaml`, with a PENDING handoff entry.
- **Page reload mid-game loses the unsent buffer** (kept in memory only), so that game ends up `incomplete`. Accepted for this plan.

### Dependency hotspots

Only **S1** changes dependencies: `@fastify/websocket` (`^11`, Fastify 5 line) in `apps/server/package.json`, `pnpm-lock.yaml`, and root `package.json` (`engines.node: ">=22.13"`). No other slice in any wave touches a `package.json`, `pnpm-lock.yaml` or `pnpm-workspace.yaml` (except the fallback case above, which also lands in S1).

### Handoff-queue entries folded in

- C2 "several player flaps in one frame collapse…" → resolved by **C1** (raw presses recorded, see above).
- C2 "scripted session: a flap in `over` restarts with the SAME seed" → kept; **C2** reserves the restarted scripted game with the same dev seed.
- E1 regression run (seed 42, flaps `[13,52,90,128,166,199,237]` → score 2, death 296, `ground`) → reused as the server replay regression value in **S2** and in the smoke recipe (**C2**).
- C2 "`/favicon.ico` 404 is the only console error" → **C2** adds an empty inline favicon so browser checks start with a clean console.
- The orchestrator writes the Resolution lines at archive time; slices do not edit `docs/handoff-queue.md` except to append new entries.

## Per-slice detail

### P1: Shared event protocol (engine)
- **Scope:** Add the event and message contract both apps use, plus pure helpers. Pure TypeScript, no DOM/Node APIs (engine `tsconfig` already enforces this).
  - `protocol.ts`:
    - `RecordedFlapSource = 'space' | 'click' | 'tap' | 'script'`.
    - `GameEvent` (every event has `seq: number` — per game, contiguous from 0 — and `step: number`): `{ type: 'start' }` (step 0), `{ type: 'flap', source }`, `{ type: 'pause' }`, `{ type: 'resume' }`, `{ type: 'death', cause: DeathCause, score: number }` (the client's claim; stored only to spot drift, never trusted).
    - `ClientMessage`: `{ type: 'hello', playerId: string }` | `{ type: 'events', gameId: string, events: GameEvent[] }`.
    - `ServerMessage`: `{ type: 'welcome' }` | `{ type: 'ack', gameId, upTo: number }` (highest seq `n` such that `0..n` are all stored, `-1` if none) | `{ type: 'result', gameId, status: 'complete', score, deathStep, deathCause, flapCount, pressCount, mismatch }` | `{ type: 'error', code: string, message: string, gameId?: string }`.
    - Limits: `MAX_BATCH = 500` events per message, `MAX_EVENTS_PER_GAME = 20000`, id strings at most 64 chars.
    - `parseClientMessage(raw: unknown): ClientMessage | null` — strict: known types, flap sources and death causes only; `seq`/`step`/`score` are non-negative integers; `seq < MAX_EVENTS_PER_GAME`; batch non-empty and at most `MAX_BATCH`; unknown extra fields are dropped. Takes already-parsed JSON (the caller does `JSON.parse`).
    - `flapStepsFromEvents(events)` → sorted, distinct steps of `flap` events.
    - `replayEvents(seed, events)` → engine `replay(seed, flapStepsFromEvents(events))` result plus `pressCount` (number of flap events). This is the one function both sides use, which is how client/server drift is tested.
    - `contiguousUpTo(seqs: Iterable<number>): number`.
  - `index.ts` re-exports all of the above.
  - NOT in scope: any client or server code, networking, storage, metrics or the wasted-flap rule.
- **Files owned:**
  - `packages/engine/src/protocol.ts` (new)
  - `packages/engine/src/protocol.test.ts` (new)
  - `packages/engine/src/index.ts`
  - `packages/engine/src/index.test.ts`
- **Success criteria:**
  - `[test] a valid hello and a valid events message parse to the same data — packages/engine/src/protocol.test.ts › parses valid client messages`
  - `[test] unknown type, unknown flap source (e.g. 'keyA'), unknown death cause, negative or non-integer seq/step, empty or oversized batch, and non-object input all give null — packages/engine/src/protocol.test.ts › rejects bad client messages`
  - `[test] extra fields on events are dropped — packages/engine/src/protocol.test.ts › drops unknown fields`
  - `[test] flap steps come back sorted and distinct; non-flap events are ignored — packages/engine/src/protocol.test.ts › flapStepsFromEvents keeps distinct flap steps`
  - `[test] events for seed 42 with the locked flap list (two presses on step 52) give score 2, death step 296, cause 'ground', flapCount 7, pressCount 8 — packages/engine/src/protocol.test.ts › replayEvents matches the locked regression run`
  - `[test] contiguousUpTo gives -1 for none, 1 for {0,1,3}, 3 for {0,1,2,3} — packages/engine/src/protocol.test.ts › contiguousUpTo stops at the first gap`
  - `[test] the protocol API is exported from the package root — packages/engine/src/index.test.ts › exports the protocol helpers`
- **Depends on:** —

### S1: Server storage and HTTP routes
- **Scope:** Dependencies, the SQLite database and the non-WebSocket routes. S2 builds ingest on top.
  - Deps: add `@fastify/websocket` `^11` to `apps/server/package.json` (installed now, registered by S2). Root `package.json` `engines.node` → `">=22.13"`. `.gitignore`: add `*.db-wal`, `*.db-shm` and `apps/server/data/`. This is the **only** slice that touches dependency files.
  - `db.ts`: `openDb(path: string): DatabaseSync` using `node:sqlite`; `':memory:'` for tests; creates the parent folder for a file path; `PRAGMA foreign_keys = ON`, WAL for files; `CREATE TABLE IF NOT EXISTS` for:
    - `players(id TEXT PK, nickname TEXT, created_at INTEGER)`
    - `games(id TEXT PK, player_id TEXT FK, seed INTEGER, seed_source TEXT ('server'|'dev'), status TEXT ('created'|'open'|'complete'|'incomplete'), created_at INTEGER, last_event_at INTEGER NULL, score INTEGER NULL, death_step INTEGER NULL, death_cause TEXT NULL, flap_count INTEGER NULL, press_count INTEGER NULL, client_score INTEGER NULL, client_death_step INTEGER NULL, mismatch INTEGER NULL)`
    - `events(game_id TEXT FK, seq INTEGER, step INTEGER, type TEXT, source TEXT NULL, cause TEXT NULL, score INTEGER NULL, received_at INTEGER, PRIMARY KEY (game_id, seq))`
    - Small typed helpers: `insertPlayer`, `getPlayer`, `insertGame`, `getGame`, `getGameEvents` (seq order). Times are `Date.now()` ms, passed in so tests can fix them.
  - `players.ts` (Fastify plugin): `POST /api/players { nickname }` → `201 { id, nickname }` (id: `crypto.randomUUID()`; nickname trimmed, 1–20 chars, else `400`); `GET /api/players/:id` → `200 { id, nickname }` or `404`.
  - `gameRoutes.ts` (Fastify plugin): `POST /api/games { playerId, seed? }` → `201 { gameId, seed }` with status `created`, seed from `crypto.randomInt(0, 2**32)`; unknown player → `404`; a `seed` (uint32) is accepted only when the app's `devSeeds` option is on (stored with `seed_source 'dev'`), else `400`. `GET /api/games/:id` → `200` with the game record (camelCase fields) and its `events` in seq order, or `404`.
  - `app.ts`: `buildApp({ db?, devSeeds? } = {})` — defaults to an in-memory DB and `devSeeds: false`; closes the DB on app close. `/api/health` unchanged.
  - `main.ts`: opens `process.env.DB_PATH ?? 'data/flappy.db'` (relative to `apps/server`), `devSeeds = process.env.NODE_ENV !== 'production'`.
  - NOT in scope: WebSocket route, event ingest, replay, sweeper, client code.
- **Files owned:**
  - `package.json`
  - `pnpm-lock.yaml`
  - `.gitignore`
  - `apps/server/package.json`
  - `apps/server/src/app.ts`
  - `apps/server/src/app.test.ts`
  - `apps/server/src/main.ts`
  - `apps/server/src/db.ts` (new)
  - `apps/server/src/db.test.ts` (new)
  - `apps/server/src/players.ts` (new)
  - `apps/server/src/players.test.ts` (new)
  - `apps/server/src/gameRoutes.ts` (new)
  - `apps/server/src/gameRoutes.test.ts` (new)
- **Success criteria:**
  - `[test] node:sqlite loads under Vitest and an in-memory DB gets all three tables — apps/server/src/db.test.ts › creates the schema`
  - `[test] reopening a file DB in a temp folder keeps its rows and does not fail on the existing schema — apps/server/src/db.test.ts › reopening a file keeps data`
  - `[test] POST /api/players with '  Ann  ' gives 201 with an id and nickname 'Ann' — apps/server/src/players.test.ts › registers a player`
  - `[test] empty, whitespace-only, over-20-char and non-string nicknames give 400 — apps/server/src/players.test.ts › rejects bad nicknames`
  - `[test] GET /api/players/:id returns the player, or 404 for an unknown id — apps/server/src/players.test.ts › looks up a player`
  - `[test] POST /api/games gives 201 with a gameId and a uint32 seed, stored with status 'created' and seedSource 'server' — apps/server/src/gameRoutes.test.ts › reserves a game with a server seed`
  - `[test] POST /api/games for an unknown player gives 404 — apps/server/src/gameRoutes.test.ts › unknown player cannot reserve a game`
  - `[test] a client seed gives 400 when devSeeds is off, and is used with seedSource 'dev' when on — apps/server/src/gameRoutes.test.ts › client seeds only in dev`
  - `[test] GET /api/games/:id returns the record with events in seq order (rows inserted directly), or 404 — apps/server/src/gameRoutes.test.ts › returns a game with its events`
  - `[test] health still returns ok — apps/server/src/app.test.ts › returns ok`
- **Depends on:** —

### S2: WebSocket ingest, replay and idle sweep
- **Scope:** Receive events live, store them once, ack them, replay finished games with the engine, and mark stalled games incomplete.
  - `ingest.ts` (pure DB logic, no Fastify):
    - `ingestEvents(db, { playerId, gameId, events, now })` → `{ ack: ServerMessage, result?: ServerMessage } | { error: ServerMessage }`. Unknown game → error `unknown-game`; game of another player → error `not-your-game`. Inserts with `INSERT OR IGNORE` (first write for a `(game_id, seq)` wins, so resends are no-ops). Once a death event is stored, events with a higher seq are rejected. Updates `last_event_at` only when a new row is stored; a stored event moves `created`/`incomplete` → `open`. Ack `upTo` = `contiguousUpTo` of stored seqs. Events for a `complete` game are ignored but still acked.
    - Finalize (after each ingest): when a death event is stored and every seq `0..deathSeq` is present, run `replayEvents(game.seed, storedEvents)` and store `score`, `death_step`, `death_cause`, `flap_count`, `press_count` from the **replay only**; store the client's death `score`/`step` as `client_score`/`client_death_step` and `mismatch = 1` if they differ from the replay; status `complete`; return a `result` message. Client-claimed values are never copied into the result fields.
    - `sweepIdle(db, now, timeoutMs)`: games in `open` whose `last_event_at` is older than `timeoutMs` → `incomplete`. `created` games (no events) are left alone.
    - `startSweeper(db, { timeoutMs, intervalMs })` → stop function (uses `setInterval`; `intervalMs` default `min(30000, timeoutMs / 2)`).
  - `ws.ts` (Fastify plugin): registers `@fastify/websocket` and `GET /api/ws`. Per connection: first valid message must be `hello` with a known player → `welcome`, else `error` (`unknown-player` / `hello-first`). Each message goes through `JSON.parse` + `parseClientMessage`; bad input → `error` `bad-message`, socket stays open. `events` → `ingestEvents`, then send `ack` (and `result` when the game completes). A throw never crashes the server.
  - `app.ts`: register the ws plugin. `main.ts`: start the sweeper with `GAME_IDLE_TIMEOUT_MS` (default `300000`) and stop it on close.
  - NOT in scope: metrics, wasted flaps, per-flap bird state (the stats sprint derives those from replay), client code, new deps.
- **Files owned:**
  - `apps/server/src/ingest.ts` (new)
  - `apps/server/src/ingest.test.ts` (new)
  - `apps/server/src/ws.ts` (new)
  - `apps/server/src/ws.test.ts` (new)
  - `apps/server/src/app.ts`
  - `apps/server/src/main.ts`
- **Success criteria:**
  - `[test] sending the same batch twice stores one row per seq and gives the same ack — apps/server/src/ingest.test.ts › duplicate events are stored once`
  - `[test] storing seqs 0,1,3 acks 1; then storing 2 acks 3 — apps/server/src/ingest.test.ts › ack is the highest contiguous seq`
  - `[test] the locked seed-42 run (dev seed 42, flaps 13,52,90,128,166,199,237 as events with start and death) completes with score 2, death step 296, cause 'ground', flapCount 7 — the same as replayEvents — apps/server/src/ingest.test.ts › complete game stores the server replay result`
  - `[test] a death event claiming score 99 still stores the replay score, keeps 99 only as client_score, and sets mismatch — apps/server/src/ingest.test.ts › client claimed results are never used`
  - `[test] a game with a missing seq stays 'open' after its death event and completes once the gap is filled — apps/server/src/ingest.test.ts › gaps block completion until filled`
  - `[test] events with a seq above the stored death seq are rejected — apps/server/src/ingest.test.ts › events after death are rejected`
  - `[test] events for another player's game or an unknown game give an error and store nothing — apps/server/src/ingest.test.ts › rejects games the player does not own`
  - `[test] an open game is 'incomplete' after sweepIdle at last_event_at + 5 min + 1 ms, still 'open' just before, and 'created' games are untouched — apps/server/src/ingest.test.ts › idle games are marked incomplete after the timeout`
  - `[test] an incomplete game becomes 'complete' when its missing events and death arrive later — apps/server/src/ingest.test.ts › late events can still complete a game`
  - `[test] startSweeper marks idle games on its interval and stops when told (fake timers) — apps/server/src/ingest.test.ts › sweeper runs on its interval`
  - `[test] events sent before hello, or a hello with an unknown player, get an error message — apps/server/src/ws.test.ts › hello is required`
  - `[test] a valid events message gets an ack over the socket (Fastify injectWS, no port) — apps/server/src/ws.test.ts › events are acked`
  - `[test] closing the socket mid-game and resending all events on a new socket gives no duplicate rows and a complete game — apps/server/src/ws.test.ts › resend after reconnect has no duplicates`
  - `[test] the socket that sends the final missing event gets a result message with the replay score — apps/server/src/ws.test.ts › finished game sends a result`
  - `[test] non-JSON or invalid messages get a bad-message error and the socket stays usable — apps/server/src/ws.test.ts › bad messages do not close the socket`
- **Depends on:** P1, S1

### C1: Client recording core
- **Scope:** Pure, DOM-free client pieces that C2 wires in.
  - `session.ts` (keep all existing behavior and tests passing):
    - Add `gameId: string | null` (null = not recorded) and `events: GameEvent[]` for the current game, seq contiguous from 0.
    - First flap in `ready` records `start` (step 0) when handled. Each accepted flap press is kept as a pending press with its source; on `tick`, every pending press becomes a `flap` event stamped with the step being run, then the engine gets one `flap: true`. Pause records `pause`, resume records `resume` (current step); pause still clears pending presses and they are **not** recorded. Flaps while paused or in `over` are not recorded. Engine death in `tick` records `death { cause, score }` at the death step. Scripted flaps record source `'script'`.
    - `assignGame(session, { gameId, seed })`: only in `ready` with no events yet — swaps in the server seed and a fresh `createGame(seed)`; otherwise returns the session unchanged.
    - Restart (flap in `over` or `restart`) starts a new game with `gameId: null`, empty events, seq back to 0.
  - `recorder.ts`: `createRecorder({ connect, playerId, onResult?, onStatus?, timers? })`. `connect()` returns a WebSocket-like object (`send`, `close`, `readyState`, `onopen`/`onmessage`/`onclose`/`onerror`). `record(gameId, events)` is synchronous, never throws and never waits: it buffers per game and sends at once if open. On open: send `hello`, then resend every unacked event per game (batches of at most `MAX_BATCH`). On `ack`: drop that game's events with `seq <= upTo`. On close/error: reconnect after 1 s, doubling to a 10 s cap, reset after a successful open. `result` messages go to `onResult`; `onStatus('online' | 'offline')`. `pendingCount()` for the dev hook. `disconnectFor(ms)` closes the socket and holds reconnect for `ms` (used by tests and the smoke check).
  - `api.ts`: `loadPlayer(storage)` / `savePlayer(storage, player)` / `clearPlayer(storage)` (key `flappy.player`, `{ id, nickname }`); `registerPlayer(fetchFn, nickname)`; `checkPlayer(fetchFn, id)` → player or `null` on 404; `reserveGame(fetchFn, playerId, seed?)` → `{ gameId, seed }` or `null` on any network/HTTP error (never throws). `storage` and `fetchFn` are injected so tests need no DOM.
  - NOT in scope: `main.ts`, `index.html`, `vite.config.ts`, rendering, input mapping changes, server code, new deps.
- **Files owned:**
  - `apps/client/src/session.ts`
  - `apps/client/src/session.test.ts`
  - `apps/client/src/recorder.ts` (new)
  - `apps/client/src/recorder.test.ts` (new)
  - `apps/client/src/api.ts` (new)
  - `apps/client/src/api.test.ts` (new)
- **Success criteria:**
  - `[test] the first flap records start (seq 0, step 0) and, after one tick, a flap (seq 1, step 0) with its source — apps/client/src/session.test.ts › first flap records start then flap at step 0`
  - `[test] a Space and a click before the same tick give two flap events with the same step and sources, while the engine applies one flap — apps/client/src/session.test.ts › several presses in one step are all recorded`
  - `[test] pause and resume are recorded with the current step — apps/client/src/session.test.ts › pause and resume are recorded`
  - `[test] a press followed by pause before the next tick records no flap, and flaps while paused record nothing — apps/client/src/session.test.ts › presses cleared by pause are not recorded`
  - `[test] death records the death step, cause and score — apps/client/src/session.test.ts › death is recorded`
  - `[test] seqs are contiguous from 0, and a restart clears gameId and events and starts seq at 0 — apps/client/src/session.test.ts › seq numbers are contiguous per game`
  - `[test] assignGame swaps seed and gameId in ready, and does nothing once the game has started — apps/client/src/session.test.ts › assignGame only swaps the seed before the game starts`
  - `[test] a scripted seed-42 run records 7 flap events with source 'script', and replayEvents on its events gives the session's score, death step and cause — apps/client/src/session.test.ts › recorded events replay to the session result`
  - `[test] existing session tests still pass — apps/client/src/session.test.ts › scripted session matches engine replay`
  - `[test] on open the recorder sends hello, then buffered events — apps/client/src/recorder.test.ts › sends hello then buffered events on open`
  - `[test] events recorded while closed are sent after reconnect, and record returns without throwing while closed — apps/client/src/recorder.test.ts › buffers while offline and resends after reconnect`
  - `[test] after ack upTo 2, a reconnect resends only seqs above 2 — apps/client/src/recorder.test.ts › resends only unacked events after reconnect`
  - `[test] reconnect delays go 1 s, 2 s, 4 s, 8 s, 10 s, 10 s (fake timers) and reset after an open — apps/client/src/recorder.test.ts › reconnects with capped backoff`
  - `[test] a socket whose send throws does not make record throw, and the events stay buffered — apps/client/src/recorder.test.ts › record never throws`
  - `[test] result messages reach onResult; status changes reach onStatus — apps/client/src/recorder.test.ts › result and status callbacks fire`
  - `[test] disconnectFor(5000) closes the socket and does not reconnect before 5 s — apps/client/src/recorder.test.ts › disconnectFor holds the connection down`
  - `[test] savePlayer then loadPlayer round-trips; bad stored JSON loads as null — apps/client/src/api.test.ts › stores and loads the player`
  - `[test] registerPlayer posts the nickname to /api/players and returns the player — apps/client/src/api.test.ts › registerPlayer posts the nickname`
  - `[test] checkPlayer returns null on 404 — apps/client/src/api.test.ts › unknown stored player is null`
  - `[test] reserveGame returns { gameId, seed } on 201, sends seed when given, and returns null when fetch rejects or the status is not ok — apps/client/src/api.test.ts › reserveGame returns null when offline`
- **Depends on:** P1

### C2: Wire recording into the game
- **Scope:** Hook the C1 pieces into the live page and prove end to end in the browser that games are recorded and replayed by the server. Mostly DOM wiring, so the criteria are `[manual]`: the logic behind them is already covered by C1 and S2 tests; what is left is checking the real page, proxy and socket together.
  - `vite.config.ts`: proxy `/api` with `ws: true` so `/api/ws` reaches the server.
  - `index.html`: a small nickname form (input + button) shown when no valid player is stored; a status line for recording state; an empty inline favicon (`<link rel="icon" href="data:,">`) to remove the `/favicon.ico` 404.
  - `main.ts`:
    - On load: `loadPlayer` → `checkPlayer` (clear and show the form on 404). The game stays playable while the form is up or the server is down; those games are just not recorded.
    - After a player exists: create the recorder (`ws(s)://<host>/api/ws`), reserve a game while in `ready` and `assignGame` it; reserve the next one when a game starts; after restart, assign the reserved game if one is ready. Forward each new session event (by seq) to `recorder.record(session.gameId, …)` only when `gameId` is not null.
    - Scripted dev run (`?seed=&flaps=`): with no stored player, register nickname `smoke` automatically; reserve with the script seed (dev seed) and hold the scripted start until the game is assigned or 3 s pass (dev only; real play never waits). A restart reserves again with the same seed.
    - Status line: `Recording as <nickname>` / `Offline - this game is not recorded` / after a result `Server score <n> (matches)` or `(differs)`. Plain text.
    - Dev hook: keep existing fields; add `gameId`, `online`, `pending` (unacked count), `lastResult` (last `result` message) and `disconnectFor(ms)`.
  - `docs/codebase-structure.md`: status line and server part (SQLite file, WS sessions); Smoke recipe: DB setup (file at `apps/server/data/flappy.db`, created on first start, delete to reset; `DB_PATH`, `GAME_IDLE_TIMEOUT_MS`), recorded scripted browser check, and the disconnect check.
  - `docs/decisions.md`: one entry each for the "Decisions made in this sprint" list above.
  - `pnpm check` must stay green (typecheck + all existing tests + build).
  - NOT in scope: engine, server, `session.ts`/`recorder.ts`/`api.ts` logic (raise a handoff-queue entry if something is missing), stats screens, new deps.
- **Files owned:**
  - `apps/client/src/main.ts`
  - `apps/client/index.html`
  - `apps/client/vite.config.ts`
  - `docs/codebase-structure.md`
  - `docs/decisions.md`
- **Success criteria:**
  - `[manual] first visit shows the nickname form; after entering a name, a reload does not ask again and localStorage 'flappy.player' holds { id, nickname } — browser, fresh profile`
  - `[manual] scripted run is recorded and replayed: open http://localhost:3000/?seed=42&flaps=13,52,90,128,166,199,237 in a fresh profile; after game over window.__flappy.lastResult shows status 'complete', score 2, deathStep 296, deathCause 'ground', flapCount 7, mismatch false, and GET /api/games/<window.__flappy.gameId> shows seed 42, seedSource 'dev', a start event, 7 flap events with source 'script' and a death event — browser console + fetch`
  - `[manual] manual play is recorded per input: play one game using Space, a mouse click and (device emulation) a tap, pause once; the stored game has flap events with sources 'space', 'click' and 'tap', pause/resume events, and a server score equal to the score the canvas showed; the status line says '(matches)' — browser + GET /api/games/<id>`
  - `[manual] a network drop does not stop the game or lose events: mid-game run window.__flappy.disconnectFor(3000); play continues smoothly, window.__flappy.pending grows then returns to 0 after reconnect, and the stored game is 'complete' with seqs 0..N each exactly once — browser console + GET /api/games/<id>`
  - `[manual] a game that never reconnects ends incomplete: start the server with GAME_IDLE_TIMEOUT_MS=10000 pnpm dev, start a game, run window.__flappy.disconnectFor(600000), die, reload the page; about 10-40 s later GET /api/games/<that id> shows status 'incomplete' — browser + fetch`
  - `[manual] non-game keys are never sent: during a game press A, Enter and arrow keys; the /api/ws frames in DevTools Network show only hello and events messages whose events are start/flap/pause/resume/death — DevTools Network > WS frames`
  - `[manual] with the API server stopped, the game still plays without stutter and the status line says the game is not recorded; the console has no errors other than the failed connection attempts — browser`
- **Depends on:** S2, C1

## Sprint summary

- **Synced with merge-target:** up to date (0 new commits on `main` at sprint start)
- **Slices shipped:** P1, S1 (wave 1, PR #4), S2, C1 (wave 2, PR #5), C2 (wave 3, PR #6) — each engineer worked test-first (C2 all `[manual]`) and browser-verified its own runtime
- **Queue entries:** resolved 7 (5 folded-in game-core entries, the S2 `SOLVED` in-order note, and the C1 C2-wiring note), deferred 7 — the `PENDING` entries with `sprint: recording` still marked pending in `docs/handoff-queue.md` (P1 extra id limit; S1 test-commit and Node 22 warning; C1 session/recorder API changes; S2 replay cap for birds alive at the limit, and ingest rules beyond spec; C2 no test commit and proxy 500s when the API is down)
- **Approximate token cost:** ~600k subagent tokens (planner ~73k, P1 ~72k, S1 ~95k, S2 ~123k, C1 ~110k, C2 ~123k) plus orchestration
