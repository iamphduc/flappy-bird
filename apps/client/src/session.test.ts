import { FLAP_VELOCITY, replay, replayEvents } from '@flappy/engine';
import { describe, expect, it } from 'vitest';
import { assignGame, createSession, handle, snapshot, tick, type Session } from './session.ts';

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

const CLICK = { type: 'flap', source: 'click' } as const;

describe('session recording', () => {
  it('first flap records start then flap at step 0', () => {
    const started = handle(createSession({ seed: 1 }), FLAP);
    expect(started.events).toEqual([{ seq: 0, step: 0, type: 'start' }]);
    const s = tick(started);
    expect(s.events).toEqual([
      { seq: 0, step: 0, type: 'start' },
      { seq: 1, step: 0, type: 'flap', source: 'space' },
    ]);
  });

  it('several presses in one step are all recorded', () => {
    let s = tick(handle(createSession({ seed: 1 }), FLAP));
    s = tick(s);
    const before = s.game;
    s = handle(handle(s, FLAP), CLICK);
    s = tick(s);
    const flaps = s.events.filter((e) => e.type === 'flap').slice(1);
    expect(flaps).toEqual([
      { seq: 2, step: 2, type: 'flap', source: 'space' },
      { seq: 3, step: 2, type: 'flap', source: 'click' },
    ]);
    // The engine still applies a single flap for that step.
    expect(s.game.step).toBe(before.step + 1);
    expect(s.game.bird.vy).toBe(FLAP_VELOCITY);
    expect(s.flaps).toEqual([0, 2]);
  });

  it('pause and resume are recorded', () => {
    let s = tick(tick(tick(handle(createSession({ seed: 1 }), FLAP))));
    s = handle(s, PAUSE);
    s = tick(tick(s));
    s = handle(s, PAUSE);
    s = tick(s);
    s = handle(s, PAUSE);
    expect(s.events.slice(2)).toEqual([
      { seq: 2, step: 3, type: 'pause' },
      { seq: 3, step: 3, type: 'resume' },
      { seq: 4, step: 4, type: 'pause' },
    ]);
  });

  it('presses cleared by pause are not recorded', () => {
    let s = tick(handle(createSession({ seed: 1 }), FLAP));
    s = handle(s, FLAP);
    s = handle(s, PAUSE);
    s = handle(handle(s, CLICK), FLAP);
    s = tick(handle(s, PAUSE));
    expect(s.events.filter((e) => e.type === 'flap')).toEqual([
      { seq: 1, step: 0, type: 'flap', source: 'space' },
    ]);
    expect(s.events.map((e) => e.type)).toEqual(['start', 'flap', 'pause', 'resume']);
    expect(s.flaps).toEqual([0]);
  });

  it('death is recorded', () => {
    const over = tickUntilOver(handle(createSession({ seed: 1 }), FLAP));
    const last = over.events[over.events.length - 1];
    expect(last).toEqual({
      seq: over.events.length - 1,
      step: over.game.death?.step,
      type: 'death',
      cause: over.game.death?.cause,
      score: over.game.score,
    });
    // Flaps in over restart instead of being recorded; ticks in over add nothing.
    expect(tick(over).events).toBe(over.events);
  });

  it('seq numbers are contiguous per game', () => {
    let s = handle(createSession({ seed: 1 }), FLAP);
    s = tick(handle(handle(s, FLAP), CLICK));
    s = tick(handle(s, PAUSE));
    s = handle(s, PAUSE);
    s = assignGame(s, { gameId: 'g-late', seed: 9 });
    s = tickUntilOver(handle(s, FLAP));
    expect(s.events.map((e) => e.seq)).toEqual(s.events.map((_, i) => i));
    expect(s.events.length).toBeGreaterThan(5);

    const recorded = assignGame(createSession({ seed: 1 }), { gameId: 'g1', seed: 5 });
    const played = tick(handle(recorded, FLAP));
    for (const again of [handle(tickUntilOver(played), FLAP), handle(played, { type: 'restart' })]) {
      expect(again.gameId).toBeNull();
      expect(again.events).toEqual([]);
      expect(tick(handle(again, FLAP)).events.map((e) => e.seq)).toEqual([0, 1]);
    }
  });

  it('assignGame only swaps the seed before the game starts', () => {
    const ready = createSession({ seed: 1 });
    expect(ready.gameId).toBeNull();
    const assigned = assignGame(ready, { gameId: 'g1', seed: 1234 });
    expect(assigned.gameId).toBe('g1');
    expect(assigned.seed).toBe(1234);
    expect(assigned.game).toEqual(createSession({ seed: 1234 }).game);
    expect(assigned.phase).toBe('ready');

    const started = handle(ready, FLAP);
    expect(assignGame(started, { gameId: 'g2', seed: 99 })).toBe(started);
    const over = tickUntilOver(started);
    expect(assignGame(over, { gameId: 'g3', seed: 99 })).toBe(over);
  });

  it('recorded events replay to the session result', () => {
    const over = tickUntilOver(createSession({ seed: SCRIPT_SEED, script: SCRIPT_FLAPS }));
    const flaps = over.events.filter((e) => e.type === 'flap');
    expect(flaps).toHaveLength(7);
    expect(flaps.every((e) => e.type === 'flap' && e.source === 'script')).toBe(true);
    expect(flaps.map((e) => e.step)).toEqual(SCRIPT_FLAPS);
    expect(over.events[0]).toEqual({ seq: 0, step: 0, type: 'start' });
    const result = replayEvents(SCRIPT_SEED, over.events);
    expect(result.score).toBe(over.game.score);
    expect(result.deathStep).toBe(over.game.death?.step);
    expect(result.deathCause).toBe(over.game.death?.cause);
    expect(result.pressCount).toBe(7);
  });
});
