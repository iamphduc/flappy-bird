import type { GameSummary } from '@flappy/engine';
import { describe, expect, it } from 'vitest';
import { createLastGame, lastGameView, type LastGameState } from './lastGame.ts';
import { summaryLines, type SummaryResult } from './summary.ts';

const SUMMARY: GameSummary = {
  gameId: 'g1',
  playedAt: 1_700_000_000_000,
  seedSource: 'dev',
  score: 2,
  deathStep: 296,
  deathCause: 'ground',
  durationMs: 296000 / 60,
  flaps: 7,
  presses: 7,
  extraPresses: 0,
  scorePerFlap: 2 / 7,
  wastedFlaps: 0,
  wastedRising: 0,
  wastedOvershoot: 0,
  flapGapMs: { average: 622.2, shortest: 550, longest: 650 },
  mismatch: false,
  countsInStats: true,
};

interface Timer {
  fn: () => void;
  ms: number;
  cancelled: boolean;
}

/** A tracker with a fake timer and fetches that the test answers by hand. */
function setup(fallbackMs?: number) {
  const fetches: Array<{ gameId: string; answer: (r: SummaryResult) => Promise<void> }> = [];
  const timers: Timer[] = [];
  const changes: LastGameState[] = [];
  const tracker = createLastGame({
    fetchSummary: (gameId) =>
      new Promise<SummaryResult>((resolve) => {
        fetches.push({
          gameId,
          answer: async (r) => {
            resolve(r);
            // Let the tracker's `.then` run.
            await Promise.resolve();
            await Promise.resolve();
          },
        });
      }),
    setTimer: (fn, ms) => {
      const timer: Timer = { fn, ms, cancelled: false };
      timers.push(timer);
      return () => {
        timer.cancelled = true;
      };
    },
    onChange: (state) => changes.push(state),
    ...(fallbackMs === undefined ? {} : { fallbackMs }),
  });
  /** Fires every live timer (as if time ran on past them). */
  const runTimers = () => {
    for (const t of timers) {
      if (!t.cancelled) {
        t.cancelled = true;
        t.fn();
      }
    }
  };
  return { tracker, fetches, timers, changes, runTimers };
}

