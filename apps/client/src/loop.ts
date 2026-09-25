export interface StepperOptions {
  /** Length of one engine step in ms. */
  stepMs?: number;
  /** Most steps one frame may run; time beyond this is dropped. */
  maxStepsPerFrame?: number;
}

export interface Stepper {
  /** How many engine steps to run for a frame at `nowMs`. */
  advance(nowMs: number): number;
  /** Drops built-up time, e.g. on start or resume, so paused time never becomes steps. */
  reset(nowMs: number): void;
}

// Frame times are floats, so allow a tiny rounding error before flooring.
const EPSILON = 1e-6;

/** Fixed-timestep stepper with an accumulator, not tied to requestAnimationFrame. */
export function createStepper({ stepMs = 1000 / 60, maxStepsPerFrame = 5 }: StepperOptions = {}): Stepper {
  let lastMs: number | null = null;
  let accMs = 0;

  return {
    advance(nowMs) {
      if (lastMs === null) {
        lastMs = nowMs;
        return 0;
      }
      accMs += nowMs - lastMs;
      lastMs = nowMs;
      const steps = Math.floor(accMs / stepMs + EPSILON);
      if (steps > maxStepsPerFrame) {
        accMs = 0;
        return maxStepsPerFrame;
      }
      accMs = Math.max(0, accMs - steps * stepMs);
      return steps;
    },
    reset(nowMs) {
      lastMs = nowMs;
      accMs = 0;
    },
  };
}
