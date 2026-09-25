// Shared, deterministic game engine, used by both the client and the server.
import { STEPS_PER_SECOND } from "./constants.ts";

export * from "./constants.ts";
export { nextFloat, seedRng } from "./rng.ts";
export {
  createGame,
  step,
  type Bird,
  type DeathCause,
  type GameState,
  type Pipe,
  type StepInput,
} from "./game.ts";
export { DEFAULT_MAX_STEPS, replay, type ReplayResult } from "./replay.ts";
export * from "./protocol.ts";
export type * from "./stats.ts";

/** Converts a step count to milliseconds of game time. */
export function stepsToMs(steps: number): number {
  return (steps * 1000) / STEPS_PER_SECOND;
}
