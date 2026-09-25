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
Consequences: dev games can be told apart (they still count in stats; see "Which games count in the stats"); production seeds stay server-only.

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
_Superseded (the page part) by "Override: stats live in a right-hand panel beside the game" (2026-09-25); the inline-SVG charts stay._
Context: the trend needs a view, and the client has no framework or chart library.
Decision: "My stats" is a second Vite page (`stats.html`); charts are plain inline SVG strings built by a small helper.
Consequences: no new dependency; the page is simple but the charts are basic.

## 2026-09-25 — Funny names are made on the server
Context: plan `arcade-refresh` drops the nickname form; a fresh browser should play a recorded game with no typing.
Decision: when `POST /api/players` gets no `nickname`, the server picks `<Adjective> <Animal> <n>` (`n` 1–99, e.g. `Wobbly Otter 42`) from the word lists in `apps/server/src/names.ts`. Words are family-friendly, capitalized letters only, and every name fits the same 1–20 character rule as typed names (`cleanNickname`). Names are not unique. Existing players keep their names (no migration).
Consequences: the word lists are easy to extend; two players can get the same name, which is fine because the player id is the identity.

## 2026-09-25 — Players can rename
Context: a generated name may not suit the player.
Decision: `PATCH /api/players/:id` renames a player: `{ nickname }` is checked with the same `cleanNickname` rule (400 if bad), no nickname picks a new funny name (the page's `Random name`), an unknown id gives 404. Only the name changes; the id, games and stats stay attached. Like every other route it trusts the player id, with no auth — this refines "Nickname-only players".
Consequences: anyone who knows a player id can rename that player (accepted, same as recording games under it). Registration now runs on every fresh visit with no typing, so rate limits matter more before any hosting.

## 2026-09-25 — Override: stats live in a right-hand panel beside the game
Context: plan `arcade-refresh` wants one page; "My stats is its own page" (2026-09-24) made players leave the game to see their trend. This is a deliberate override of that entry.
Decision: `stats.html` is removed. One stats UI lives in a right-hand panel on the game page: a `Last game` card on top (the server summary, kept visible while the next game is played), then `My stats` (headline, charts, table). `My stats` reloads after the server has finished each game (when the Last game card gets its summary), with no page reload. On narrow screens (≤ 720 px) the panel stacks below the game.
Consequences: Vite builds one page; stats code is shared with the game page; the panel's refresh follows the same wait-for-result rule as the summary, so it never races the server.

## 2026-09-25 — Retro arcade look, drawn in code
Context: plan `arcade-refresh` wants the whole app, canvas included, to look like a retro arcade game, with no image files and no outside services.
Decision: the direction is "Dusk Cabinet", written as the header comment of `apps/client/src/styles/theme.css`: the page is a dusk-violet arcade cabinet around the game, with the stats panel as its scoreboard; hard pixel edges, no rounded corners or blurred shadows, a 4 px grid. The font is Pixelify Sans (SIL Open Font License 1.1), self-hosted through `@fontsource/pixelify-sans` (Vite bundles the woff2; no font CDN, ligatures off). Palette roles: `bg`/`surface`/`surfaceAlt` for the cabinet and panels, `text`/`textMuted`, `accent` buttons (pipe green) with `accentText`, `highlight` for marquee and scores (bird yellow), `danger`, `focus`, `border`, `chartLine` (sky cyan), plus `shadow` and `scrim`. The tokens have one source: `apps/client/src/theme.ts` (`PALETTE`, `PIXEL_FONT` / `BODY_FONT`) mirrored in `theme.css` as `--color-*` / `--font-*`, kept equal by `theme.test.ts`. Contrast minimums, checked by `CONTRAST_PAIRS`: 4.5:1 for text, 3:1 for the focus ring and chart lines. The canvas is drawn in `render.ts` with canvas calls only, sized and placed from engine constants and game state, with no images and no wall-clock animation (it only moves with the game).
Consequences: the client gets one font package (a runtime dependency); a later restyle starts from the tokens, not from raw colors; the engine, its constants, the recording and replays are untouched, so past games and the seed-42 smoke values stay the same.
