import { describe, expect, it } from "vitest";
import { nextFloat, seedRng } from "./rng.ts";

function draws(seed: number, count: number): number[] {
  let state = seedRng(seed);
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const r = nextFloat(state);
    out.push(r.value);
    state = r.state;
  }
  return out;
}

describe("rng", () => {
  it("same seed gives the same sequence", () => {
    expect(draws(42, 100)).toEqual(draws(42, 100));
  });

  it("different seeds give different sequences", () => {
    expect(draws(1, 20)).not.toEqual(draws(2, 20));
    expect(draws(0, 20)).not.toEqual(draws(0xffffffff, 20));
  });

  it("values stay in [0, 1)", () => {
    const values = draws(123456789, 10_000);
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    // Not stuck on a few values.
    expect(new Set(values).size).toBeGreaterThan(9_000);
  });

  it("state is a plain 32-bit unsigned integer", () => {
    let state = seedRng(-1);
    for (let i = 0; i < 100; i++) {
      expect(Number.isInteger(state)).toBe(true);
      expect(state).toBeGreaterThanOrEqual(0);
      expect(state).toBeLessThanOrEqual(0xffffffff);
      state = nextFloat(state).state;
    }
  });
});
