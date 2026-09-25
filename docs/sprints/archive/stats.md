# Sprint: stats

_From plan: docs/plans/flappy-efficiency-mvp.md · Slug: stats · Status: archived · Generated: 2026-09-24_

## Status board

| Wave | Slice | Title | Branch | PR | Status | Depends on |
|------|-------|-------|--------|----|--------|------------|
| 1 | S1 | Server metrics from replay: per-flap trace, the wasted-flap rule, game summary, player trend, two read routes, shared stats types, decisions | stats-s1 | merged | done | — |
| 1 | C1 | Client building blocks: inline-SVG trend chart and number/cause formatting | stats-c1 | merged | done | — |
| 2 | C2 | Game-over summary panel from the server | stats-c2 | merged | done | S1, C1 |
| 2 | C3 | "My stats" page with trend charts, smoke recipe and brief update | stats-c3 | merged | done | S1, C1 |

Wave membership lives in the **Wave** column — **computed by the planner, not authored** (see Field semantics). Slices in a wave run in parallel and own disjoint files. Authored levels: **plan → sprint → slice**. Engineers push branches; the orchestrator integrates each wave into **one PR** on the plan branch (see **Branch naming**).

Why two waves: both client screens need the server's summary/stats routes and the shared response types (S1) to be browser-checked, and both use C1's chart/format helpers. S1 and C1 share no files, so they run together; C2 and C3 own disjoint files, so they run together. This is the plan's last sprint.

### API contract (S1 builds it, C2/C3 use it)

Types live in `packages/engine/src/stats.ts` (types only, no logic — the metrics themselves are server-side) and are exported from the engine root.

- `WasteReason = 'rising' | 'overshoot'`
- `FlapGapStats = { average: number; shortest: number; longest: number }` — milliseconds of **game time** between consecutive applied flaps.
- `GameSummary = { gameId, playedAt: number (games.last_event_at), seedSource: 'server' | 'dev', score, deathStep, deathCause: DeathCause, durationMs, flaps, presses, extraPresses, scorePerFlap: number | null, wastedFlaps, wastedRising, wastedOvershoot, flapGapMs: FlapGapStats | null, mismatch: boolean, countsInStats: boolean }`
- `TrendGame = { gameId, playedAt, score, flaps, scorePerFlap: number | null, wastedFlaps, wastedShare: number | null, averageFlapGapMs: number | null, deathCause }`
- `PlayerStats = { playerId, nickname, games: TrendGame[] /* oldest first */, totals: { games, averageScore: number | null, averageScorePerFlap: number | null, wastedShare: number | null, deathCauses: Record<DeathCause, number> } }`
- `GET /api/games/:id/summary` → `200 GameSummary`; `404 { error: 'unknown game' }`; `409 { error: 'not-complete' }` (status `created` / `open` / `incomplete`); `409 { error: 'no-server-result' }` (status `complete` but no server death — alive at the replay cap).
- `GET /api/players/:id/stats` → `200 PlayerStats`; `404 { error: 'unknown player' }`.

### Decisions made in this sprint (S1 writes them to `docs/decisions.md`)

