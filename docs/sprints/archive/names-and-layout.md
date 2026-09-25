# Sprint: names-and-layout

_From plan: docs/plans/arcade-refresh.md · Slug: names-and-layout · Status: archived · Generated: 2026-09-25_

## Status board

| Wave | Slice | Title | Branch | PR | Status | Depends on |
|------|-------|-------|--------|----|--------|------------|
| 1 | S1 | Server funny names (word lists), nickname-free `POST /api/players`, rename route `PATCH /api/players/:id` | names-and-layout-s1 | merged | done | — |
| 1 | C1 | Client player calls: optional-nickname register, rename, `ensurePlayer` / `changeName` / `nicknameError` | names-and-layout-c1 | merged | done | — |
| 1 | C2 | "Last game" tracker (wait-for-result logic pulled out of `main.ts`) and chart fixes | names-and-layout-c2 | merged | done | — |
| 2 | C3 | One-page layout: name bar with change/reroll, right-hand panel (Last game + My stats) with refresh, stats page removed | names-and-layout-c3 | merged | done | S1, C1, C2 |
| 2 | D1 | Docs: brief + smoke recipe for the new flow, decisions (names, rename, panel override), doc fixes | names-and-layout-d1 | merged | done | S1, C1, C2 |

Wave membership lives in the **Wave** column — **computed by the planner, not authored** (see Field semantics). Slices in a wave run in parallel and own disjoint files. Authored levels: **plan → sprint → slice**. Engineers push branches; the orchestrator integrates each wave into **one PR** on the plan branch (see **Branch naming**).

