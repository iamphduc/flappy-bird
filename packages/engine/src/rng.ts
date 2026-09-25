// Small seeded PRNG (mulberry32). Its whole state is one 32-bit unsigned
// integer, so it can live inside the JSON game state.

/** Turns any number into a valid PRNG state (a uint32). */
export function seedRng(seed: number): number {
  return seed >>> 0;
}

/** Draws the next value in [0, 1) and returns it with the new state. */
export function nextFloat(state: number): { value: number; state: number } {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = Math.imul(next ^ (next >>> 15), next | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, state: next };
}
