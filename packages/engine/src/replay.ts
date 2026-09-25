// Replays a game from its seed and the steps the player flapped on.
import { createGame, step, type DeathCause, type GameState } from "./game.ts";

export interface ReplayResult {
  score: number;
  /** Step the bird died on, or null if it was still alive at maxSteps. */
  deathStep: number | null;
  deathCause: DeathCause | null;
  /** Flaps actually applied (flaps listed after death are not counted). */
  flapCount: number;
  finalState: GameState;
}

/** Default cap: ten minutes of game time at 60 steps/s. */
export const DEFAULT_MAX_STEPS = 60 * 60 * 10;

/**
 * Runs the game from `createGame(seed)`, flapping on each listed step number
 * (a flap at step n turns state n into state n + 1), until death or maxSteps.
 */
export function replay(
  seed: number,
  flapSteps: number[],
  maxSteps: number = DEFAULT_MAX_STEPS,
): ReplayResult {
  const flaps = new Set(flapSteps);
  let state = createGame(seed);
  let flapCount = 0;
  while (state.death === null && state.step < maxSteps) {
    const flap = flaps.has(state.step);
    if (flap) flapCount += 1;
    state = step(state, { flap });
  }
  return {
    score: state.score,
    deathStep: state.death?.step ?? null,
    deathCause: state.death?.cause ?? null,
    flapCount,
    finalState: state,
  };
}
