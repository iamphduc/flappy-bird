import { describe, expect, it } from "vitest";
import {
  BIRD_SIZE,
  BIRD_X,
  FLAP_VELOCITY,
  GAP_CENTER_MAX,
  GAP_CENTER_MIN,
  GRAVITY,
  GROUND_Y,
  MAX_FALL_SPEED,
  PIPE_GAP,
  PIPE_WIDTH,
} from "./constants.ts";
import { createGame, step, type GameState } from "./game.ts";

const NO_FLAP = { flap: false };
const FLAP = { flap: true };

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** A game with the bird and pipes placed by hand (no pipes by default). */
function withBird(y: number, vy: number, pipes: GameState["pipes"] = []): GameState {
  const base = createGame(1);
  return { ...base, bird: { y, vy }, pipes };
}

/** Holds the bird in the middle of the next pipe's gap, so it never dies. */
function holdInGap(state: GameState): GameState {
  const next = state.pipes.find((p) => p.x + PIPE_WIDTH >= BIRD_X);
  return next ? { ...state, bird: { y: next.gapY - BIRD_SIZE / 2, vy: 0 } } : state;
}

/** Gap centers of every pipe spawned over `steps` steps. */
function gapCenters(seed: number, steps: number): number[] {
  let state = createGame(seed);
  const seen: number[] = state.pipes.map((p) => p.gapY);
  for (let i = 0; i < steps; i++) {
    const before = state.pipes[state.pipes.length - 1];
    state = step(holdInGap(state), NO_FLAP);
    expect(state.death).toBeNull();
    const last = state.pipes[state.pipes.length - 1];
    if (last && (!before || last.x > before.x)) seen.push(last.gapY);
  }
  return seen;
}

describe("game", () => {
  it("createGame starts at step 0, alive, score 0, with a JSON-safe state", () => {
    const state = createGame(7);
    expect(state.step).toBe(0);
    expect(state.death).toBeNull();
    expect(state.score).toBe(0);
    expect(cloneJson(state)).toEqual(state);
  });

  it("step does not mutate its input", () => {
    let state = createGame(3);
    for (let i = 0; i < 5; i++) {
      const frozen = deepFreeze(cloneJson(state));
      const snapshot = JSON.stringify(frozen);
      const a = step(frozen, NO_FLAP);
      const b = step(frozen, FLAP);
      expect(JSON.stringify(frozen)).toBe(snapshot);
      expect(a).not.toBe(frozen);
      expect(b).not.toBe(frozen);
      state = a;
    }
  });

  it("gravity accelerates the bird up to max fall speed", () => {
    let state = withBird(0, 0);
    let prevVy = state.bird.vy;
    let prevY = state.bird.y;
    let capped = false;
    for (let i = 0; i < 40 && state.death === null; i++) {
      state = step(state, NO_FLAP);
      expect(state.bird.y).toBeGreaterThan(prevY);
      if (prevVy + GRAVITY < MAX_FALL_SPEED) {
        expect(state.bird.vy).toBeCloseTo(prevVy + GRAVITY, 10);
      } else {
        expect(state.bird.vy).toBe(MAX_FALL_SPEED);
        capped = true;
      }
      prevVy = state.bird.vy;
      prevY = state.bird.y;
    }
    expect(capped).toBe(true);
  });

  it("flap sets upward velocity", () => {
    const falling = step(withBird(200, 5), FLAP);
    expect(falling.bird.vy).toBe(FLAP_VELOCITY);
    expect(falling.bird.y).toBeCloseTo(200 + FLAP_VELOCITY, 10);
    const rising = step(withBird(200, -3), FLAP);
    expect(rising.bird.vy).toBe(FLAP_VELOCITY);
  });

  it("top of the world clamps without death", () => {
    let state = withBird(1, 0);
    for (let i = 0; i < 20; i++) {
      state = step(state, FLAP);
      expect(state.death).toBeNull();
      expect(state.bird.y).toBeGreaterThanOrEqual(0);
    }
    expect(state.bird.y).toBe(0);
    expect(state.bird.vy).toBe(0);
  });

  it("hitting the ground kills with cause ground", () => {
    const start = { ...withBird(GROUND_Y - BIRD_SIZE - 1, 5), step: 10 };
    const dead = step(start, NO_FLAP);
    expect(dead.death).toEqual({ step: 11, cause: "ground" });
    expect(dead.step).toBe(11);
  });

  it("pipe collision reports top or bottom", () => {
    const gapY = 250;
    const pipe = { x: BIRD_X, gapY, scored: false };
    const inTop = withBird(gapY - PIPE_GAP / 2 - BIRD_SIZE / 2, 0, [pipe]);
    expect(step(inTop, NO_FLAP).death).toEqual({ step: 1, cause: "pipe-top" });

    const inBottom = withBird(gapY + PIPE_GAP / 2 - BIRD_SIZE / 2, 0, [pipe]);
    expect(step(inBottom, NO_FLAP).death).toEqual({ step: 1, cause: "pipe-bottom" });

    const inGap = withBird(gapY - BIRD_SIZE / 2, 0, [pipe]);
    expect(step(inGap, NO_FLAP).death).toBeNull();
  });

  it("passing a pipe scores once", () => {
    // Right edge sits just in front of the bird's left edge: one step moves it past.
    const pipe = { x: BIRD_X - PIPE_WIDTH + 1, gapY: 200, scored: false };
    let state = step(withBird(200 - BIRD_SIZE / 2, 0, [pipe]), NO_FLAP);
    expect(state.score).toBe(1);
    for (let i = 0; i < 10; i++) state = step(state, i % 3 === 0 ? FLAP : NO_FLAP);
    expect(state.death).toBeNull();
    expect(state.score).toBe(1);
  });

  it("a pipe not yet passed does not score", () => {
    const pipe = { x: BIRD_X - PIPE_WIDTH + 10, gapY: 200, scored: false };
    const state = step(withBird(200 - BIRD_SIZE / 2, 0, [pipe]), NO_FLAP);
    expect(state.score).toBe(0);
  });

  it("dead state does not advance", () => {
    const dead = step(withBird(GROUND_Y - BIRD_SIZE, 5), NO_FLAP);
    expect(dead.death).not.toBeNull();
    expect(step(dead, NO_FLAP)).toEqual(dead);
    expect(step(dead, FLAP)).toEqual(dead);
  });

  it("pipe layout comes from the seed", () => {
    const a = gapCenters(42, 2000);
    const b = gapCenters(42, 2000);
    const c = gapCenters(43, 2000);
    expect(a.length).toBeGreaterThan(15);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    for (const g of [...a, ...c]) {
      expect(g).toBeGreaterThanOrEqual(GAP_CENTER_MIN);
      expect(g).toBeLessThanOrEqual(GAP_CENTER_MAX);
    }
  });

  it("pipes are dropped once off-screen left", () => {
    let state = createGame(5);
    for (let i = 0; i < 2000; i++) {
      state = step(holdInGap(state), NO_FLAP);
      for (const p of state.pipes) expect(p.x + PIPE_WIDTH).toBeGreaterThanOrEqual(0);
    }
    expect(state.pipes.length).toBeLessThanOrEqual(4);
  });
});