- **Wasted flap rule** (plan key decision, not yet in `decisions.md`). A flap is wasted if (a) **rising**: the bird's `vy < 0` in the state the flap is applied to, or (b) **overshoot**: after the flap, with no further flap, the bird's highest point (smallest `y`, found by stepping the engine with `flap: false` until `vy >= 0` or death) is above the top of the next pipe gap (`peakY < gapY - PIPE_GAP / 2`), where the next pipe is the first pipe with `scored === false` in the pre-flap state. Rising is checked first, so each wasted flap has one reason. The rule lives in **one** server function, `wastedFlapReason` in `apps/server/src/metrics.ts`, so it can be tuned after playtesting.
- **Metrics are computed on read, not stored.** Each request replays the stored events with the engine's `createGame`/`step`, so no new columns, no migration and no backfill for existing complete games; tuning the rule changes every past game's numbers at once. The trend is capped at the player's last `MAX_TREND_GAMES = 100` counted games to bound the work. If it gets slow, caching is a later change.
- **"Flaps" means applied flaps** (distinct flap steps before death, the stored `flapCount`). Score per flap, wasted flaps and time between flaps all use applied flaps. Extra presses in the same step (`presses - flaps`, from `pressCount`) do nothing to the bird, so they are **not** counted as wasted; they are reported apart as `extraPresses`.
- **Which games count in stats:** status `complete`, a server death (`death_step` not null) and `mismatch = 0`, for that player. `created` / `open` / `incomplete` games never count. Games still alive at the server's replay cap (stored `complete` with null death and `mismatch = 1`, no `result` message) get no summary (`409 no-server-result`) and no trend point. Other `mismatch` games (the client's claimed score/death differs from the replay) still get a summary built from the server replay, flagged `mismatch: true, countsInStats: false`, but are left out of the trend: the player saw a different game than the one the server replayed. Dev-seeded games (`seedSource: 'dev'`) **do** count — they only exist outside production, and the smoke check needs them.
- **Flap timing uses game steps** (`stepsToMs` of step gaps), so paused time and network delay never count.
- **Trend order** is `last_event_at` (when the game was last played), then id.
- **"My stats" is its own Vite page** (`stats.html`), and the charts are plain inline SVG — no new dependency.

### Dependency hotspots

None. No slice touches any `package.json`, `pnpm-lock.yaml` or `pnpm-workspace.yaml`.

### Handoff-queue entries folded in

- S2 "server replay cap … a bird still alive at the cap is stored `complete` with null death + `mismatch = 1` … the stats sprint should decide" → decided above (no summary, no trend point); S1 tests it.
- E1 "engine defaults chosen … `flapCount` counts only flaps before death" → kept; S1's "flaps" is exactly that count, and its trace must agree with the stored `flap_count`.
- The pressCount vs flapCount question (decision "Record raw flap presses") → settled above: applied flaps for every metric, extra presses reported apart and never wasted.
- The orchestrator writes the Resolution lines at archive time; slices only append new entries.

### Plan Verification coverage (end of plan)

| Verification item | Covered by |
|---|---|
| `pnpm install && pnpm dev`, 60 Hz on any refresh rate | game-core C2 |
| Same seed + inputs → same result on client and server | game-core E1, recording P1/C1 tests |
| Stored game with every flap, seed, server score matching the client | recording S2/C2 |
| Network cut → complete game, no duplicates; never-reconnected game is incomplete **and left out of the stats** | recording S2/C2; the stats half is S1 › `player stats count only complete, matching games of that player` |
| Game-over screen shows score, flaps, score per flap, wasted flaps, flap timing, death cause, all from the server | S1 (summary route), C2 (panel) |
| "My stats" shows a trend across the player's complete games | S1 (stats route), C3 (page) |
| Non-game keys never sent | game-core C1, recording C2 |
| CI runs the verification command and gitleaks on every PR | `.github/workflows/pod-ci.yml` (existing); C3 fixes the stale "Not running yet" line in the brief |
| Working smoke recipe; `decisions.md` has the key decisions | C3 (smoke recipe); S1 adds the missing "wasted flap rule" entry (the other plan decisions already have entries) |

## Per-slice detail

