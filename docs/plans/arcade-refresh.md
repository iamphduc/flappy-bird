# Plan: Funny names, one-page stats and a retro arcade look

_Generated: 2026-09-25 · Status: active · Grilled-with: grill-me_

<!-- autopilot-run: started=2026-09-25T07:57:11Z sprints=1 waves=2 -->

## Goal
Make the game quicker to start and nicer to look at. Players get a random funny name right away (no typing, but they can change it). Their stats sit in a panel on the right of the game instead of on a separate page. The whole app, including the game drawing, gets a retro arcade look.

## Why
Today a new player has to type a nickname before anything is recorded. The stats live on a second page, and the UI is plain. Success means:
- a first-time visitor can play a recorded game with zero typing;
- the game and all their numbers (last game plus trend) are visible on one screen;
- the app has a consistent retro arcade style;
- game rules, recording and stats numbers are unchanged.

Constraints:
- The engine, its constants and the canvas size (288 × 512) must not change. Scores, replays and the seed-42 smoke values must stay exactly the same.
- Runs locally as before (`pnpm dev`). No hosting work.

**Assumptions:** plan `flappy-efficiency-mvp` is fully merged to `main` (PR #9) and is the base for this plan. Its open `PENDING` notes in `docs/handoff-queue.md` (rate limits, dev seeds, recorder resend gaps, doc fixes) are not part of this plan, except where this work touches the same code.

## Scope
**In scope:**
- **Server:** creating a player without a nickname gives them a random funny name (adjective + animal + number, family-friendly, fits the existing 1–20 character rule). A rename route updates the name with the same rules, and the player's games and stats stay attached.
- **Client:** a first visit creates the player right away with no form. The name is shown with a "change" control (type a new one or reroll). Players who already have a stored nickname keep it.
- **One page:** game on the left, stats panel on the right. The panel has a "Last game" summary card on top, then totals, the two trend charts and recent games. It refreshes after each recorded game. On narrow or phone screens the panel stacks below the game. The separate "My stats" page is removed.
- **Retro arcade look**, designed with the `frontend-design` skill: pixel-style font (self-hosted, no external font service), bold colors, a cabinet-like frame around the game, a scoreboard-style panel, styled controls. The canvas drawing (bird, pipes, sky, ground, score, overlays) is redrawn in code to match.
- Smoke recipe and `docs/decisions.md` updated for the new flow.

**Out of scope:**
- Any change to game rules, physics, pipe layout, recording, the metrics or the wasted-flap rule
- Image sprite files or other art assets
- Renaming existing players, unique names, and profanity filtering of typed names beyond today's rules
- Leaderboards or any view of other players
- Hosting / production hardening (the reviewer's rate-limit and dev-seed notes need their own plan)

## Sprint sequence

| Sprint | Goal | Status | Depends on |
|--------|------|--------|------------|
| names-and-layout | Server funny names + rename, auto-player on the client, one-page layout with the right-hand stats panel (last game + trend), separate stats page removed | done | — |
| arcade-look | Retro arcade restyle via the frontend-design skill: page, panel, controls and canvas drawing, plus phone layout polish | planned | names-and-layout |

Status values: `planned` / `active` / `done`. The orchestrator only flips its row's Status — it does not rewrite Goal/Depends-on retroactively.

The `Depends on` column is the **only** cross-sprint dependency signal. Wave ordering and per-slice deps live inside the sprint doc and are opaque from here.

**Integration:** the orchestrator cuts one **plan integration branch** (named for this plan's slug) off `main`. All wave PRs land on it; one final PR merges it to `main` when the last sprint completes. The slug doubles as a branch name — keep it flat kebab-case.

## Key decisions
- **Override: "My stats is its own page" → stats live in a panel beside the game.** The user wants everything on one screen. The separate page is removed rather than kept as a second view, so there's only one stats UI to maintain. The trend data, charts and the "which games count" rules are unchanged. Record this override in `docs/decisions.md`.
- **Refines "Nickname-only players":** identity is still a nickname with no auth. The server now picks a random funny name when none is given, and players can rename. Names don't need to be unique (a number suffix makes clashes rare). Existing typed names are kept.
- **Names are made on the server**, so there's one word list with tests, and clients never need their own list.
- **The game summary moves into the right panel** ("Last game" card on top), so all numbers live in one column.
- **Structure before style:** the layout and name flow land first, so the design pass styles the final layout once.
- **Look = retro arcade, drawn in code:** a pixel font (self-hosted), bold palette, cabinet frame, and a restyled canvas. No image files. Engine and canvas size are untouched, so all replays and locked test values still hold.

## Known risks
- **Design pass breaks behavior** (e.g. restyled overlays or the panel hide the recording status or the dev hook the smoke recipe uses): the arcade-look sprint keeps the smoke recipe's scripted seed-42 checks as its acceptance test, and wave checks run them in the browser.
- **Canvas redraw drifts from game state** (drawing hitboxes that don't match the engine): keep drawing sizes tied to the engine constants, and check it visually against the scripted run.
- **Panel refresh races** (stats fetched before the server has finished the game): reuse the summary panel's existing wait-for-result logic before refreshing the trend.
- **Phone layout**: two columns won't fit, so the panel stacks below. Check at phone width with device emulation.
- **The font adds a dependency or file:** only one slice adds it, to keep dependency files out of parallel slices.

## Open questions
- The exact word lists and tone for funny names: the sprint picks a first set, and the lists are easy to extend later.
- Whether the rename control rerolls, lets you type, or both: default is both, and the sprint doc settles the details.

## Verification
- A fresh browser (no stored player) can start and finish a recorded game without typing. The player gets a funny name that shows on the page, and the game is stored under that player.
- Renaming (typed or rerolled) updates the shown name and the server record. The player's past games and stats stay attached.
- A browser that already has a stored player keeps its existing nickname.
- Game and stats panel are on one page: after a recorded game, the "Last game" card shows the server summary, and the totals, charts and recent games include that game without a page reload. The separate stats page no longer exists.
- At phone width the panel stacks below the game with no horizontal scrolling.
- The app, including the canvas drawing, has the retro arcade style. Scripted run `/?seed=42&flaps=13,52,90,128,166,199,237` still ends with score 2, death at step 296 `ground`, and the same summary values as before.
- `pnpm check` and CI pass. The smoke recipe in `docs/codebase-structure.md` matches the new flow, and `docs/decisions.md` records the override and the name decisions.