Why two waves: all testable logic (server names/rename, client player calls, the Last-game tracker, chart fixes) is split into disjoint files and runs first. `main.ts` + `index.html` can only have one owner, so all DOM wiring is one slice (C3) in wave 2, next to the docs slice (D1), which writes from the texts fixed in this doc (as the stats sprint's C3 did).

**This sprint is structure only.** Styling stays minimal and neutral (plain flex layout, system font). No colors, fonts or canvas changes — that is the `arcade-look` sprint. The engine, its constants, the canvas size (288 × 512), `render.ts`, `session.ts`, `recorder.ts`, the recording protocol and every metric stay unchanged; the seed-42 smoke values must not move.

### API contract (S1 builds it, C1 calls it)

- `POST /api/players`
  - no body, or a body with no `nickname` key (or `nickname: undefined`) → the server picks a funny name → `201 { id, nickname }`.
  - `nickname` present → `cleanNickname` as today; invalid (including `null`, `""`, spaces only, 21+ chars, non-string) → `400 { error }` (unchanged).
- `PATCH /api/players/:id` (new)
  - body `{ nickname: string }` → cleaned with `cleanNickname`; invalid → `400 { error: 'nickname must be 1-20 characters' }`.
  - no body, `{}`, or no `nickname` key → the server picks a new funny name (the "reroll").
  - unknown id → `404 { error: 'unknown player' }` (checked before the body is used).
  - success → `200 { id, nickname }`. Only `players.nickname` changes; the id, games and events stay, so stats stay attached.
- `GET /api/players/:id` and `GET /api/players/:id/stats` — unchanged (the stats `nickname` shows the new name after a rename).

**Funny name format:** `<Adjective> <Animal> <n>`, one space between parts, `n` a whole number 1–99, e.g. `Wobbly Otter 42`. Words are family-friendly, capitalized, letters only (`/^[A-Z][a-z]+$/`), no duplicates, at least 20 adjectives and 20 animals, and **every** combination with `99` passes `cleanNickname` unchanged (≤ 20 chars — so the longest adjective + longest animal must be ≤ 15 letters). The exact lists are the engineer's first pick; they're easy to extend later (plan open question).

### Client behavior fixed here (C1/C2 build the logic, C3 wires it, D1 documents it)

- **First visit:** no form. The page calls `ensurePlayer`; a fresh browser gets a funny name from the server, stores it (`flappy.player`) and records right away. A stored player is checked (`GET /api/players/:id`): known → kept, using the server's current nickname; `404` → cleared and replaced by a new funny-named player; server can't answer → the stored player is kept (as today). If a fresh browser can't register (API down), the game plays unrecorded and the page retries every 5 s (`PLAYER_RETRY_MS = 5000`) until it gets a player. The old scripted-run special case (register `smoke`) is removed — scripted runs get a funny name like everyone else.
- **Name bar** (above the canvas, hidden until there is a player): `Playing as <name>` and a `Change` button. `Change` opens a small form: a text box (prefilled with the current name, `maxlength="20"`), `Save`, `Random name` and `Cancel`, plus an error line. `Save` checks `nicknameError` first (`Use 1 to 20 characters.`), then renames; `Random name` rerolls on the server and keeps the form open (so the player can reroll again); success updates the name bar and the `Recording as …` line at once and saves to `localStorage`; `Save` success closes the form. Any failure shows `Could not change the name. Try again.` (or the server's invalid → `Use 1 to 20 characters.`) and keeps the old name. Closing the form (Save/Cancel) blurs the focused element so Space flaps again. Keys whose target is an `input` or `button` are not game input.
- **Right-hand panel** `<aside id="panel">`: on top a `Last game` card, then `My stats` (headline totals, the two charts, the recent-games table — the same content `stats.html` showed, minus the nickname heading, which the name bar now shows). Wide screens: game left, panel right. Narrow screens (≤ 720 px): the panel stacks below the game; the page never scrolls sideways (the table scrolls inside its own wrapper).
- **Last game card** (always visible; heading `Last game`): lines from `lastGameView` —
  - before any game ends on this page: `No game yet - flap to start`
  - game over with no server game: `This game was not recorded`
  - waiting: `Waiting for the server…`
  - loaded: exactly `summaryLines(summary)` (unchanged texts: `Score: 2`, `Flaps: 7`, …)
  - `no-result`: `The server could not score this game`; `error`: `Could not load the summary`.
  - **It keeps showing the last finished game while the next game is played** (today's panel hid on restart). A new game over replaces it; a late result or fetch for an older game is ignored.
- **Stats refresh:** `My stats` loads once when the player is known, and again each time the Last-game tracker reaches `shown` (the server has finished that game — the same wait-for-result rule the summary uses, so the refresh never races the server). No page reload. The first load shows `Loading…`; later refreshes keep the old content until the new one arrives; an older response arriving after a newer one is ignored. Errors show `Could not load your stats`. With no counted games: `No complete games yet - play a game first` (unchanged `statsView` text). If every counted game has 0 flaps, the charts say `No games with flaps yet` (was the misleading `No complete games yet`).
- **Dev hook `window.__flappy`:** fields unchanged (`summary` keeps its meaning: the loaded summary of the **current** game, or null) plus a new `stats` field: the last loaded `PlayerStats`, or null.
- **Status line** (`#recording`) texts unchanged, except the no-player text: `Getting your player name…` while the first registration is in flight, `Offline - this game is not recorded` when it failed. `Enter a nickname to record your games` is gone.

### Handoff-queue entries folded in

- `[2026-09-24 · PENDING · reviewer → human · sprint: stats · slice: C3]` statsPage reads `localStorage` without a guard → resolved by deleting `statsPage.ts`; the panel lives in `main.ts`, which uses `pageStorage()` (C3).
- `[2026-09-24 · PENDING · engineer → human · sprint: stats · slice: C3]` zero-flap games make both charts say `No complete games yet` → `trendChartSvg` gets an `emptyText` option and the panel passes `No games with flaps yet` (C2, C3). The same entry's `pnpm dev` shutdown doc gap → D1.
- `[2026-09-24 · PENDING · engineer → human · sprint: stats · slice: C1]` equal chart values draw two overlapping y labels → one label when min = max (C2).
- `[2026-09-24 · PENDING · engineer → human · sprint: stats · slice: C2]` `main.ts` panel wiring was `[manual]`-only → the wait-for-result logic moves into a tested module (C2).
- `[2026-09-24 · PENDING · reviewer → human]` brief "Stopping" claims `pnpm dev` stops both apps; "Node ≥ 22" should be `>=22.13` → D1.
- `[2026-09-24 · PENDING · reviewer → human]` `decisions.md` "Client-chosen seeds" says dev games are left out of stats, contradicting "Which games count" → D1 (decisions.md is edited anyway).
- **Not folded** (not touched by this work): rate limits / dev-seed opt-in / `playerId` in `GET /api/games/:id` / recorder resend gaps / duplicated replay logic. Note for the human: `POST /api/players` now runs on every fresh visit with no typing, and the new rename route trusts the player id like every other route — both make the reviewer's rate-limit entry a bit more pressing before any hosting (D1 notes the id trust in decisions).
- The orchestrator writes Resolution lines at archive time; slices only append new entries.

### Plan Verification coverage (this sprint's share)

| Verification item | Covered by |
|---|---|
| Fresh browser plays a recorded game with no typing; funny name shown; game stored under that player | S1, C1 tests; C3 manual |
| Rename (typed or reroll) updates the shown name and the server; past games and stats stay attached | S1 › `rename keeps the player's games`; C1 tests; C3 manual |
| Stored player keeps its nickname | C1 › `ensurePlayer keeps a known stored player`; C3 manual |
| One page: Last game card shows the server summary; totals/charts/recent games include the game with no reload; stats page gone | C2 tests; C3 test + manual |
| Phone width: panel below the game, no horizontal scroll | C3 manual |
| Seed-42 run unchanged | C3 manual (smoke recipe), D1 recipe |
| `pnpm check` + CI; smoke recipe and `decisions.md` updated | every slice; D1 |
| Retro arcade style | next sprint (`arcade-look`) |

### Dependency hotspots

None. No slice touches any `package.json`, `pnpm-lock.yaml` or `pnpm-workspace.yaml`. No new dependencies.

## Per-slice detail

### S1: Server funny names and rename route
- **Scope:** everything in **API contract** above.
  - `apps/server/src/names.ts` (new): `ADJECTIVES` and `ANIMALS` (readonly string arrays) and `funnyName(random: () => number = Math.random): string` — picks `ADJECTIVES[floor(r * len)]`, `ANIMALS[floor(r * len)]`, and `1 + floor(r * 99)` from three successive `random()` calls, joined as `<Adjective> <Animal> <n>`.
  - `apps/server/src/db.ts`: `renamePlayer(db, id, nickname): boolean` (true when a row changed). No schema change, no migration — existing players keep their names.
  - `apps/server/src/players.ts`: `POST /api/players` uses `funnyName()` when no `nickname` key is given; new `PATCH /api/players/:id`. Keep `cleanNickname` the single validation rule for both routes.
  - Update `players.test.ts`: its `missing` / `noBody` cases in `rejects bad nicknames` now expect 201 with a generated name (that change is the point of this slice, not a weakened assertion).
  - NOT in scope: unique names, profanity filtering of typed names, renaming existing players in bulk, rate limits, client code, docs (D1 writes the decisions).
- **Files owned:**
  - `apps/server/src/names.ts` (new)
  - `apps/server/src/names.test.ts` (new)
  - `apps/server/src/db.ts`
  - `apps/server/src/players.ts`
  - `apps/server/src/players.test.ts`
- **Success criteria:**
  - `[test] funnyName with random stubbed to always 0 gives '<ADJECTIVES[0]> <ANIMALS[0]> 1', and stubbed to always 0.999999 gives '<last adjective> <last animal> 99' — apps/server/src/names.test.ts › funnyName builds adjective, animal and number`
  - `[test] every word matches /^[A-Z][a-z]+$/, lists have no duplicates and at least 20 entries each, and for every adjective/animal pair cleanNickname('<adj> <animal> 99') returns the same string — apps/server/src/names.test.ts › every funny name fits the nickname rule`
  - `[test] 200 funnyName() calls with Math.random all match /^[A-Z][a-z]+ [A-Z][a-z]+ ([1-9]|[1-9][0-9])$/ — apps/server/src/names.test.ts › random names have the right shape`
  - `[test] POST /api/players with no body and with {} gives 201 and a nickname of the funny-name shape; GET /api/players/:id returns that name — apps/server/src/players.test.ts › registers a player with a funny name when no nickname is given`
  - `[test] a given nickname '  Ann  ' is still stored as 'Ann', and null, '', '   ', 21 chars, 42 and ['Ann'] still give 400 — apps/server/src/players.test.ts › rejects bad nicknames`
  - `[test] PATCH /api/players/:id { nickname: '  Zed ' } gives 200 { id, nickname: 'Zed' } and GET shows 'Zed'; a bad nickname gives 400 and leaves the name; an unknown id gives 404 — apps/server/src/players.test.ts › renames a player`
  - `[test] PATCH with {} and with no body gives 200 with a new funny-shaped name (random stubbed so it differs from the old one) — apps/server/src/players.test.ts › rerolls a player name`
  - `[test] a game reserved before the rename still has the same playerId (GET /api/games/:id), GET /api/players/:id/stats returns the new nickname, and another player's name is unchanged — apps/server/src/players.test.ts › rename keeps the player's games`
- **Depends on:** —

### C1: Client player calls
- **Scope:** pure, DOM-free player logic that C3 wires. `storage` and `fetchFn` are passed in, as in `api.ts` today.
  - `apps/client/src/api.ts`:
    - `registerPlayer(fetchFn, nickname?: string)` — posts `{}` when `nickname` is undefined, `{ nickname }` otherwise; still null on any failure, never throws.
    - `renamePlayer(fetchFn, id, nickname?: string): Promise<RenameResult>` with `RenameResult = { ok: true; player: Player } | { ok: false; reason: 'invalid' | 'unknown-player' | 'error' }` — `PATCH /api/players/<encoded id>`, JSON body `{}` (reroll) or `{ nickname }`; 400 → `invalid`, 404 → `unknown-player`, other status / bad body / network error → `error`. Never throws.
  - `apps/client/src/player.ts` (new):
    - `ensurePlayer(storage, fetchFn): Promise<Player | null>` — the **First visit** rules above: stored + known → save and return the server's copy (its nickname may have changed in another tab); stored + 404 → clear, then register a funny-named player; stored + `checkPlayer` throws → return the stored player untouched; nothing stored → `registerPlayer(fetchFn)` (no nickname), save, return; register fails → null. Storage writes that throw are swallowed (the player then lasts for this page only).
    - `changeName(storage, fetchFn, player, nickname?: string): Promise<RenameResult>` — calls `renamePlayer`; saves the new player on success only.
    - `nicknameError(text: string): string | null` — `'Use 1 to 20 characters.'` when the trimmed text is empty or longer than 20, else null.
  - NOT in scope: DOM, `main.ts`, server code, `checkPlayer`/`reserveGame` behavior.
- **Files owned:**
  - `apps/client/src/api.ts`
  - `apps/client/src/api.test.ts`
  - `apps/client/src/player.ts` (new)
  - `apps/client/src/player.test.ts` (new)
- **Success criteria:**
  - `[test] registerPlayer(fetchFn) with no nickname POSTs /api/players with body {} and returns the server's player; with 'Ann' it still sends { nickname: 'Ann' } — apps/client/src/api.test.ts › registerPlayer posts the nickname`
  - `[test] renamePlayer PATCHes /api/players/p%2F1 with { nickname: 'Zed' } (or {} with no nickname) and returns { ok: true, player } on 200 — apps/client/src/api.test.ts › renamePlayer sends the new name or asks for a random one`
  - `[test] renamePlayer maps 400 to 'invalid', 404 to 'unknown-player', 500 / a rejected fetch / a 200 with a bad body to 'error', never throwing — apps/client/src/api.test.ts › renamePlayer maps failures`
  - `[test] with nothing stored, ensurePlayer registers without a nickname, saves the player under flappy.player and returns it — apps/client/src/player.test.ts › ensurePlayer creates a funny-named player on first visit`
  - `[test] with a stored player the server knows (nickname changed to 'New' on the server), ensurePlayer returns and saves { id, nickname: 'New' } and never POSTs — apps/client/src/player.test.ts › ensurePlayer keeps a known stored player`
  - `[test] a stored player the server answers 404 for is replaced by a newly registered one — apps/client/src/player.test.ts › ensurePlayer replaces an unknown stored player`
  - `[test] when checkPlayer cannot reach the server, ensurePlayer returns the stored player and leaves storage as it was; with nothing stored and registration failing it returns null — apps/client/src/player.test.ts › ensurePlayer works offline`
  - `[test] a storage whose setItem throws still gets a player back from ensurePlayer — apps/client/src/player.test.ts › ensurePlayer survives blocked storage`
  - `[test] changeName saves the renamed player on success and leaves storage untouched on 'invalid' or 'error' — apps/client/src/player.test.ts › changeName saves only a successful rename`
  - `[test] nicknameError gives 'Use 1 to 20 characters.' for '', '   ' and 21 chars, and null for 'Ann' and 20 chars — apps/client/src/player.test.ts › nicknameError checks the length`
- **Depends on:** —

### C2: Last-game tracker and chart fixes
- **Scope:** pull today's wait-for-result summary logic out of `main.ts` into a tested module (C3 swaps `main.ts` over to it), and fix two chart notes.
  - `apps/client/src/lastGame.ts` (new):
    - `type LastGameState = { kind: 'none' } | { kind: 'unrecorded' } | { kind: 'waiting'; gameId } | { kind: 'shown'; gameId; summary: GameSummary } | { kind: 'no-result'; gameId } | { kind: 'error'; gameId }`.
    - `createLastGame({ fetchSummary: (gameId) => Promise<SummaryResult>, setTimer: (fn, ms) => () => void /* returns cancel */, onChange: (state) => void, fallbackMs = SUMMARY_FALLBACK_MS /* 5000 */ })` → `{ state(): LastGameState; gameOver(gameId: string | null): void; result(gameId: string): void }`.
    - Rules (same as `main.ts` today, minus the hide-on-restart): `gameOver(null)` → `unrecorded`. `gameOver(id)` → `waiting`; if a `result` for `id` was already seen, fetch now; else start the fallback timer, which fetches once if no result has come. `result(id)` for the waiting game fetches once (a second result does nothing) and cancels the timer; a result for any other game is only remembered. Fetch outcome: ok → `shown`; `no-result` → `no-result`; `error` → `error`; `pending` → stay `waiting` (the game's result will trigger a fetch). A fetch outcome or timer for a game that is no longer the latest `gameOver` is ignored, and its timer is cancelled. There is no "hide": the state only changes on `gameOver` / fetch outcomes. `onChange` fires on every state change.
    - `lastGameView(state): string[]` — the card lines listed under **Last game card** above (the shown case is exactly `summaryLines(summary)`).
  - `apps/client/src/chart.ts`: `TrendChartOptions.emptyText?: string` (default `'No complete games yet'`, so today's test stays green); when min = max draw **one** y label, not two.
  - NOT in scope: `main.ts`, DOM, `summary.ts` (import `SummaryResult`/`summaryLines` from it), `stats.ts`, server code.
- **Files owned:**
  - `apps/client/src/lastGame.ts` (new)
  - `apps/client/src/lastGame.test.ts` (new)
  - `apps/client/src/chart.ts`
  - `apps/client/src/chart.test.ts`
- **Success criteria:**
  - `[test] a new tracker is { kind: 'none' }; gameOver(null) gives 'unrecorded' and never fetches — apps/client/src/lastGame.test.ts › starts empty and marks unrecorded games`
  - `[test] gameOver('g1') gives 'waiting' and does not fetch; result('g1') fetches once and an ok answer gives { kind: 'shown', gameId: 'g1', summary }; a second result('g1') does not fetch again — apps/client/src/lastGame.test.ts › fetches the summary when the game's result arrives`
  - `[test] result('g1') before gameOver('g1') makes gameOver fetch right away — apps/client/src/lastGame.test.ts › uses a result that came before game over`
  - `[test] with no result, the fallback timer (fake setTimer) fetches once after fallbackMs; a result after that does not fetch again — apps/client/src/lastGame.test.ts › fetches anyway when no result comes`
  - `[test] 'pending' keeps 'waiting' and the next result fetches; 'no-result' and 'error' give those states — apps/client/src/lastGame.test.ts › maps fetch outcomes`
  - `[test] a fetch for g1 that resolves after gameOver('g2') is ignored, g1's timer is cancelled, and a result('g1') then does not fetch — apps/client/src/lastGame.test.ts › ignores older games`
  - `[test] onChange is called with each new state in order (waiting, shown) — apps/client/src/lastGame.test.ts › reports every change`
  - `[test] lastGameView gives 'No game yet - flap to start', 'This game was not recorded', 'Waiting for the server…', 'The server could not score this game', 'Could not load the summary', and summaryLines(summary) for shown — apps/client/src/lastGame.test.ts › lastGameView lines`
  - `[test] an empty chart with emptyText 'No games with flaps yet' shows that text (and the default is still 'No complete games yet') — apps/client/src/chart.test.ts › empty chart text can be set`
  - `[test] one value, and several equal values, give exactly one y label — apps/client/src/chart.test.ts › equal values get one y label`
- **Depends on:** —

### C3: One-page layout, name bar and stats panel
- **Scope:** all DOM wiring for **Client behavior fixed here**, and removal of the stats page. Most of this is DOM wiring the client's Vitest setup (node, no DOM library, and no new dependencies) can't run, so it is checked in the browser; the page's element contract and the one-page build are pinned by a test.
  - `apps/client/index.html`: remove `#player-form` and the `My stats` link. Structure (ids are the contract `main.ts` queries):
    - `<main id="layout">` → `<div id="play">` with `<p id="player-bar" hidden>Playing as <strong id="player-name"></strong> <button type="button" id="change-name">Change</button></p>`, `<form id="rename-form" hidden>` (`<input id="new-name" maxlength="20" autocomplete="off">`, `<button type="submit">Save</button>`, `<button type="button" id="reroll-name">Random name</button>`, `<button type="button" id="cancel-rename">Cancel</button>`, `<span id="rename-error" role="alert">`), the canvas `#game` (288 × 512, unchanged attributes), `#recording`, `#status`;
    - `<aside id="panel">` → `<section id="last-game" aria-live="polite">` (h2 `Last game`) and `<section id="my-stats" aria-live="polite">` (h2 `My stats`).
    - Minimal CSS only: `#layout` flex row, `gap`, `align-items: flex-start`, centered; `#panel` `width: 360px; max-width: 100%`, text left; `@media (max-width: 720px)` → column, panel full width; charts `max-width: 100%; height: auto`; the table inside a `.table-wrap { overflow-x: auto }`; `[hidden] { display: none }` for the form/bar. Carry over the chart/table rules from `stats.html`. No colors or fonts beyond today's.
  - `apps/client/src/statsPanel.ts` (new, DOM): `renderStats(root, view: StatsView)` / `renderStatsMessage(root, text)` — the headline list, two charts (`Score per flap` with `formatRatio`, `Wasted flaps (%)`, 320 × 180, `emptyText: 'No games with flaps yet'`) and the table, moved from `statsPage.ts` (no nickname heading).
  - `apps/client/src/main.ts`: replace the nickname form and the scripted `smoke` registration with `ensurePlayer` + the 5 s retry; name bar and rename form using `changeName` / `nicknameError`; replace the inline summary panel code with `createLastGame` (feed it `result` from the recorder's `onResult`, `gameOver` on the switch into `over`; do **not** reset it on restart) and render `lastGameView` into `#last-game`; stats load/refresh as described (older responses ignored); dev hook gets `stats`, and `summary` reads from the tracker (`shown` and `gameId === session.gameId`). Keydown ignores `input`/`button` targets; closing the rename form blurs. Keep everything else in `main.ts` (reservation, forwarding, stepper, scripted hold, status texts) as is.
  - Delete `apps/client/stats.html` and `apps/client/src/statsPage.ts`; `apps/client/vite.config.ts` goes back to the default single-page build (drop `rollupOptions.input` and the now-unused `node:url` import); dev proxy unchanged.
  - NOT in scope: `render.ts` and canvas drawing, `session.ts`, `recorder.ts`, `stats.ts`, `summary.ts`, the files owned by C1/C2 (import only), docs (D1), any styling beyond the layout rules above.
- **Files owned:**
  - `apps/client/index.html`
  - `apps/client/src/main.ts`
  - `apps/client/src/statsPanel.ts` (new)
  - `apps/client/src/page.test.ts` (new)
  - `apps/client/stats.html` (delete)
  - `apps/client/src/statsPage.ts` (delete)
  - `apps/client/vite.config.ts`
- **Success criteria:**
  - `[test] index.html (imported with ?raw) has elements with ids layout, play, player-bar, player-name, change-name, rename-form, new-name, reroll-name, cancel-rename, rename-error, game, recording, status, panel, last-game, my-stats, a canvas with width="288" height="512", and no 'stats.html' or 'player-form' — apps/client/src/page.test.ts › index.html has the one-page layout`
  - `[test] import.meta.glob('../*.html') finds only ../index.html (stats.html is gone) — apps/client/src/page.test.ts › there is only one page`
  - `[manual] fresh profile, normal URL http://localhost:3000/: no form; the name bar shows 'Playing as <Adjective Animal n>'; the status line says 'Recording as <that name>'; a game played by hand is stored under JSON.parse(localStorage['flappy.player']).id (GET /api/games/<__flappy.gameId> playerId) — browser + console`
  - `[manual] Change → type 'Zed' → Save: name bar and 'Recording as Zed' update, the form closes, GET /api/players/<id> says 'Zed', My stats still lists the earlier games; Random name gives a new funny name each click with the form still open; '' or spaces show 'Use 1 to 20 characters.'; with the API stopped Save shows 'Could not change the name. Try again.' and the old name stays; after Cancel, Space flaps again — browser`
  - `[manual] a profile with a stored typed nickname keeps it after reload; with the API stopped on a fresh profile the line says 'Offline - this game is not recorded' and, once the API is back, a name appears within ~5 s — browser`
  - `[manual] seed-42 scripted run /?seed=42&flaps=13,52,90,128,166,199,237 on a fresh profile: window.__flappy values, lastResult and the 'Server score 2 (matches)' line exactly as in the current smoke recipe; the Last game card shows 'Waiting for the server…' then exactly Score: 2 / Flaps: 7 / Score per flap: 0.29 / Wasted flaps: 0 of 7 (0 while rising, 0 too high) / Time between flaps: 0.62 s on average (0.55 to 0.65 s) / Died: Hit the ground; __flappy.summary deep-equals the summary route; My stats shows Games: 1 and __flappy.stats.totals.games is 1 — all with no reload; the console has no errors — browser + console`
  - `[manual] flap to restart the scripted run: the Last game card keeps the previous summary while playing; after the second game over, My stats shows Games: 2, two chart points and two table rows (newest first) without a reload, matching GET /api/players/<id>/stats — browser`
  - `[manual] before the first game ends the card says 'No game yet - flap to start'; a game over with the API down shows 'This game was not recorded' — browser`
  - `[manual] at 1280 px wide the panel sits right of the canvas; at 375 px (device emulation) it stacks below the game and document.documentElement.scrollWidth <= document.documentElement.clientWidth; the canvas is still 288 × 512 — browser; layout can't be checked by the node test runner`
  - `[manual] /stats.html no longer serves the stats page, and pnpm check passes with apps/client/dist holding index.html and no stats.html — browser + terminal`
- **Depends on:** S1, C1, C2

### D1: Docs for the new flow
- **Scope:** documentation only, written from this sprint doc's texts, so its criteria are `[manual]` (read the files; follow the recipe on the integrated wave-2 head). No code.
  - `docs/codebase-structure.md`: status line (plan `arcade-refresh` in progress — funny names + one-page panel); server part (funny names in `names.ts`, `PATCH /api/players/:id`); client part (auto-player, name bar with change/reroll, right-hand panel with the Last game card and My stats, stats refresh after the tracker's `shown`; no second page, Vite builds one page); **Stack & conventions** `Node >= 22.13` (per root `engines`); **Key docs** point at `docs/plans/arcade-refresh.md`. **Smoke recipe:** Login line (no form; a fresh profile gets a funny name; stored players keep theirs; scripted runs no longer register `smoke`); Key URLs (drop `stats.html`); Browser check (unchanged values, plus the name bar); **Summary check** → the Last game card (heading `Last game`, same lines, stays visible during the next game instead of hiding, `No game yet - flap to start` before the first game over); **Stats check** → the `My stats` panel section refreshing without reload after each recorded game (same example totals; the `No player yet` state is gone; `__flappy.stats`); new **Rename check** (typed, reroll, invalid, offline); new **Phone check** (375 px, stacked, `scrollWidth <= clientWidth`); dev hook fields add `stats`; status line texts (`Getting your player name…`, no `Enter a nickname…`); **Stopping:** `pnpm dev` does **not** stop the other app when one dies (`pnpm -r --parallel`) — stop both and check for leftover node processes (known issues); **Verification:** the build writes only `apps/client/dist/index.html`.
  - `docs/decisions.md`: new entries — (1) **Funny names are made on the server** (format, word lists in `apps/server/src/names.ts`, 1–20 rule, not unique, existing names kept); (2) **Players can rename** (`PATCH /api/players/:id`, typed or reroll, same rule; like every route it trusts the player id, no auth — refines "Nickname-only players"); (3) **Override: stats live in a right-hand panel beside the game**, superseding "My stats is its own page" (one stats UI; Last game card on top; refresh after the server finishes the game; stacks below on narrow screens) — also mark the old entry as superseded with a one-line pointer. Fix the "Client-chosen seeds only outside production" entry's "left out of stats" to agree with "Which games count" (dev games count).
  - NOT in scope: code, `docs/plans/`, `docs/handoff-queue.md` Resolution lines (orchestrator's), styling notes for the next sprint.
- **Files owned:**
  - `docs/codebase-structure.md`
  - `docs/decisions.md`
- **Success criteria:**
  - `[manual] decisions.md has the three new entries, the old "My stats is its own page" entry points to the override, and the client-chosen-seeds entry no longer says dev games are left out of stats — read the file`
  - `[manual] the brief says Node >= 22.13, has no stats.html anywhere, and its Stopping line no longer claims pnpm dev stops both apps — read the file`
  - `[manual] every step of the updated smoke recipe (Browser, Last game, Stats, Rename, Phone, Disconnect checks) works as written on the integrated wave-2 head — follow docs/codebase-structure.md`
- **Depends on:** S1, C1, C2

## Sprint summary

- **Synced with merge-target:** up to date (first sprint of the plan; plan branch cut from `main` at 7bab1c3)
- **Slices shipped:** S1, C1, C2 (wave 1, PR #11), C3, D1 (wave 2, PR #12) — each engineer worked test-first (D1 docs-only) and browser-verified its own runtime; the orchestrator followed the new Last game, Stats, Rename and Phone smoke checks on the combined wave-2 head (ports 3090/3091, so the human's dev server on 3000/3001 kept running)
- **Queue entries:** resolved 9 (stats chart label overlap, stats-page link and localStorage guard, decisions dev-seed contradiction, the previous plan's gate-7 note, and this sprint's C1/C2/D1 hand-offs), deferred 5 — the `PENDING` entries with `sprint: names-and-layout` still marked pending (S1 missing-module red and empty-body PATCH 400; C1 typecheck-only red; C3 stats-load error text, extra ids, `/stats.html` dev fallback) plus the reviewer's docs entry, where the "Stopping" line is still disputed
- **Approximate token cost:** ~590k subagent tokens (planner ~93k, S1 ~87k, C1 ~87k, C2 ~90k, C3 ~134k, D1 ~97k) plus orchestration