### S1: Server metrics from replay, summary and stats routes
- **Scope:** Everything the server computes for stats, plus the two read routes and the shared response types.
  - `packages/engine/src/stats.ts` (new): the types in **API contract** above, types only. Re-export from `packages/engine/src/index.ts`.
  - `apps/server/src/metrics.ts` (new), pure over the DB and engine:
    - `interface FlapPoint { step; y; vy; peakY; gapTop: number | null; gapBottom: number | null }` — bird `y`/`vy` in the state the flap is applied to; `peakY` as in the rule; the gap edges of the first unscored pipe in that state.
    - `traceFlaps(seed, flapSteps, maxSteps)` → `{ points: FlapPoint[]; final: GameState }`, built only with engine `createGame` + `step` (same loop as engine `replay`, one point per applied flap; flaps listed at or after death are not points). The peak look-ahead steps a copy and never changes the main run.
    - `wastedFlapReason(point: FlapPoint): WasteReason | null` — **the only place the rule lives.** `rising` if `vy < 0`; else `overshoot` if `gapTop !== null && peakY < gapTop`; else `null`.
    - `summarizeGame(game: GameRecord, events: StoredEvent[]): GameSummary | null` — `null` unless `status === 'complete'` and `deathStep !== null`. Replays with `traceFlaps(game.seed, flapStepsFromEvents(...), game.deathStep + 1)`; score, death and flaps come from the trace (never from the client's `death` event or `client_*` columns); `presses` = number of flap events; `durationMs = stepsToMs(deathStep)`; `scorePerFlap = score / flaps` (null when 0 flaps); `flapGapMs` from consecutive applied-flap step gaps via `stepsToMs` (null with fewer than 2 flaps); `countsInStats = !mismatch`.
    - `MAX_TREND_GAMES = 100`; `playerStats(db, playerId): PlayerStats | undefined` (undefined for an unknown player) — counted games only (see decisions), ordered by `last_event_at`, id; the last `MAX_TREND_GAMES`, oldest first. Totals over those games: `averageScore`, `averageScorePerFlap = Σscore / Σflaps`, `wastedShare = Σwasted / Σflaps` (null when there are no games or no flaps), `deathCauses` counts with all three keys present.
  - `apps/server/src/statsRoutes.ts` (new, Fastify plugin `{ db }`): the two routes in the API contract. Register it in `app.ts`.
  - `docs/decisions.md`: one entry per item in **Decisions made in this sprint**.
  - NOT in scope: changes to ingest/finalize, the schema, stored results, client code, new deps. Do not add metric columns.
- **Files owned:**
  - `packages/engine/src/stats.ts` (new)
  - `packages/engine/src/index.ts`
  - `apps/server/src/metrics.ts` (new)
  - `apps/server/src/metrics.test.ts` (new)
  - `apps/server/src/statsRoutes.ts` (new)
  - `apps/server/src/statsRoutes.test.ts` (new)
  - `apps/server/src/app.ts`
  - `docs/decisions.md`
- **Success criteria:**
  - `[test] wastedFlapReason gives 'rising' for vy < 0 (even when it also overshoots), 'overshoot' for vy >= 0 with peakY above gapTop, null for a peak inside the gap, and ignores overshoot when gapTop is null — apps/server/src/metrics.test.ts › wastedFlapReason applies the rising and overshoot rule`
  - `[test] traceFlaps on seed 42 with the locked flaps [13,52,90,128,166,199,237] gives 7 points at those steps, each point's y/vy equal to the engine state stepped to that step, and a final score 2 / death step 296 / cause 'ground' equal to engine replay — apps/server/src/metrics.test.ts › traceFlaps records the bird state before each applied flap`
  - `[test] on seed 42, flaps [13, 16]: the flap at 16 is 'rising' (vy -5.8 before it) — apps/server/src/metrics.test.ts › a flap soon after another is wasted as rising`
  - `[test] a real replay (the engineer finds and locks a seed + flap list) where a flap's peak goes above the next gap top counts as 'overshoot' — apps/server/src/metrics.test.ts › a flap that lifts the bird above the next gap is an overshoot`
  - `[test] summarizeGame on the ingested locked seed-42 run gives score 2, deathStep 296, deathCause 'ground', durationMs 296000/60, flaps 7, presses 7, extraPresses 0, scorePerFlap 2/7, flapGapMs { average: 224/6 steps in ms (~622.2), shortest 550, longest 650 }, wastedRising 0, and a wastedOvershoot value locked here as the smoke-recipe value — apps/server/src/metrics.test.ts › summarizeGame gives the locked seed-42 summary`
  - `[test] the same run with two presses on step 52 gives flaps 7, presses 8, extraPresses 1 and the same wasted counts — apps/server/src/metrics.test.ts › extra presses in one step are not flaps or waste`
  - `[test] adding pause/resume events between flaps does not change flapGapMs — apps/server/src/metrics.test.ts › flap timing uses game steps so pauses do not count`
  - `[test] a death event claiming score 99 gives a summary with the replay score 2, mismatch true, countsInStats false — apps/server/src/metrics.test.ts › client claims never reach the summary`
  - `[test] summarizeGame is null for created, open and incomplete games, and for a complete game with no death (ingested with a small maxReplaySteps) — apps/server/src/metrics.test.ts › no summary without a server death`
  - `[test] summary score, deathStep, deathCause and flaps equal the stored game record's score, deathStep, deathCause and flapCount — apps/server/src/metrics.test.ts › summary agrees with the stored replay result`
  - `[test] with two matching complete games, plus an incomplete, an open, a created, a mismatch, an alive-at-cap game and another player's complete game, playerStats lists only the two, oldest (by last_event_at) first — apps/server/src/metrics.test.ts › player stats count only complete, matching games of that player`
  - `[test] totals: averageScore, averageScorePerFlap = total score / total flaps, wastedShare = total wasted / total flaps, and deathCauses with all three keys — apps/server/src/metrics.test.ts › player stats totals add up across games`
  - `[test] with MAX_TREND_GAMES + 1 counted games only the newest MAX_TREND_GAMES are returned — apps/server/src/metrics.test.ts › player stats keep only the newest games`
  - `[test] a known player with no counted games gets games [] and null averages; an unknown player gives undefined — apps/server/src/metrics.test.ts › player with no games has empty stats`
  - `[test] GET /api/games/:id/summary returns 200 with the locked seed-42 summary (Fastify inject) — apps/server/src/statsRoutes.test.ts › summary route returns the server summary`
  - `[test] summary route gives 404 for an unknown id and 409 'not-complete' for created, open and incomplete games — apps/server/src/statsRoutes.test.ts › summary route rejects games that are not complete`
  - `[test] summary route gives 409 'no-server-result' for a game alive at the replay cap — apps/server/src/statsRoutes.test.ts › summary route rejects games with no server death`
  - `[test] GET /api/players/:id/stats returns the player's trend, or 404 for an unknown player — apps/server/src/statsRoutes.test.ts › stats route returns the player trend`
  - `[manual] docs/decisions.md has entries for the wasted flap rule, metrics on read, flaps vs presses, which games count, step-based timing and the stats page/SVG choice — read the file`
- **Depends on:** —

### C1: Client chart and formatting helpers
- **Scope:** Pure, DOM-free helpers that C2 and C3 build on. They take plain numbers, so they do not need S1's types.
  - `format.ts` (new): `formatSeconds(ms)` → seconds with 2 decimals (`622.2` → `'0.62'`); `formatRatio(x: number | null)` → 2 decimals or `'-'`; `formatPercent(share: number | null)` → whole percent (`0.286` → `'29%'`) or `'-'`; `causeText(cause: DeathCause)` → `'Hit the ground'` / `'Hit the top pipe'` / `'Hit the bottom pipe'` (moved from `render.ts`, which now imports it; drawing unchanged).
  - `chart.ts` (new): `trendChartSvg(values: number[], { width, height, title, format? }): string` → an `<svg>` string: the title, a `<polyline>` through one point per value (left to right, oldest first), a `<circle>` per point, and min/max labels on the y axis (using `format`, default `String`). Points stay inside the box with a fixed padding. Empty → an SVG with `No complete games yet` and no polyline. All-equal values draw a flat line in the middle (no `NaN`). Text is XML-escaped.
  - NOT in scope: fetching, DOM, `main.ts`, pages, server code, new deps.
- **Files owned:**
  - `apps/client/src/format.ts` (new)
  - `apps/client/src/format.test.ts` (new)
  - `apps/client/src/chart.ts` (new)
  - `apps/client/src/chart.test.ts` (new)
  - `apps/client/src/render.ts`
- **Success criteria:**
  - `[test] formatSeconds(622.2) is '0.62', formatSeconds(550) is '0.55'; formatRatio(2/7) is '0.29' and formatRatio(null) is '-'; formatPercent(0.286) is '29%' and formatPercent(null) is '-' — apps/client/src/format.test.ts › formats numbers for the stats screens`
  - `[test] causeText gives the three death texts — apps/client/src/format.test.ts › death cause text`
  - `[test] three values give one polyline with three points and three circles, x increasing, the largest value highest (smallest y), all inside width x height — apps/client/src/chart.test.ts › plots one point per value in order`
  - `[test] an empty list gives 'No complete games yet' and no polyline — apps/client/src/chart.test.ts › empty chart says there are no games`
  - `[test] one value, and several equal values, give finite coordinates (no NaN) — apps/client/src/chart.test.ts › flat or single-point data does not break`
  - `[test] a title '<b>&' comes out as '&lt;b&gt;&amp;' — apps/client/src/chart.test.ts › escapes text`
  - `[test] min and max labels use the given format — apps/client/src/chart.test.ts › labels use the format function`
- **Depends on:** —

### C2: Game-over summary panel
- **Scope:** After a recorded game ends, show the server's summary under the canvas. Every number in the panel comes from `GET /api/games/:id/summary` — never from the session.
  - `summary.ts` (new):
    - `fetchSummary(fetchFn, gameId)` → `{ ok: true, summary: GameSummary } | { ok: false, reason: 'pending' | 'no-result' | 'error' }`. GET `/api/games/<encoded id>/summary`; `409 not-complete` → `pending`; `409 no-server-result` → `no-result`; anything else or a network error → `error`. Never throws.
    - `summaryLines(summary)` → exactly these lines, using C1's `format.ts`:
      - `Score: <score>`
      - `Flaps: <flaps>`, plus ` (<presses> presses)` when `presses > flaps`
      - `Score per flap: <formatRatio>`
      - `Wasted flaps: <wasted> of <flaps> (<rising> while rising, <overshoot> too high)`, or `Wasted flaps: 0` when `flaps` is 0
      - `Time between flaps: <avg> s on average (<shortest> to <longest> s)`, or `Time between flaps: -` when `flapGapMs` is null
      - `Died: <causeText>`
      - when `mismatch`: a last line `Not counted in your stats: the server replay differs from the game`
  - `main.ts`: when the session is `over` with a `gameId`, fetch the summary once the `result` message for that game arrives; if no result has come 5 s after game over, try once anyway (covers a game alive at the replay cap). Panel states: `Waiting for the server…` (`pending` or not fetched yet), the lines above under the heading `Game summary (from the server)`, `The server could not score this game` (`no-result`), `Could not load the summary` (`error`). A game over with `gameId === null` shows `This game was not recorded`. The panel is shown only in `over` and is hidden in `ready`, `playing` and `paused`. A late result for an older game is ignored. Dev hook: add `summary` (the last fetched `GameSummary` for the current game, or null).
  - `index.html`: a `<section id="summary" hidden aria-live="polite">` under the canvas and a `My stats` link to `/stats.html`.
  - NOT in scope: the stats page, `vite.config.ts`, server code, `session.ts`/`recorder.ts`/`api.ts` logic, the canvas overlay (it keeps showing the client's score during play), `docs/codebase-structure.md` (C3 documents this panel from the text above), new deps.
- **Files owned:**
  - `apps/client/src/summary.ts` (new)
  - `apps/client/src/summary.test.ts` (new)
  - `apps/client/src/main.ts`
  - `apps/client/index.html`
- **Success criteria:**
  - `[test] fetchSummary GETs /api/games/<id>/summary and returns the summary on 200 — apps/client/src/summary.test.ts › fetchSummary returns the server summary`
  - `[test] 409 not-complete gives 'pending', 409 no-server-result gives 'no-result' — apps/client/src/summary.test.ts › fetchSummary maps 409 answers`
  - `[test] a rejected fetch or a 500 gives 'error' without throwing — apps/client/src/summary.test.ts › fetchSummary never throws`
  - `[test] a summary with score 2, flaps 7, presses 8, scorePerFlap 2/7, wastedFlaps 1 (1 rising, 0 overshoot), flapGapMs { 622.2, 550, 650 }, cause 'ground', no mismatch gives exactly ['Score: 2', 'Flaps: 7 (8 presses)', 'Score per flap: 0.29', 'Wasted flaps: 1 of 7 (1 while rising, 0 too high)', 'Time between flaps: 0.62 s on average (0.55 to 0.65 s)', 'Died: Hit the ground'] — apps/client/src/summary.test.ts › summaryLines formats a summary`
  - `[test] zero flaps gives 'Score per flap: -', 'Wasted flaps: 0' and 'Time between flaps: -'; a mismatch adds the not-counted line — apps/client/src/summary.test.ts › summaryLines handles no flaps and mismatch`
  - `[manual] scripted run shows the server summary: open http://localhost:3000/?seed=42&flaps=13,52,90,128,166,199,237; after game over the panel shows 'Game summary (from the server)' with Score: 2, Flaps: 7, Score per flap: 0.29, Time between flaps: 0.62 s on average (0.55 to 0.65 s), Died: Hit the ground and the wasted line matching S1's locked value, and window.__flappy.summary deep-equals await (await fetch('/api/games/' + __flappy.gameId + '/summary')).json() — browser + console`
  - `[manual] the panel is hidden while playing, shows 'Waiting for the server…' briefly after death, and hides on restart; with the API stopped a game over shows 'This game was not recorded' — browser`
  - `[manual] a manual game with a double press (Space + click in one frame, or fast repeated taps) shows presses in the Flaps line when they landed in one step, and the numbers match GET /api/games/<id>/summary — browser`
  - `[manual] the 'My stats' link opens /stats.html; the console has no errors — browser`
- **Depends on:** S1, C1

### C3: "My stats" page, smoke recipe and brief
- **Scope:** A second page showing the current player's trend across counted games, plus the docs for this whole sprint.
  - `stats.ts` (new, pure):
    - `fetchStats(fetchFn, playerId)` → `{ ok: true, stats: PlayerStats } | { ok: false, reason: 'unknown-player' | 'error' }` (404 → `unknown-player`; other status or network error → `error`; never throws).
    - `statsView(stats)` → `{ headline: string[]; scorePerFlap: number[]; wastedPercent: number[]; rows: string[][] }`. Headline: `Games: <n>`, `Average score: <formatRatio>`, `Score per flap: <formatRatio>`, `Wasted flaps: <formatPercent>`, `Deaths: <g> ground, <t> top pipe, <b> bottom pipe`; with no games, headline is just `No complete games yet - play a game first`. Series are oldest first and skip games whose value is null (no flaps). Rows are newest first: date/time (`new Date(playedAt).toLocaleString()`), score, flaps, score per flap, wasted (`<n> (<percent>)`), average time between flaps (`<s> s` or `-`), death (`causeText`).
  - `statsPage.ts` (new, DOM entry): reads the player with `loadPlayer(localStorage)` (import only, `api.ts` is not owned). No player → `No player yet - play a game first` and a link back. Otherwise shows the nickname, the headline, two charts from `trendChartSvg` (`Score per flap` with `formatRatio`, `Wasted flaps (%)`) inserted as SVG, and a table from `rows`. `unknown-player` → the no-player message; `error` → `Could not load your stats`. A `Back to the game` link to `/`.
  - `stats.html` (new): the page shell with the same basic style as `index.html` and the empty inline favicon.
  - `vite.config.ts`: `build.rollupOptions.input` with both `index.html` and `stats.html` (resolved from `import.meta.url`), so `pnpm build` emits both; dev proxy unchanged.
  - `docs/codebase-structure.md`: status line (stats done); server part (metrics computed on read from stored events; the two routes; the one wasted-flap rule function); client part (summary panel, `stats.html`); fix the CI section's stale "Not running yet" line (the remote exists and PRs #2–#6 ran it — confirm with the PR checks). Smoke recipe: after the recorded scripted run, the summary panel lines and `window.__flappy.summary` (values from S1's locked test and C2's line format), `GET /api/games/<id>/summary` and `GET /api/players/<id>/stats`; a **Stats check** (`http://localhost:<WEB_PORT>/stats.html` after N scripted runs shows `Games: N`, N rows and N points per chart; incomplete and unrecorded games are not listed); add `summary` to the dev hook fields.
  - NOT in scope: `main.ts`, `index.html`, `summary.ts`, server code, `docs/decisions.md` (S1's), new deps.
- **Files owned:**
  - `apps/client/src/stats.ts` (new)
  - `apps/client/src/stats.test.ts` (new)
  - `apps/client/src/statsPage.ts` (new)
  - `apps/client/stats.html` (new)
  - `apps/client/vite.config.ts`
  - `docs/codebase-structure.md`
- **Success criteria:**
  - `[test] fetchStats GETs /api/players/<id>/stats and returns stats on 200, 'unknown-player' on 404, 'error' on a 500 or a rejected fetch, never throwing — apps/client/src/stats.test.ts › fetchStats maps server answers`
  - `[test] for two games the headline shows Games: 2, the averages and the death counts, and rows are newest first with formatted cells — apps/client/src/stats.test.ts › statsView builds the headline and rows`
  - `[test] chart series are oldest first and leave out games with no flaps — apps/client/src/stats.test.ts › statsView series skip games with no flaps`
  - `[test] no games gives the single 'No complete games yet - play a game first' headline, empty series and no rows — apps/client/src/stats.test.ts › statsView with no games`
  - `[manual] after two recorded scripted runs (reload the seed-42 URL twice with the same player), http://localhost:3000/stats.html shows the nickname, 'Games: 2', two charts with two points each and two table rows whose numbers match GET /api/players/<id>/stats; the console has no errors — browser`
  - `[manual] a game cut off with window.__flappy.disconnectFor(600000) (server started with GAME_IDLE_TIMEOUT_MS=10000) and an unrecorded game (API stopped) do not appear on the stats page — browser + fetch`
  - `[manual] with no stored player (fresh profile) the page shows 'No player yet - play a game first' and the link back works — browser`
  - `[manual] the charts and table look right (readable labels, points in order, no overflow) — visual check; a test can't judge layout`
  - `[manual] pnpm check passes and apps/client/dist contains both index.html and stats.html — terminal`
  - `[manual] the smoke recipe's new summary and stats steps work as written on the integrated branch — follow docs/codebase-structure.md`
- **Depends on:** S1, C1

## Sprint summary

- **Synced with merge-target:** up to date (0 new commits on `main` at sprint start)
- **Slices shipped:** S1, C1 (wave 1, PR #7), C2, C3 (wave 2, PR #8) — each engineer worked test-first and browser-verified its own runtime; the orchestrator followed the new Summary and Stats smoke checks on the combined wave-2 head
- **Queue entries:** resolved 2 (recording S2's replay-cap question → 409 `no-server-result`; S1's locked values → smoke recipe), deferred 5 — the `PENDING` entries with `sprint: stats` still marked pending in `docs/handoff-queue.md` (chart label/color notes; S1 stub-in-test-commit and `playedAt` fallback; C2 `[manual]`-only wiring and untested-in-browser load-error state; C3 zero-flap chart text, empty-200 handling, and the `pnpm dev` shutdown doc gap)
- **Approximate token cost:** ~520k subagent tokens (planner ~109k, S1 ~113k, C1 ~89k, C2 ~97k, C3 ~110k) plus orchestration
