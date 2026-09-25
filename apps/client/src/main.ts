import { STEPS_PER_SECOND, replay } from '@flappy/engine';
import { parseDevParams } from './devParams.ts';
import { actionFromKey, actionFromPointer } from './input.ts';
import { createStepper } from './loop.ts';
import { render } from './render.ts';
import { createSession, handle, snapshot, tick, type Session, type SessionAction } from './session.ts';

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const ctx = canvas.getContext('2d')!;

/** Random uint32 seed. The client may use Math.random; the engine never does. */
function randomSeed(): number {
  return Math.floor(Math.random() * 0x1_0000_0000) >>> 0;
}

const dev = import.meta.env.DEV ? parseDevParams(window.location.search) : {};
let session: Session = createSession({
  seed: dev.seed ?? randomSeed(),
  script: dev.flaps,
  nextSeed: randomSeed,
});

const stepper = createStepper();
// Set when play starts or resumes; the next frame resets the stepper with its own timestamp,
// so time spent in ready, paused or a hidden tab never turns into steps.
let resetStepper = true;

function dispatch(action: SessionAction): void {
  const before = session.phase;
  session = handle(session, action);
  if (before !== 'playing' && session.phase === 'playing') resetStepper = true;
}

function frame(now: number): void {
  if (resetStepper || session.phase !== 'playing') {
    stepper.reset(now);
    resetStepper = false;
  }
  // A scripted session starts itself on its first tick while ready.
  const steps = session.phase === 'ready' && session.script ? 1 : stepper.advance(now);
  for (let i = 0; i < steps; i++) session = tick(session);
  render(ctx, session.game, session.phase);
  requestAnimationFrame(frame);
}

window.addEventListener('keydown', (event) => {
  // Stop Space from scrolling the page, including key repeats.
  if (event.code === 'Space') event.preventDefault();
  const action = actionFromKey(event);
  if (action) dispatch(action);
});

canvas.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  dispatch(actionFromPointer(event));
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && session.phase === 'playing') dispatch({ type: 'pause' });
});

if (import.meta.env.DEV) {
  const hook = {
    get phase() { return snapshot(session).phase; },
    get seed() { return snapshot(session).seed; },
    get step() { return snapshot(session).step; },
    get score() { return snapshot(session).score; },
    get death() { return snapshot(session).death; },
    get flapCount() { return snapshot(session).flapCount; },
    replay,
  };
  Object.defineProperty(window, '__flappy', { value: Object.freeze(hook) });
}

requestAnimationFrame(frame);

const status = document.querySelector<HTMLParagraphElement>('#status')!;
fetch('/api/health')
  .then((res) => res.json())
  .then((body: { ok: boolean }) => {
    status.textContent = body.ok
      ? `Server OK · engine at ${STEPS_PER_SECOND} steps/s`
      : 'Server error';
  })
  .catch(() => {
    status.textContent = 'Server unreachable';
  });