describe('lastGame tracker', () => {
  it('starts empty and marks unrecorded games', () => {
    const { tracker, fetches, timers } = setup();
    expect(tracker.state()).toEqual({ kind: 'none' });
    tracker.gameOver(null);
    expect(tracker.state()).toEqual({ kind: 'unrecorded' });
    expect(fetches).toHaveLength(0);
    expect(timers).toHaveLength(0);
  });

  it('fetches the summary when the game\'s result arrives', async () => {
    const { tracker, fetches } = setup();
    tracker.gameOver('g1');
    expect(tracker.state()).toEqual({ kind: 'waiting', gameId: 'g1' });
    expect(fetches).toHaveLength(0);
    tracker.result('g1');
    expect(fetches.map((f) => f.gameId)).toEqual(['g1']);
    await fetches[0]!.answer({ ok: true, summary: SUMMARY });
    expect(tracker.state()).toEqual({ kind: 'shown', gameId: 'g1', summary: SUMMARY });
    tracker.result('g1');
    expect(fetches).toHaveLength(1);
  });

  it('uses a result that came before game over', () => {
    const { tracker, fetches, timers } = setup();
    tracker.result('g1');
    expect(fetches).toHaveLength(0);
    tracker.gameOver('g1');
    expect(tracker.state()).toEqual({ kind: 'waiting', gameId: 'g1' });
    expect(fetches.map((f) => f.gameId)).toEqual(['g1']);
    expect(timers.filter((t) => !t.cancelled)).toHaveLength(0);
  });

  it('fetches anyway when no result comes', async () => {
    const { tracker, fetches, timers, runTimers } = setup();
    tracker.gameOver('g1');
    expect(timers).toHaveLength(1);
    expect(timers[0]!.ms).toBe(5000);
    expect(fetches).toHaveLength(0);
    runTimers();
    expect(fetches.map((f) => f.gameId)).toEqual(['g1']);
    tracker.result('g1');
    expect(fetches).toHaveLength(1);
    await fetches[0]!.answer({ ok: true, summary: SUMMARY });
    expect(tracker.state()).toEqual({ kind: 'shown', gameId: 'g1', summary: SUMMARY });

    // A custom fallbackMs is used.
    const custom = setup(1234);
    custom.tracker.gameOver('g9');
    expect(custom.timers[0]!.ms).toBe(1234);
  });

  it('cancels the fallback timer when the result comes', () => {
    const { tracker, fetches, timers, runTimers } = setup();
    tracker.gameOver('g1');
    tracker.result('g1');
    expect(timers[0]!.cancelled).toBe(true);
    runTimers();
    expect(fetches).toHaveLength(1);
  });

  it('maps fetch outcomes', async () => {
    const pending = setup();
    pending.tracker.gameOver('g1');
    pending.runTimers();
    await pending.fetches[0]!.answer({ ok: false, reason: 'pending' });
    expect(pending.tracker.state()).toEqual({ kind: 'waiting', gameId: 'g1' });
    pending.tracker.result('g1');
    expect(pending.fetches).toHaveLength(2);
    await pending.fetches[1]!.answer({ ok: true, summary: SUMMARY });
    expect(pending.tracker.state()).toEqual({ kind: 'shown', gameId: 'g1', summary: SUMMARY });

    const noResult = setup();
    noResult.tracker.gameOver('g1');
    noResult.tracker.result('g1');
    await noResult.fetches[0]!.answer({ ok: false, reason: 'no-result' });
    expect(noResult.tracker.state()).toEqual({ kind: 'no-result', gameId: 'g1' });

    const error = setup();
    error.tracker.gameOver('g1');
    error.tracker.result('g1');
    await error.fetches[0]!.answer({ ok: false, reason: 'error' });
    expect(error.tracker.state()).toEqual({ kind: 'error', gameId: 'g1' });
  });

  it('ignores older games', async () => {
    const { tracker, fetches, timers, runTimers } = setup();
    tracker.gameOver('g1');
    runTimers();
    expect(fetches).toHaveLength(1);
    tracker.gameOver('g2');
    expect(tracker.state()).toEqual({ kind: 'waiting', gameId: 'g2' });
    await fetches[0]!.answer({ ok: true, summary: SUMMARY });
    expect(tracker.state()).toEqual({ kind: 'waiting', gameId: 'g2' });
    tracker.result('g1');
    expect(fetches).toHaveLength(1);

    // g1's timer is cancelled when g2 ends before it fires.
    const second = setup();
    second.tracker.gameOver('g1');
    second.tracker.gameOver('g2');
    expect(second.timers[0]!.cancelled).toBe(true);
    // Firing g1's stale callback anyway does not fetch g1.
    second.timers[0]!.fn();
    expect(second.fetches.map((f) => f.gameId)).not.toContain('g1');

    // gameOver(null) also drops the older game.
    const third = setup();
    third.tracker.gameOver('g1');
    third.tracker.result('g1');
    third.tracker.gameOver(null);
    await third.fetches[0]!.answer({ ok: true, summary: SUMMARY });
    expect(third.tracker.state()).toEqual({ kind: 'unrecorded' });
    expect(timers[0]!.cancelled).toBe(true);
  });

  it('reports every change', async () => {
    const { tracker, fetches, changes } = setup();
    tracker.gameOver('g1');
    tracker.result('g1');
    await fetches[0]!.answer({ ok: true, summary: SUMMARY });
    expect(changes).toEqual([
      { kind: 'waiting', gameId: 'g1' },
      { kind: 'shown', gameId: 'g1', summary: SUMMARY },
    ]);
    tracker.gameOver(null);
    expect(changes.at(-1)).toEqual({ kind: 'unrecorded' });
    expect(changes).toHaveLength(3);
  });

  it('keeps the last game shown until the next game over', async () => {
    const { tracker, fetches } = setup();
    tracker.gameOver('g1');
    tracker.result('g1');
    await fetches[0]!.answer({ ok: true, summary: SUMMARY });
    // A result for a game still being played is only remembered.
    tracker.result('g2');
    expect(tracker.state()).toEqual({ kind: 'shown', gameId: 'g1', summary: SUMMARY });
    expect(fetches).toHaveLength(1);
    tracker.gameOver('g2');
    expect(fetches.map((f) => f.gameId)).toEqual(['g1', 'g2']);
  });
});

describe('lastGameView', () => {
  it('lastGameView lines', () => {
    expect(lastGameView({ kind: 'none' })).toEqual(['No game yet - flap to start']);
    expect(lastGameView({ kind: 'unrecorded' })).toEqual(['This game was not recorded']);
    expect(lastGameView({ kind: 'waiting', gameId: 'g1' })).toEqual(['Waiting for the server…']);
    expect(lastGameView({ kind: 'no-result', gameId: 'g1' })).toEqual(['The server could not score this game']);
    expect(lastGameView({ kind: 'error', gameId: 'g1' })).toEqual(['Could not load the summary']);
    expect(lastGameView({ kind: 'shown', gameId: 'g1', summary: SUMMARY })).toEqual(summaryLines(SUMMARY));
  });
});
