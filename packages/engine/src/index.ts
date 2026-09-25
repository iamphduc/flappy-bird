// Shared game engine, used by both the client and the server.
// Placeholder until the game-core sprint adds the real physics.

/** Physics steps per second. Fixed so games play the same on any screen. */
export const STEPS_PER_SECOND = 60;

/** Converts a step count to milliseconds of game time. */
export function stepsToMs(steps: number): number {
  return (steps * 1000) / STEPS_PER_SECOND;
}
