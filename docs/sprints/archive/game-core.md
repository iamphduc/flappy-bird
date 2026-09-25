# Sprint: game-core

_From plan: docs/plans/flappy-efficiency-mvp.md · Slug: game-core · Status: archived · Generated: 2026-09-24_


## Status board

| Wave | Slice | Title | Branch | PR | Status | Depends on |
|------|-------|-------|--------|----|--------|------------|
| 1 | E1 | Deterministic engine: seeded PRNG, pipes, bird physics, collision with cause, scoring, pure `step`, `replay` | game-core-e1 | merged | done | — |
| 1 | C1 | Client base: Vitest in client, fixed-timestep stepper, input mapping, dev URL params | game-core-c1 | merged | done | — |
| 2 | C2 | Playable canvas game: session state machine, renderer, rAF wiring, dev hook, smoke recipe | game-core-c2 | merged | done | E1, C1 |

Wave membership lives in the **Wave** column — **computed by the planner, not authored** (see Field semantics). Slices in a wave run in parallel and own disjoint files. Authored levels: **plan → sprint → slice**. Engineers push branches; the orchestrator integrates each wave into **one PR** on the plan branch (see **Branch naming**).

Already done by the bootstrap (PR #1), so not in this sprint: the pnpm monorepo, Vitest in `packages/engine` and `apps/server`, CI (`pod-ci.yml`) and the smoke recipe. No server or network work in this sprint. The existing `/api/health` status line in the client stays as it is.

Dependency hotspots: only **C1** touches `apps/client/package.json` and `pnpm-lock.yaml` (adds `vitest` as a client devDependency, same `^3.2.0` range the other packages use). No other slice adds dependencies. Plain canvas needs none.

## Per-slice detail

### E1: Deterministic engine
- **Scope:** Replace the engine placeholder with the real game, all pure TypeScript with no DOM, Node or wall-clock APIs.
  - `rng.ts`: small seeded PRNG (e.g. mulberry32) over a 32-bit integer seed. Its state is a plain number, so the PRNG state can live inside `GameState`.
  - `constants.ts`: world size (288 x 512, matches the client canvas), ground height, bird x and size, gravity, flap velocity, max fall speed, pipe width, gap size, pipe speed, pipe spacing, gap-center min/max. All in pixels and pixels-per-step at 60 steps/s. Pick classic-feeling values (plan open question); they can be tuned later.
  - `game.ts`: `GameState` is a plain, JSON-serializable object (step number, bird `y`/`vy`, pipes with `x`/`gapY`/`scored`, score, PRNG state, `death: null | { step, cause }`). `createGame(seed)` returns step 0 state. `step(state, input: { flap: boolean }): GameState` returns a **new** state and never mutates its input. A flap sets `vy` to the flap velocity. The top of the world clamps the bird (`y` = top, `vy` = 0), it does not kill. Death causes: `'ground' | 'pipe-top' | 'pipe-bottom'` (top vs bottom pipe tells "flapped too much" from "too little", useful for the stats sprint). Stepping a dead state returns it unchanged. Score goes up by 1 once per pipe, when the bird passes the pipe's right edge. Pipes spawn off-screen right at fixed spacing, with the gap center from the PRNG, and are dropped once off-screen left.
  - `replay.ts`: `replay(seed, flapSteps: number[], maxSteps = 60 * 60 * 10)` runs `step` from `createGame(seed)`, flapping on the listed step numbers, until death or `maxSteps`. Returns `{ score, deathStep, deathCause, flapCount, finalState }` (`deathStep`/`deathCause` are `null` if still alive). The client dev hook uses this now; the server will use it next sprint.
  - `index.ts` re-exports the public API and keeps `STEPS_PER_SECOND` and `stepsToMs`.
  - `tsconfig.json`: set `"lib": ["ES2022"]` and `"types": []` so DOM and Node globals do not typecheck inside the engine.
  - NOT in scope: flap input source (space/click/tap), event/sequence types, per-flap metrics, the wasted-flap rule, any client or server code.
- **Files owned:**
  - `packages/engine/src/index.ts`
  - `packages/engine/src/index.test.ts`
  - `packages/engine/src/rng.ts` (new)
  - `packages/engine/src/rng.test.ts` (new)
  - `packages/engine/src/constants.ts` (new)
  - `packages/engine/src/game.ts` (new)
  - `packages/engine/src/game.test.ts` (new)
  - `packages/engine/src/replay.ts` (new)
  - `packages/engine/src/replay.test.ts` (new)
  - `packages/engine/tsconfig.json`
- **Success criteria:**
  - `[test] same seed gives the same number sequence — packages/engine/src/rng.test.ts › same seed gives the same sequence`
  - `[test] different seeds give different sequences — packages/engine/src/rng.test.ts › different seeds give different sequences`
  - `[test] values stay in [0, 1) over 10k draws — packages/engine/src/rng.test.ts › values stay in [0, 1)`
  - `[test] step does not mutate the state it gets (deep-frozen input does not throw) — packages/engine/src/game.test.ts › step does not mutate its input`
  - `[test] without a flap the bird falls faster each step, capped at max fall speed — packages/engine/src/game.test.ts › gravity accelerates the bird up to max fall speed`
  - `[test] a flap sets vy to the flap velocity — packages/engine/src/game.test.ts › flap sets upward velocity`
  - `[test] the bird is clamped at the top of the world and does not die there — packages/engine/src/game.test.ts › top of the world clamps without death`
  - `[test] touching the ground kills with cause 'ground' and the death step — packages/engine/src/game.test.ts › hitting the ground kills with cause ground`
  - `[test] overlapping the top pipe kills with cause 'pipe-top', the bottom pipe with 'pipe-bottom' — packages/engine/src/game.test.ts › pipe collision reports top or bottom`
  - `[test] passing a pipe's right edge adds 1 to score exactly once — packages/engine/src/game.test.ts › passing a pipe scores once`
  - `[test] stepping a dead state returns it unchanged — packages/engine/src/game.test.ts › dead state does not advance`
  - `[test] pipe gap centers match for the same seed, differ for another seed, and stay within min/max — packages/engine/src/game.test.ts › pipe layout comes from the seed`
  - `[test] same seed + flap steps give the same score, death step and cause twice — packages/engine/src/replay.test.ts › replay is deterministic`
  - `[test] no flaps dies on the ground within the first few seconds with score 0 — packages/engine/src/replay.test.ts › no flaps dies on the ground`
  - `[test] stepping through a JSON round-trip of the state at every step gives the same result as plain stepping — packages/engine/src/replay.test.ts › state survives JSON round-trip`
  - `[test] replay never calls Math.random, Date.now or performance.now (spies throw) — packages/engine/src/replay.test.ts › replay uses no wall-clock or global randomness`
  - `[test] a known scripted flap list scores at least 1 on a fixed seed (lock the exact score and death step as a regression value) — packages/engine/src/replay.test.ts › scripted flaps pass a pipe`
  - `[test] existing stepsToMs tests still pass — packages/engine/src/index.test.ts › maps one second of steps to 1000 ms`
- **Depends on:** —

### C1: Client base
- **Scope:** Pure, DOM-free client helpers that the game wiring in C2 builds on, plus Vitest for the client.
  - Add `vitest` (`^3.2.0`) as a client devDependency and a `"test": "vitest run"` script, so root `pnpm test` / `pnpm check` runs client tests. This is the **only** slice this sprint that changes a `package.json` or `pnpm-lock.yaml`.
  - `loop.ts`: a fixed-timestep stepper, decoupled from rAF. `createStepper({ stepMs = 1000 / 60, maxStepsPerFrame = 5 })` with `advance(nowMs): number` (how many engine steps to run this frame, using an accumulator) and `reset(nowMs)` (drops built-up time, used on start and resume so paused time never turns into steps). Leftover time beyond the cap is dropped, not carried.
  - `input.ts`: `actionFromKey({ code, repeat })` and `actionFromPointer({ pointerType })` return `{ type: 'flap', source: 'space' | 'click' | 'tap' } | { type: 'pause' } | null`. Space is a flap; `KeyP` and `Escape` are pause; key repeats are ignored; any other key gives `null` (the plan never records non-game keys). Mouse is `click`; touch and pen are `tap`. Takes plain objects so tests need no DOM.
  - `devParams.ts`: `parseDevParams(search: string)` reads `?seed=<uint32>&flaps=<comma list of step numbers>` and returns `{ seed?: number, flaps?: number[] }`. Bad values are ignored; flaps are de-duplicated and sorted.
  - NOT in scope: `main.ts`, canvas drawing, adding listeners to the DOM, any engine changes.
- **Files owned:**
  - `apps/client/package.json`
  - `pnpm-lock.yaml`
  - `apps/client/src/loop.ts` (new)
  - `apps/client/src/loop.test.ts` (new)
  - `apps/client/src/input.ts` (new)
  - `apps/client/src/input.test.ts` (new)
  - `apps/client/src/devParams.ts` (new)
  - `apps/client/src/devParams.test.ts` (new)
- **Success criteria:**
  - `[test] Vitest runs in the client (red before loop.ts exists, green after; picked up by pnpm --filter @flappy/client test) — apps/client/src/loop.test.ts › first advance returns 0 steps`
  - `[test] one second of 30 fps frames gives 60 steps — apps/client/src/loop.test.ts › 30 fps frames give 60 steps per second`
  - `[test] one second of 144 Hz frames gives 60 steps — apps/client/src/loop.test.ts › 144 Hz frames give 60 steps per second`
  - `[test] a 5 s gap gives at most maxStepsPerFrame steps and drops the rest — apps/client/src/loop.test.ts › long gaps are capped`
  - `[test] reset drops built-up time so the next advance starts fresh — apps/client/src/loop.test.ts › reset drops paused time`
  - `[test] Space maps to a flap with source 'space' — apps/client/src/input.test.ts › Space is a flap`
  - `[test] a repeated Space keydown is ignored — apps/client/src/input.test.ts › key repeat is ignored`
  - `[test] KeyP and Escape map to pause — apps/client/src/input.test.ts › P and Escape pause`
  - `[test] other keys (e.g. KeyA, Enter) map to null — apps/client/src/input.test.ts › other keys are ignored`
  - `[test] mouse pointer is 'click', touch and pen are 'tap' — apps/client/src/input.test.ts › pointer type sets flap source`
  - `[test] seed and flaps are parsed; flaps come back sorted and de-duplicated — apps/client/src/devParams.test.ts › parses seed and flaps`
  - `[test] missing or bad values (negative, non-integer, text) are left out — apps/client/src/devParams.test.ts › ignores bad values`
- **Depends on:** —

### C2: Playable canvas game
- **Scope:** Turn the placeholder canvas into the playable game, offline, using the engine (E1) and the client helpers (C1).
  - `session.ts`: a pure game session around the engine with phases `'ready' | 'playing' | 'paused' | 'over'`. `createSession({ seed, script? })`, `handle(session, action)` (actions from `input.ts`, plus `restart`) and `tick(session)` (one engine step, only while `playing`). The first flap in `ready` starts the game and is applied at step 0. Pause toggles `playing` / `paused`; flaps while paused are ignored. On engine death the phase becomes `over`; a flap (or restart) in `over` goes back to `ready` with a new seed. With a `script` (flap step list), the session flaps on those steps by itself, starts on its own, and ignores player flaps, so a run is repeatable without human timing.
  - `render.ts`: draws a `GameState` + phase on the 288 x 512 canvas: sky, pipes, ground, bird, score, and overlay text for ready ("Press Space / click / tap"), paused and game over (score + death cause + "flap to restart").
  - `main.ts`: rAF loop that asks the C1 stepper how many steps to run and calls `tick` that many times, then renders once. Physics speed must not depend on refresh rate. Listens to `keydown` (preventDefault on Space so the page does not scroll) and `pointerdown` on the canvas, mapping them through `input.ts`. Calls `stepper.reset` on start and resume. Auto-pauses when the tab is hidden. Seed: from `?seed=` in dev, else a random uint32 (the client may use `Math.random`; the engine may not). Keep the existing `/api/health` status line as it is.
  - Dev hook (only when `import.meta.env.DEV`): `?seed=&flaps=` from `devParams.ts` builds a scripted session; `window.__flappy` exposes a read-only snapshot `{ phase, seed, step, score, death, flapCount }` plus `replay(seed, flaps)` (the engine's `replay`) so an engineer can compare the live game with the engine result from the browser console.
  - Update `docs/codebase-structure.md`: set the status line and client part description to match the real game; in the **Smoke recipe**, change the **Browser check** to the scripted run (open `/?seed=<n>&flaps=<list>`, wait for game over, check `window.__flappy` matches `window.__flappy.replay(<n>, [<list>])`) and describe the controls.
  - NOT in scope: engine changes (raise a handoff-queue entry if the engine API is missing something), network/WebSocket, nickname, stats screens, new dependencies.
- **Files owned:**
  - `apps/client/src/main.ts`
  - `apps/client/index.html`
  - `apps/client/src/session.ts` (new)
  - `apps/client/src/session.test.ts` (new)
  - `apps/client/src/render.ts` (new)
  - `docs/codebase-structure.md`
- **Success criteria:**
  - `[test] a new session starts in 'ready' and tick does not advance the engine — apps/client/src/session.test.ts › ready does not advance`
  - `[test] the first flap in ready moves to 'playing' and applies the flap at step 0 — apps/client/src/session.test.ts › first flap starts the game`
  - `[test] pause stops ticks from advancing; pause again resumes — apps/client/src/session.test.ts › pause toggles and freezes the game`
  - `[test] flaps while paused are ignored — apps/client/src/session.test.ts › flaps while paused are ignored`
  - `[test] engine death moves the session to 'over' with the death cause, and later ticks change nothing — apps/client/src/session.test.ts › death ends the game`
  - `[test] a flap in 'over' goes back to 'ready' with a new game — apps/client/src/session.test.ts › flap after game over restarts`
  - `[test] a scripted session ticked until death gives the same score, death step and cause as engine replay with the same seed and flaps — apps/client/src/session.test.ts › scripted session matches engine replay`
  - `[manual] the game is playable: Space, mouse click and touch tap all flap; P/Escape pause and resume; game over shows score and cause; flapping restarts; Space does not scroll the page — run the smoke recipe, open http://localhost:3000/ and play a few rounds (use device emulation in DevTools for tap)`
  - `[manual] physics speed does not depend on refresh rate: pipe speed looks the same with DevTools CPU throttling / a 30 Hz rAF as at normal speed, and a hidden tab pauses the game — play with throttling on and off; switch tabs mid-game`
  - `[manual] scripted run matches the engine: open http://localhost:3000/?seed=42&flaps=<list from the E1 regression test>, wait for game over, then in the console window.__flappy shows phase 'over' with the same score, step and death cause as window.__flappy.replay(42, [<list>]) — browser console`
  - `[manual] the drawing looks right (bird, pipes, ground, score, overlays) — visual check in the browser; a test can't judge layout`
- **Depends on:** E1, C1

## Sprint summary

- **Synced with merge-target:** up to date (first sprint of the plan; plan branch cut from `main` at 9ef0aa0)
- **Slices shipped:** E1, C1 (wave 1, PR #2), C2 (wave 2, PR #3) — each engineer worked test-first and browser-verified its own runtime
- **Queue entries:** resolved 1 (autopilot preflight BLOCKED), deferred 7 — all `PENDING` from engineers, dated 2026-09-24 with `sprint: game-core` in `docs/handoff-queue.md` (engine rule defaults and regression values from E1; pointer fallback and limited browser check from C1; scripted-restart seed, flap collapsing within one frame, and favicon 404 / emulated-only touch from C2)
- **Approximate token cost:** ~290k subagent tokens (planner ~35k, E1 ~91k, C1 ~67k, C2 ~95k) plus orchestration
