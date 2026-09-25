import { describe, expect, it } from 'vitest';
import { createStepper } from './loop.ts';

/** Feeds frames at a fixed interval from t=0 to t=durationMs and sums the steps. */
function runFrames(frameMs: number, durationMs: number): number {
  const stepper = createStepper();
  let total = 0;
  const frames = Math.round(durationMs / frameMs);
  for (let i = 0; i <= frames; i++) total += stepper.advance(i * frameMs);
  return total;
}

describe('createStepper', () => {
  it('first advance returns 0 steps', () => {
    const stepper = createStepper();
    expect(stepper.advance(12345)).toBe(0);
  });

  it('30 fps frames give 60 steps per second', () => {
    expect(runFrames(1000 / 30, 1000)).toBe(60);
  });

  it('144 Hz frames give 60 steps per second', () => {
    expect(runFrames(1000 / 144, 1000)).toBe(60);
  });

  it('long gaps are capped', () => {
    const stepper = createStepper({ maxStepsPerFrame: 5 });
    stepper.advance(0);
    expect(stepper.advance(5000)).toBe(5);
    // The rest of the 5 s is dropped, not carried into later frames.
    expect(stepper.advance(5000 + 1000 / 60)).toBe(1);
  });

  it('reset drops paused time', () => {
    const stepper = createStepper();
    stepper.advance(0);
    stepper.advance(10); // 10 ms built up, not yet a step
    stepper.reset(3000);
    expect(stepper.advance(3000)).toBe(0);
    expect(stepper.advance(3000 + 1000 / 60)).toBe(1);
  });
});
