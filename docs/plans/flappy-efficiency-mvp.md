# Plan: Flappy Bird with player efficiency tracking

_Generated: 2026-09-24 · Status: active · Grilled-with: grill-me_

<!-- autopilot-run: started=2026-09-25T02:16:12Z sprints=2 waves=5 -->

## Goal
Build a browser Flappy Bird game that streams every flap to a backend, which replays the game to get trusted results and shows each player how efficient they are, both per game and over time.

## Why
The user wants to measure how efficiently a player plays, not just their score. Success means a player can enter a nickname, play, see a summary of how efficient that game was (score per flap, wasted flaps, flap timing, death cause), and see a trend across their games. All numbers must come from the server's replay of the recorded inputs, not from what the client says.

Constraints: the repo starts empty (see Assumptions). Everything runs locally with one command. The design must keep a later "compare to ideal path" analysis possible (hence deterministic physics and a stored seed).

**Assumptions:** `docs/` held only the pod scaffold when this plan was written. No code, stack, or decisions existed before it.

## Scope
**In scope:**
- pnpm monorepo in TypeScript with three parts: a shared deterministic game engine, a Vite + canvas client, and a Node + Fastify + SQLite server
- Fixed-timestep physics (60 steps a second) and a pipe layout set by a server-issued seed
- Nickname-only players (player ID kept in the browser, no passwords)
- Recording game inputs only: flap (Space / click / tap, with input type), plus start, pause/resume and death
- Live WebSocket streaming with sequence numbers. The game never waits for the network: the client buffers events and resends them after a reconnect, and the server ignores duplicates. Games with gaps are marked incomplete and left out of the stats.
- Server replay of inputs + seed to get the real score, death cause, and bird state at each flap
- Metrics: score per flap, wasted flaps (rule-based), time between flaps, death cause, and trends over time
- Game-over summary screen and a "My stats" page with a trend chart for the current player
- Smoke recipe in `docs/codebase-structure.md` and a GitHub Actions CI (verify + gitleaks)

**Out of scope:**
- Ideal-path comparison (deferred to a follow-up plan, which this plan's determinism makes possible)
- Real accounts / auth, and any view of other players (leaderboards, admin dashboard)
- Recording non-game key presses
- Hosting / production deploy (a separate small plan later)
- Mobile or desktop native apps

## Sprint sequence

| Sprint | Goal | Status | Depends on |
|--------|------|--------|------------|
| game-core | Monorepo, tested deterministic engine, playable canvas game offline, smoke recipe + CI | done | — |
| recording | Fastify + SQLite server, nickname players, WebSocket game sessions with seed, buffer/resend/dedupe, server replay and stored results | done | game-core |
| stats | Efficiency metrics from replay, game-over summary, My stats trend page | planned | recording |

Status values: `planned` / `active` / `done`. The orchestrator only flips its row's Status — it does not rewrite Goal/Depends-on retroactively.

The `Depends on` column is the **only** cross-sprint dependency signal. Wave ordering and per-slice deps live inside the sprint doc and are opaque from here.

**Integration:** the orchestrator cuts one **plan integration branch** (named for this plan's slug) off `main`. All wave PRs land on it; one final PR merges it to `main` when the last sprint completes. The slug doubles as a branch name — keep it flat kebab-case.

## Key decisions
None of these contradict `docs/decisions.md`, which was empty. Each should get an entry there when its sprint lands.
- **Web browser, TypeScript everywhere:** Vite + plain canvas (no game engine), Node + Fastify, SQLite file database. Fewest moving parts and no Docker. Shared types for events.
- **Deterministic shared engine:** one engine package used by both client and server, with a fixed 60Hz timestep and seeded pipes. This makes games fair across screen refresh rates and lets the server replay them.
- **Server is the source of truth:** the server replays the inputs to get the score, death cause and state at each flap. Client-reported results are never trusted for metrics.
- **Live WebSocket, not one upload per game:** the user's choice. Events carry in-game time (step number) and a sequence number. Arrival time is never used for analysis.
- **Keep playing on disconnect:** buffer, resend, dedupe. Games with gaps are flagged incomplete rather than guessed at.
- **Nickname-only identity:** enough for per-player trends, with no auth work. Anyone can reuse a name, which is accepted.
- **Wasted flap rule:** a flap is wasted if the bird was already rising when it happened, or if it pushed the bird above the next pipe gap. The rule lives in one server-side function so it's easy to tune.
- **Only game inputs are recorded**, for privacy and to keep noise out of the data.

## Known risks
- **Client and server engines drifting apart** (e.g. floating-point or time differences give different replay results): use one shared package, integer step counts instead of wall-clock time, and a test that replays recorded games and checks the client's result matches the server's.
- **WebSocket reconnect edge cases** (duplicate events, events out of order, a game ending while offline): sequence numbers plus server-side dedupe, a clear "incomplete" state, and tests that simulate drops.
- **The wasted-flap rule may feel wrong in practice:** keep it in one function with tests and tune it after playtesting.
- **Browser verification of a timing-based game:** the smoke recipe should include a way to run a game from scripted inputs (e.g. a fixed seed + input list) so engineers can check results reliably.

## Open questions
- Exact physics constants (gravity, flap strength, pipe gap/speed): pick classic-feeling values in game-core, then tune.
- How long an idle WebSocket may wait before a game counts as abandoned: to be set in the recording sprint.

## Verification
- `pnpm install && pnpm dev` starts the client and server locally, and the game is playable in a browser at 60Hz physics on any refresh rate.
- With the same seed and inputs, the engine gives the same score and death step on client and server (covered by an automated test).
- Playing a game creates a stored game record with every flap (input type, step, sequence number), the seed, and a server-computed score that matches what the client showed.
- Cutting the network mid-game and reconnecting still gives a complete game with no duplicate events. A game that never reconnects is stored as incomplete and left out of the stats.
- The game-over screen shows score, flaps, score per flap, wasted flaps, flap timing and death cause, all from the server.
- The "My stats" page shows a trend across the current player's complete games.
- Non-game key presses are never sent to the server.
- CI runs the smoke recipe's verification command and gitleaks on every PR.
- `docs/codebase-structure.md` has a working smoke recipe, and `docs/decisions.md` has entries for the key decisions above.
