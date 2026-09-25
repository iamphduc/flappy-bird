# Flappy Bird: a test project for pod

This repo exists to **test [pod](https://github.com/iamphduc/claude-pods)**, my Claude Code plugin that builds a plan in waves of parallel Claude engineers. The game is the test subject: pod's agents planned, built, tested, reviewed and merged almost all of it, from an empty repo. I made the decisions and was the final approver for what reached `main`.

## What was built

A browser Flappy Bird with a backend that records every flap and shows how well you play:

- **Game:** a canvas game with the same physics at 60 steps per second on any screen (it uses a fixed step). Controls are Space, click or tap to flap, and P or Esc to pause. It has a retro arcade look, all drawn in code.
- **Recording:** each game input is streamed to the server over a WebSocket. If the connection drops, the client keeps the events and sends them again, and the server keeps only one copy of each.
- **Trusted results:** the server replays each game with the same engine the client uses, so a score sent by the client is never trusted.
- **Stats:** score per flap, wasted flaps (while rising, or too high), time between flaps, and how you died. They appear in a panel next to the game, with trend charts over your games.
- **Players:** you get a random funny name (for example "Clumsy Cat 25"), and you can rename yourself any time.

Stack: TypeScript, pnpm workspaces, Vite + plain canvas, Fastify, SQLite (`node:sqlite`), Vitest.

## How pod built it

Two plans ran one after the other. Each went through pod's steps: `/pod:plan` (asks me questions, writes the plan) → `/pod:sprint` (splits a sprint into waves of slices that don't share files) → `/pod:autopilot` (engineers build each slice in parallel, each wave becomes one PR, and one final PR goes to `main` after review).

| Plan | Sprints | Wave PRs | Final PR |
|------|---------|----------|----------|
| `flappy-efficiency-mvp`: game, recording, stats | game-core, recording, stats | #2–#8 | #9 (review passed on round 1) |
| `arcade-refresh`: funny names, stats panel on the page, arcade look | names-and-layout, arcade-look | #11–#14 | #15 (review asked for a font fix, #16, then passed) |

All the paperwork pod creates is kept in `docs/`, so you can check the whole process:

- `docs/plans/`: the plans and the decisions made while writing them
- `docs/sprints/archive/`: each sprint's slices, test names, and a summary at the end
- `docs/decisions.md`: architecture decisions
- `docs/handoff-queue.md`: what the engineers and the reviewer flagged, and how each item was handled
- `docs/codebase-structure.md`: the overview and the smoke recipe that engineers use to check their work in the browser
- `docs/known-issues/`: problems specific to this setup (Windows, localhost)

## Run it

Needs Node `>=22.13` and pnpm.

```
pnpm install
pnpm dev        # game at http://localhost:3000 (use localhost, not 127.0.0.1)
pnpm check      # typecheck + tests + build
```

To replay a fixed scripted game (dev only), open `http://localhost:3000/?seed=42&flaps=13,52,90,128,166,199,237`. It always ends with score 2 and death at step 296 on the ground.

## Status

This runs locally only. Before hosting it, look at the open `PENDING` notes in `docs/handoff-queue.md`, mainly rate limits and dev-only seeds.
