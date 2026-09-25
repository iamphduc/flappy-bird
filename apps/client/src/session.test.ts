import { FLAP_VELOCITY, replay } from '@flappy/engine';
import { describe, expect, it } from 'vitest';
import { createSession, handle, snapshot, tick, type Session } from './session.ts';

const FLAP = { type: 'flap', source: 'space' } as const;
const PAUSE = { type: 'pause' } as const;

// E1's locked regression run: seed 42 scores 2 and dies on the ground at step 296.
const SCRIPT_SEED = 42;
const SCRIPT_FLAPS = [13, 52, 90, 128, 166, 199, 237];

function tickUntilOver(session: Session, maxTicks = 10_000): Session {
  let s = session;
  for (let i = 0; i < maxTicks && s.phase !== 'over'; i++) s = tick(s);
  return s;
}

describe('session', () => {
  it('ready does not advance', () => {
    const s0 = createSession({ seed: 1 });
    expect(s0.phase).toBe('ready');
    const s1 = tick(tick(s0));
    expect(s1.phase).toBe('ready');
    expect(s1.game.step).toBe(0);
    expect(s1.game).toEqual(s0.game);
  });

  it('first flap starts the game', () => {
    const s0 = handle(createSession({ seed: 1 }), FLAP);
    expect(s0.phase).toBe('playing');
    const s1 = tick(s0);
    expect(s1.game.step).toBe(1);
    expect(s1.game.bird.vy).toBe(FLAP_VELOCITY);
    expect(s1.flaps).toEqual([0]);
  });

  it('pause toggles and freezes the game', () => {
    let s = tick(tick(handle(createSession({ seed: 1 }), FLAP)));
    const before = s.game;
    s = handle(s, PAUSE);
    expect(s.phase).toBe('paused');
    s = tick(tick(tick(s)));
    expect(s.game).toBe(before);
    s = handle(s, PAUSE);
    expect(s.phase).toBe('playing');
    s = tick(s);
    expect(s.game.step).toBe(before.step + 1);
  });

  it('flaps while paused are ignored', () => {
    let s = tick(handle(createSession({ seed: 1 }), FLAP));
    s = handle(s, PAUSE);
    s = handle(handle(s, FLAP), FLAP);
    expect(s.phase).toBe('paused');
    s = tick(handle(s, PAUSE));
    // Step 1 -> 2 has no flap, so gravity applies instead of the flap velocity.
    expect(s.game.bird.vy).toBeCloseTo(FLAP_VELOCITY + 0.35);
    expect(s.flaps).toEqual([0]);
  });

  it('death ends the game', () => {
    const over = tickUntilOver(handle(createSession({ seed: 1 }), FLAP));
    expect(over.phase).toBe('over');
    expect(over.game.death?.cause).toBe('ground');
    expect(over.game.death?.step).toBe(over.game.step);
    const later = tick(tick(over));
    expect(later).toBe(over);
  });

  it('flap after game over restarts', () => {
    const over = tickUntilOver(handle(createSession({ seed: 1 }), FLAP));
    const again = handle(over, FLAP);
    expect(again.phase).toBe('ready');
    expect(again.game.step).toBe(0);
    expect(again.game.death).toBeNull();
    expect(again.flaps).toEqual([]);
    expect(again.seed).not.toBe(over.seed);
  });

  it('scripted session matches engine replay', () => {
    const over = tickUntilOver(createSession({ seed: SCRIPT_SEED, script: SCRIPT_FLAPS }));
    const expected = replay(SCRIPT_SEED, SCRIPT_FLAPS);
    const snap = snapshot(over);
    expect(snap.phase).toBe('over');
    expect(snap.score).toBe(expected.score);
    expect(snap.step).toBe(expected.deathStep);
    expect(snap.death).toEqual({ step: expected.deathStep, cause: expected.deathCause });
    expect(snap.flapCount).toBe(expected.flapCount);
    // Lock the known regression values too.
    expect([snap.score, snap.step, snap.death?.cause]).toEqual([2, 296, 'ground']);
  });

  it('scripted session ignores player flaps', () => {
    let s = createSession({ seed: SCRIPT_SEED, script: SCRIPT_FLAPS });
    s = tick(s);
    expect(s.phase).toBe('playing');
    s = tick(handle(s, FLAP));
    expect(s.flaps).toEqual([]);
    expect(snapshot(tickUntilOver(s)).score).toBe(2);
  });

  it('pause does nothing in ready or over', () => {
    const ready = createSession({ seed: 1 });
    expect(handle(ready, PAUSE)).toBe(ready);
    const over = tickUntilOver(handle(ready, FLAP));
    expect(handle(over, PAUSE)).toBe(over);
  });

  it('restart action starts a new ready game from any phase', () => {
    const playing = tick(handle(createSession({ seed: 1 }), FLAP));
    const again = handle(playing, { type: 'restart' });
    expect(again.phase).toBe('ready');
    expect(again.game.step).toBe(0);
  });

  it('restart uses nextSeed for the new game', () => {
    const over = tickUntilOver(handle(createSession({ seed: 1, nextSeed: () => 777 }), FLAP));
    expect(handle(over, FLAP).seed).toBe(777);
  });

  it('scripted restart keeps the seed so the run repeats', () => {
    const over = tickUntilOver(createSession({ seed: SCRIPT_SEED, script: SCRIPT_FLAPS }));
    const again = handle(over, FLAP);
    expect(again.phase).toBe('ready');
    expect(again.seed).toBe(SCRIPT_SEED);
    expect(snapshot(tickUntilOver(again)).step).toBe(296);
  });
});
