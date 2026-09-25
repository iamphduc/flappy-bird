# Sprint: arcade-look

_From plan: docs/plans/arcade-refresh.md · Slug: arcade-look · Status: archived · Generated: 2026-09-25_

## Status board

| Wave | Slice | Title | Branch | PR | Status | Depends on |
|------|-------|-------|--------|----|--------|------------|
| 1 | A1 | Design tokens: arcade direction, self-hosted pixel font, palette (`theme.ts` + `theme.css`), styles moved out of `index.html` | arcade-look-a1 | merged | done | — |
| 2 | P1 | Page shell: cabinet frame around the game, marquee, name bar / rename form / buttons, phone layout | arcade-look-p1 | merged | done | A1 |
| 2 | P2 | Scoreboard panel: Last game card, My stats headline, charts and table in the arcade style | arcade-look-p2 | merged | done | A1 |
| 2 | R1 | Canvas redraw in code: sky, pipes, ground, bird, score and overlays, tied to engine constants | arcade-look-r1 | merged | done | A1 |
| 2 | D1 | Docs: brief (client look, smoke-recipe notes), decisions entry for the design direction, "Stopping" line | arcade-look-d1 | merged | done | A1 |

Wave membership lives in the **Wave** column — **computed by the planner, not authored** (see Field semantics). Slices in a wave run in parallel and own disjoint files. Authored levels: **plan → sprint → slice**. Engineers push branches; the orchestrator integrates each wave into **one PR** on the plan branch (see **Branch naming**).

Why two waves: every design slice has to use the same font, palette and direction, so A1 sets them alone first (and is the only slice that touches `package.json` / `pnpm-lock.yaml`). A1 also moves today's inline `<style>` into one CSS file per wave-2 owner (`page.css` → P1, `panel.css` → P2), so the four wave-2 slices own disjoint files and run side by side.

**This sprint is look only.** No change to `packages/engine` (code or constants), the canvas logical size (`width="288" height="512"`), `session.ts`, `recorder.ts`, `loop.ts`, `input.ts`, the recording protocol, the server, or any metric. The seed-42 scripted run must stay exactly as in the smoke recipe (phase `over`, step 296, score 2, death `ground`, the 6 Last game lines). No image files and no external font service or CDN: every font file is served from our own origin.

### Shared rules for every design slice (A1, P1, P2, R1)

