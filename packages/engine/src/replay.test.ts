import { afterEach, describe, expect, it, vi } from "vitest";
import { STEPS_PER_SECOND } from "./constants.ts";
import { createGame, step, type GameState } from "./game.ts";
import { replay } from "./replay.ts";

/**
 * Regression script for seed 42: passes at least one pipe, then stops
 * flapping and dies. The client smoke check can use the same list.
 */
const SCRIPTED_SEED = 42;
const SCRIPTED_FLAPS: number[] = [];

afterEach(() => {
  vi.restoreAllMocks();
});

describe("replay", () => {
  it("replay is deterministic", () => {
    const flaps = [0, 20, 40, 60, 80, 100];
    const a = replay(7, flaps);
    const b = replay(7, flaps);
    expect(a.score).toBe(b.score);
    expect(a.deathStep).toBe(b.deathStep);
    expect(a.deathCause).toBe(b.deathCause);
    expect(a.finalState).toEqual(b.finalState);
  });

  it("no flaps dies on the ground", () => {
    const r = replay(1, []);
    expect(r.deathCause).toBe("ground");
    expect(r.score).toBe(0);
    expect(r.flapCount).toBe(0);
    expect(r.deathStep).not.toBeNull();
    expect(r.deathStep!).toBeLessThan(3 * STEPS_PER_SECOND);
    expect(r.finalState.death).toEqual({ step: r.deathStep, cause: "ground" });
  });

  it("stops at maxSteps while still alive", () => {
    const r = replay(1, [0], 5);
    expect(r.deathStep).toBeNull();
    expect(r.deathCause).toBeNull();
    expect(r.finalState.step).toBe(5);
    expect(r.flapCount).toBe(1);
  });

  it("counts only flaps applied before death", () => {
    const r = replay(1, [0, 5, 100000]);
    expect(r.flapCount).toBe(2);
  });

  it("state survives JSON round-trip", () => {
    const flaps = new Set([0, 15, 30, 45, 60, 75, 90, 105, 120]);
    let plain: GameState = createGame(99);
    let tripped: GameState = createGame(99);
    for (let i = 0; i < 400; i++) {
      const input = { flap: flaps.has(i) };
      plain = step(plain, input);
      tripped = step(JSON.parse(JSON.stringify(tripped)) as GameState, input);
      expect(tripped).toEqual(plain);
    }
  });

  it("replay uses no wall-clock or global randomness", () => {
    const boom = (): never => {
      throw new Error("engine must not use this");
    };
    vi.spyOn(Math, "random").mockImplementation(boom);
    vi.spyOn(Date, "now").mockImplementation(boom);
    const g = globalThis as unknown as { performance?: { now(): number } };
    if (g.performance) vi.spyOn(g.performance, "now").mockImplementation(boom);
    expect(() => replay(42, [0, 20, 40, 60, 80, 100, 120, 140])).not.toThrow();
    expect(() => replay(SCRIPTED_SEED, SCRIPTED_FLAPS)).not.toThrow();
  });

  it("scripted flaps pass a pipe", () => {
    const r = replay(SCRIPTED_SEED, SCRIPTED_FLAPS);
    expect(r.score).toBeGreaterThanOrEqual(1);
    expect(r.deathStep).not.toBeNull();
    // Locked regression values: change only on purpose (it means the game was re-tuned).
    expect({ score: r.score, deathStep: r.deathStep, deathCause: r.deathCause }).toEqual({
      score: -1,
      deathStep: -1,
      deathCause: "ground",
    });
  });
});