- **Invoke the `frontend-design` skill (Skill tool) before any styling**, and follow the direction A1 writes at the top of `apps/client/src/styles/theme.css`.
- **Screenshots:** take before/after screenshots of `http://localhost:<WEB_PORT>/` at **1280 px** and **375 px** wide (DevTools MCP, device emulation for 375), after a finished seed-42 scripted run so the panel is filled. "Before" is the wave's base (the plan branch). List them in the hand-back; don't commit them.
- **Use the tokens.** Colors come from `PALETTE` (TS) or the matching `--color-*` custom properties (CSS); fonts from `PIXEL_FONT` / `BODY_FONT` or `--font-pixel` / `--font-body`. Wave-2 slices do not edit `theme.ts` / `theme.css` (A1's); a missing shade is made with `color-mix()` from tokens in the slice's own file, or (canvas only) in R1's `SCENE`, and noted in the hand-back.
- **Keep the contract:** every id in `apps/client/src/page.test.ts` (plus `last-game-body`, `my-stats-body`, which `main.ts` queries) and every visible text the smoke recipe checks stay the same (`Playing as …`, `Change`, `Save`, `Random name`, `Cancel`, `Use 1 to 20 characters.`, the `#recording` / `#status` lines, `Last game`, `My stats`, the card lines, the headline lines, chart titles, table headings). Name bar, rename form, canvas, `#recording` and `#status` stay inside `#play` in that order (status lines under the canvas).
- **Accessible:** text contrast at least 4.5:1, focus ring and chart lines at least 3:1 (A1's test pins the palette pairs); a visible `:focus-visible` ring on every control; any CSS animation or transition is off under `prefers-reduced-motion: reduce`. The canvas has no time-based decoration (everything it draws moves only with game state), so it needs no reduced-motion switch.
- **Phone:** at 375 px nothing scrolls sideways (`document.documentElement.scrollWidth <= document.documentElement.clientWidth`); the canvas shows at 288 × 512 CSS px, so the cabinet frame and page padding together get at most (375 − 288) / 2 ≈ 43 px per side.

### Token contract (A1 builds it; P1, P2, R1 use it)

- `apps/client/src/theme.ts` (plain TS, no DOM, no CSS import — it runs under Vitest in node):
  - `PIXEL_FONT: string` — CSS font-family stack for the pixel display font, ending in a generic fallback (e.g. `"Press Start 2P", monospace`). `BODY_FONT: string` — the family for longer text (tables, card lines); may be the same pixel font, or a more readable second pixel font; ends in a generic fallback.
  - `PALETTE` — hex colors (`#rrggbb`, or `rgba(...)` only for see-through shades), at least these keys: `bg`, `surface`, `surfaceAlt`, `text`, `textMuted`, `accent`, `accentText` (text on `accent` buttons), `highlight` (marquee / score), `danger` (errors), `focus`, `border`, `chartLine`. Extra keys are fine.
  - `contrastRatio(a: string, b: string): number` — WCAG 2.x contrast of two `#rrggbb` colors.
  - `CONTRAST_PAIRS` — the `[foreground, background, minimum]` key pairs the UI uses: at least `text/bg`, `text/surface`, `textMuted/surface`, `accentText/accent`, `danger/surface`, `highlight/surface` at 4.5, and `focus/bg`, `focus/surface`, `chartLine/surface` at 3.
- `apps/client/src/styles/theme.css`: a header comment with the direction (name, mood, font(s) and license, palette roles, frame/border rules); the font import (self-hosted, see A1); `:root` custom properties `--color-<kebab-key>` for every `PALETTE` key with the same value, `--font-pixel`, `--font-body`, plus any spacing/border tokens A1 wants; base rules (`body` font/colors, `[hidden] { display: none !important; }`, `:focus-visible` ring, `prefers-reduced-motion` reset). Page-level classes live in `page.css` / `panel.css`, not here.
- `main.ts` imports, in order: `./styles/theme.css`, `./styles/page.css`, `./styles/panel.css`. `index.html` has no inline `<style>`.
- **Who styles what:** `page.css` (P1) — `body` layout, `#layout` (row / stacked at ≤ 720 px), `#play`, cabinet frame, marquee, `#player-bar`, `#rename-form`, `#rename-error`, buttons/inputs, `#game` box, `#recording`, `#status`. `panel.css` (P2) — `#panel` (including its width and its own ≤ 720 px rule) and everything inside it (`#last-game`, `#my-stats`, `.headline`, `.charts`, `.chart`, `.table-wrap`, `table`).

### Handoff-queue entries folded in

- `[2026-09-24 · PENDING · engineer → human · sprint: stats · slice: C1]` chart colors (fixed `#2a7fb8` line) — already marked "colors left for the arcade-look sprint" → P2 moves the line and dots onto `PALETTE.chartLine`.
- `[2026-09-24 · PENDING · reviewer → human]` brief "Stopping" line still disputed, and the `pnpm dev` shutdown part of `[2026-09-25 · PENDING · engineer → human · sprint: names-and-layout · slice: C3]` → D1 (the brief is edited anyway): D1 tries it on Windows (stop only the API's process, see whether Vite also exits) and writes a line that is true either way: one app dying may or may not end the other, so stop the whole command and check that no node processes are left on the ports.
- Same C3 entry: the extra `#last-game-body` / `#my-stats-body` ids stay (`main.ts` queries them); P2 keeps them. Its other notes (stats error text, `/stats.html` dev fallback) are not touched by this work.
- **Not folded** (not touched): rate limits, dev-seed opt-in, `playerId` in `GET /api/games/:id`, recorder resend gaps, duplicated replay logic, the engine defaults / P1 / S1 / S2 / C2 / names-and-layout S1 and C1 notes.
- The orchestrator writes Resolution lines at archive time; slices only append new entries.

### Plan Verification coverage (this sprint's share)

| Verification item | Covered by |
|---|---|
| The app, including the canvas drawing, has the retro arcade style | A1 tests (tokens, font, contrast); P1, P2 manual screenshots; R1 tests + screenshots |
| Scripted run `/?seed=42&flaps=13,52,90,128,166,199,237` still ends with score 2, step 296 `ground`, same summary | A1, P1, P2, R1 manual (smoke recipe); every wave check |
| Phone width: panel below the game, no sideways scroll | P1, P2 manual (375 px) |
| `pnpm check` and CI pass; smoke recipe and `decisions.md` updated | every slice; D1 |
| Names, rename, one page (earlier sprint) still work | P1 manual (rename check), P2 manual (stats refresh) |

### Dependency hotspots

Only **A1** touches `apps/client/package.json` and `pnpm-lock.yaml` (one font package, a runtime `dependency`, OFL-licensed, woff2 files bundled by Vite). No other slice adds a dependency or a file under `public/`.

## Per-slice detail

### A1: Design tokens, self-hosted pixel font, styles moved out of index.html
- **Scope:** set the shared arcade direction and the **Token contract** above, so wave 2 can style in parallel.
  - **Invoke the `frontend-design` skill first.** Pick the direction (retro arcade: bold, high-contrast palette on a dark cabinet-style background, hard pixel edges, no rounded corners or soft shadows unless the direction calls for them) and write it as the header comment of `theme.css` — wave-2 engineers design from it.
  - **Font:** add one `@fontsource/<pixel-font>` package (e.g. `@fontsource/press-start-2p`; a second pixel font for body text is allowed only in the same package install, still in this slice) to `apps/client/package.json` `dependencies` with `pnpm --filter @flappy/client add …`, and import its CSS at the top of `theme.css`. Vite bundles the woff2 into `dist/assets`, so it is served from our own origin. OFL license only. No `<link>` to Google Fonts or any CDN, no `http(s)://` URLs in the page or styles.
  - `theme.ts` + `theme.test.ts` (new): the TS side of the contract.
  - `styles/theme.css` (new), `styles/page.css` (new), `styles/panel.css` (new): move today's inline rules from `index.html` as they are — base rules into `theme.css`, page rules into `page.css`, `#panel` and its contents into `panel.css` (per **Who styles what**) — then apply only the base theme (body font/colors, focus ring, reduced motion). Leave the page and panel restyle to P1/P2.
  - `index.html`: remove the `<style>` block; nothing else changes. `main.ts`: add the three CSS imports; nothing else changes.
  - NOT in scope: cabinet frame, panel styling, `render.ts`, `chart.ts`, `statsPanel.ts`, docs, any id or text change.
- **Files owned:**
  - `apps/client/package.json`
  - `pnpm-lock.yaml`
  - `apps/client/src/theme.ts` (new)
  - `apps/client/src/theme.test.ts` (new)
  - `apps/client/src/styles/theme.css` (new)
  - `apps/client/src/styles/page.css` (new)
  - `apps/client/src/styles/panel.css` (new)
  - `apps/client/index.html`
  - `apps/client/src/main.ts`
- **Success criteria:**
  - `[test] PALETTE has every required key, each a #rrggbb color (rgba only allowed for see-through shades), and PIXEL_FONT / BODY_FONT end in a generic family (monospace, sans-serif or serif) — apps/client/src/theme.test.ts › theme exports the token contract`
  - `[test] contrastRatio('#000000', '#ffffff') is 21 (±0.01) and of a color with itself is 1; every CONTRAST_PAIRS entry meets its minimum, and the pairs include text/bg, text/surface, textMuted/surface, accentText/accent, danger/surface, highlight/surface at 4.5 and focus/bg, focus/surface, chartLine/surface at 3 — apps/client/src/theme.test.ts › palette pairs meet the contrast minimums`
  - `[test] theme.css (read with ?raw) declares --color-<kebab-key> with the same value for every PALETTE key, plus --font-pixel and --font-body — apps/client/src/theme.test.ts › theme.css mirrors theme.ts`
  - `[test] theme.css imports an @fontsource package, and index.html plus every src/styles/*.css (import.meta.glob ?raw) contain no http:// or https:// URL and no fonts.googleapis / fonts.gstatic — apps/client/src/theme.test.ts › fonts are self-hosted`
  - `[test] index.html has no <style> block — apps/client/src/theme.test.ts › styles live in src/styles`
  - `[test] theme.css has a :focus-visible rule and a @media (prefers-reduced-motion: reduce) block — apps/client/src/theme.test.ts › base rules cover focus and reduced motion`
  - `[manual] pnpm check passes; apps/client/dist/assets holds the font's .woff2; on http://localhost:<WEB_PORT>/ the Network panel shows the font loaded from the same origin and no request to another host; page text uses the pixel font — terminal + browser`
  - `[manual] seed-42 scripted run on a fresh profile gives exactly the smoke recipe's Browser check and Last game check values (phase over, step 296, score 2, death ground, the 6 Last game lines, Server score 2 (matches)); layout is as before (panel right at 1280 px, stacked at 375 px with no sideways scroll); console has no errors; before/after screenshots at 1280 px and 375 px — browser + console`
- **Depends on:** —

### P1: Page shell, cabinet frame and controls
- **Scope:** **Invoke the `frontend-design` skill first**, then style the page around the game per A1's direction, in `page.css`:
  - an arcade-cabinet frame around the canvas (thick pixel borders / bezel from tokens; a marquee on top with a visible `<h1>` title such as `Flappy Bird`); the canvas stays `width="288" height="512"` and shows at 288 × 512 CSS px (add `image-rendering: pixelated` if useful); it may get `aria-label` (e.g. `Flappy Bird game`);
  - the name bar (`Playing as <name>` + `Change`), the rename form (label, text box, `Save`, `Random name`, `Cancel`, error line in `danger`) and all buttons/inputs styled as arcade controls, with hover, active, disabled and `:focus-visible` states from tokens;
  - `#recording` and `#status` as readable status lines under the canvas (a "cabinet display" look is fine; texts unchanged);
  - `body` / `#layout` / `#play`: game left, panel right on wide screens; at ≤ 720 px the layout stacks (the panel's own sizing is P2's); no sideways scroll at 375 px with the frame on.
  - `index.html` may add wrapper elements and classes (marquee, bezel) and the `<h1>`, but keeps every id, the ids' order inside `#play`, the label for `#new-name`, and the button types.
  - Any page animation (e.g. marquee glow) is CSS-only and off under reduced motion.
  - NOT in scope: `theme.css` / `theme.ts`, anything inside `#panel` (P2), `render.ts` (R1), `main.ts`, docs.
- **Files owned:**
  - `apps/client/index.html`
  - `apps/client/src/styles/page.css`
  - `apps/client/src/page.test.ts`
- **Success criteria:**
  - `[test] index.html still has every id in IDS plus last-game-body and my-stats-body, a canvas with width="288" height="512", no stats.html / player-form, and inside #play the order player-bar, rename-form, game, recording, status — apps/client/src/page.test.ts › index.html has the one-page layout`
  - `[test] index.html has the viewport meta, one <h1>, a <label for="new-name">, and every <button> has type="button" or type="submit" — apps/client/src/page.test.ts › controls stay accessible`
  - `[test] import.meta.glob('../*.html') still finds only ../index.html — apps/client/src/page.test.ts › there is only one page`
  - `[manual] at 1280 px the game sits in a cabinet frame with a marquee, panel to its right; name bar, rename form and buttons match the arcade style; Tab shows a clear focus ring on Change, the text box, Save, Random name and Cancel; before/after screenshots at 1280 px and 375 px — browser`
  - `[manual] at 375 px (device emulation) the panel is below the game, document.documentElement.scrollWidth <= document.documentElement.clientWidth with the rename form open, and the canvas shows at 288 × 512 — browser + console`
  - `[manual] the smoke recipe's Rename check works as written (Zed → Save; Random name keeps the form open; empty name shows Use 1 to 20 characters.; after Cancel, Space flaps); with prefers-reduced-motion: reduce emulated nothing animates — browser`
  - `[manual] seed-42 scripted run on a fresh profile: window.__flappy, lastResult, 'Server score 2 (matches)' and the Last game lines exactly as in the smoke recipe; console has no errors — browser + console`
- **Depends on:** A1

### P2: Scoreboard panel, charts and table
- **Scope:** **Invoke the `frontend-design` skill first**, then style `#panel` as an arcade scoreboard per A1's direction, in `panel.css`:
  - the `Last game` card as a high-score style readout (the card lines stay the exact `<p>` texts `main.ts` renders — style them with CSS only; `main.ts` is not in scope), then `My stats`: headline list, the two charts and the games table, all in the token colors and fonts;
  - `statsPanel.ts` may add class names or wrap parts of a line in spans (e.g. label / value), but every line's `textContent` stays exactly as today (headline lines, chart titles, table headings and cells, `Loading…`, `Could not load your stats`, `No complete games yet - play a game first`);
  - `chart.ts`: line and dots in `PALETTE.chartLine` (no `#2a7fb8`); text and axes stay `currentColor` (so CSS sets them); titles/labels may use the pixel font and the paddings may grow so the wider font never clips (keep the options API and every existing test green);
  - the table scrolls inside `.table-wrap`; at ≤ 720 px the panel takes the full width under the game, and at 375 px nothing scrolls sideways; keep `#last-game-body` / `#my-stats-body` and the `aria-live` sections.
  - NOT in scope: `theme.*`, `page.css`, `index.html`, `main.ts`, `stats.ts`, `summary.ts`, `lastGame.ts`, `render.ts`, docs.
- **Files owned:**
  - `apps/client/src/styles/panel.css`
  - `apps/client/src/chart.ts`
  - `apps/client/src/chart.test.ts`
  - `apps/client/src/statsPanel.ts`
- **Success criteria:**
  - `[test] trendChartSvg([1, 3, 2], …) draws the polyline stroke and every circle fill in PALETTE.chartLine and the output never contains #2a7fb8 — apps/client/src/chart.test.ts › line and dots use the palette`
  - `[test] with the chart size the panel uses (320 × 180) and 10 values between 0 and 1 formatted with formatRatio, every y label's x and every point lie inside the viewBox and points keep right of the label column — apps/client/src/chart.test.ts › labels and points fit the panel chart`
  - `[test] every existing chart test (points in order, empty text, one y label for equal values, escaping, label format) still passes unchanged — apps/client/src/chart.test.ts (whole file)`
  - `[manual] after two seed-42 runs + the waste run (/?seed=42&flaps=13,16,40) the panel reads as an arcade scoreboard; the headline shows exactly Games: 3 / Average score: 1.33 / Score per flap: 0.24 / Wasted flaps: 12% / Deaths: 3 ground, 0 top pipe, 0 bottom pipe; both charts have 3 points and no clipped labels; the table has 3 rows, newest first; before/after screenshots at 1280 px and 375 px — browser`
  - `[manual] the Last game card shows exactly the smoke recipe's 6 lines after the seed-42 run, stays during the next game, and My stats refreshes with no reload (__flappy.stats.totals.games goes up by one) — browser + console`
  - `[manual] at 375 px the panel is below the game, the table scrolls inside its own box and document.documentElement.scrollWidth <= document.documentElement.clientWidth — browser + console`
- **Depends on:** A1

### R1: Canvas redraw in code
- **Scope:** **Invoke the `frontend-design` skill first**, then redraw the canvas in `render.ts` to match A1's direction: pixel-art style drawn with canvas calls only (e.g. rects on a 2 or 4 px grid), no images, no `drawImage`, no `Image` / `ImageBitmap`.
  - Sky (may add banded sky, pixel clouds or a skyline, scrolled by `game.step` only — never by wall-clock time), pipes (body, shading, cap), ground (the scrolling stripe stays tied to `game.step` and the 2 px/step speed), bird (pixel body, wing, eye, beak; the rotation from `vy` may stay), score (pixel font with outline, drawn in every phase but `ready` as today), overlays for `ready` / `paused` / `over` as arcade panels.
  - **Tied to the engine:** every size and position comes from `@flappy/engine` constants and `GameState` (`BIRD_X`, `BIRD_SIZE`, `PIPE_WIDTH`, `PIPE_GAP`, `GROUND_Y`, `GROUND_HEIGHT`, `WORLD_WIDTH`, `WORLD_HEIGHT`, `pipe.x`, `pipe.gapY`, `bird.y`, `bird.vy`, `step`). Pipes (caps included) stay inside the pipe's hitbox columns and end exactly at the gap edges; the bird's body stays inside its `BIRD_SIZE` square (the beak may poke out at most 4 px, as today).
  - Overlay lines keep their words (case may change): `Flappy Bird`, `Press Space / click / tap`, `P or Esc to pause`; `Paused`, `P or Esc to resume`; `Game over`, `Score: <n>`, the cause text from `causeText`, `Flap to restart`.
  - Colors: `PALETTE` from `theme.ts`, plus an exported `SCENE` object in `render.ts` for canvas-only colors (sky, pipe shades, ground, bird parts, outline, shade). Text: `PIXEL_FONT`. The exported `render(ctx, game, phase)` signature stays the same (`main.ts` is not in scope).
  - Tests use a small fake 2D context (records `fillRect`, `strokeRect`, `fillText`, `strokeText`, `translate`, `rotate`, `save`, `restore`, path calls and every `fillStyle` / `strokeStyle` / `font` set), since the client's Vitest runs in node with no canvas.
  - NOT in scope: the engine, `session.ts`, `main.ts`, `format.ts` (import only), CSS, docs.
- **Files owned:**
  - `apps/client/src/render.ts`
  - `apps/client/src/render.test.ts` (new)
- **Success criteria:**
  - `[test] for a state with one pipe at x = 100, gapY = 200, every pipe rect lies within x..x+PIPE_WIDTH, the top pipe's shapes end exactly at gapY - PIPE_GAP/2, the bottom pipe's start exactly at gapY + PIPE_GAP/2 and reach GROUND_Y, and nothing pipe-colored is drawn inside the gap — apps/client/src/render.test.ts › pipes are drawn on their hitbox`
  - `[test] the bird is drawn after translate(BIRD_X + BIRD_SIZE/2, bird.y + BIRD_SIZE/2), and its body rects (local coordinates) stay within ±BIRD_SIZE/2, with only the beak up to 4 px past the right edge — apps/client/src/render.test.ts › bird is drawn on its hitbox`
  - `[test] the ground fills GROUND_Y..WORLD_HEIGHT across WORLD_WIDTH, and its stripe rects at step 5 are the step-0 stripe rects shifted left by 10 px (2 px per step, wrapped by the stripe period) — apps/client/src/render.test.ts › ground sits at GROUND_Y and scrolls with the step`
  - `[test] ready draws 'Flappy Bird', 'Press Space / click / tap', 'P or Esc to pause' and no score; paused draws 'Paused' and 'P or Esc to resume'; over (death ground, score 2) draws 'Game over', 'Score: 2', 'Hit the ground', 'Flap to restart' (compared case-insensitively); playing draws the score '2' — apps/client/src/render.test.ts › overlays and score per phase`
  - `[test] every fillStyle / strokeStyle set is a value of PALETTE or SCENE, every font set contains PIXEL_FONT, and drawImage is never called — apps/client/src/render.test.ts › draws only with theme colors and the pixel font`
  - `[test] drawing the same state twice gives the same call list (no wall-clock or random input) — apps/client/src/render.test.ts › drawing depends only on game state`
  - `[test] the overlay text color has at least 4.5:1 contrast (contrastRatio) with the overlay panel color, and the score fill with its outline — apps/client/src/render.test.ts › overlay text is readable`
  - `[manual] the seed-42 scripted run looks right: bird, pipes and ground move as before, the bird visibly touches the ground at the end (step 296, ground), score reads 2, ready / paused / over overlays match the arcade style; __flappy values exactly as in the smoke recipe; before/after screenshots at 1280 px and 375 px (plus one of the over screen) — browser + console`
- **Depends on:** A1

### D1: Docs for the arcade look
- **Scope:** documentation only, so its criteria are `[manual]` (read the files; the orchestrator follows the recipe on the integrated wave-2 head). No code.
  - `docs/codebase-structure.md`: status line (plan `arcade-refresh`: names/panel and the arcade look done once this wave merges); client part: the retro arcade look — tokens in `theme.ts` / `src/styles/theme.css` (palette mirrored as `--color-*` custom properties, `PIXEL_FONT` / `BODY_FONT`), the self-hosted `@fontsource` font (named as A1 chose it), page styles in `src/styles/page.css` (cabinet, controls, layout) and `panel.css` (scoreboard), canvas drawn in code by `render.ts` from engine constants with no image files; **Stack & conventions:** no external fonts or CDNs, no image assets, colors only from the tokens. **Smoke recipe:** Browser check notes that the page loads no request to another host (fonts come from our origin); Phone check adds that the cabinet frame fits at 375 px with no sideways scroll; a short **Look check** (cabinet frame, pixel font, scoreboard panel, `:focus-visible` ring on controls when tabbing, no CSS animation under reduced motion); keep every value and text of the existing checks. **Stopping:** fold in the disputed line as described under **Handoff-queue entries folded in** (try it; write a line that holds whichever app dies).
  - `docs/decisions.md`: new entry **Retro arcade look, drawn in code** — the direction from A1's `theme.css` header (font and its OFL license, self-hosted via `@fontsource`, palette roles, cabinet + scoreboard), tokens as the one source (`theme.ts` ↔ `theme.css`, kept in sync by a test), contrast minimums (4.5 text, 3 focus/charts), canvas drawn from engine constants with no images, no wall-clock animation on the canvas; consequences (a font package in the client, restyles start from the tokens, engine and replays untouched).
  - NOT in scope: code, `docs/plans/`, `docs/handoff-queue.md` Resolution lines.
- **Files owned:**
  - `docs/codebase-structure.md`
  - `docs/decisions.md`
- **Success criteria:**
  - `[manual] decisions.md has the "Retro arcade look, drawn in code" entry naming the font A1 added and the token files — read the file`
  - `[manual] the brief's client part and Stack & conventions describe the tokens, self-hosted font and code-drawn canvas; the Stopping line no longer claims either behavior for sure; no smoke value or text changed — read the file (git diff)`
  - `[manual] every step of the smoke recipe (Browser, Last game, Stats, Rename, Phone, new Look check) works as written on the integrated wave-2 head — follow docs/codebase-structure.md`
- **Depends on:** A1

## Sprint summary

- **Synced with merge-target:** up to date (0 new commits on `main` at sprint start)
- **Slices shipped:** A1 (wave 1, PR #13), P1, P2, R1, D1 (wave 2, PR #14) — each design slice invoked the `frontend-design` skill, worked test-first and took before/after screenshots at 1280 px and 375 px; the orchestrator checked the combined wave-2 head at 1280 px (DPR 1) and 375 px (DPR 2) on ports 3090/3091
- **Queue entries:** resolved 1 (the disputed "Stopping" line, settled by D1's test of each case), deferred 8 — the `PENDING` entries with `sprint: arcade-look` (two stray test/config paths, A1 font quirks, P1/P2/R1 test-order and layout notes, D1 look check written ahead of the code) plus the orchestrator's legibility note (Pixelify Sans "C"≈"O", "5"≈"S", small "2"≈"8"), flagged for the final review
- **Approximate token cost:** ~730k subagent tokens (planner ~91k, A1 ~134k, P1 ~150k, P2 ~124k, R1 ~141k, D1 ~87k) plus orchestration
