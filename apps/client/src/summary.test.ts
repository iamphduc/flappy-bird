import type { GameSummary } from '@flappy/engine';
import { describe, expect, it, vi } from 'vitest';
import type { FetchFn } from './api.ts';
import { fetchSummary, summaryLines } from './summary.ts';

function reply(status: number, body?: unknown): FetchFn {
  return vi.fn(async () => new Response(body === undefined ? null : JSON.stringify(body), { status }));
}

const SUMMARY: GameSummary = {
  gameId: 'g1',
  playedAt: 1_700_000_000_000,
  seedSource: 'dev',
  score: 2,
  deathStep: 296,
  deathCause: 'ground',
  durationMs: 296000 / 60,
  flaps: 7,
  presses: 8,
  extraPresses: 1,
  scorePerFlap: 2 / 7,
  wastedFlaps: 1,
  wastedRising: 1,
  wastedOvershoot: 0,
  flapGapMs: { average: 622.2, shortest: 550, longest: 650 },
  mismatch: false,
  countsInStats: true,
};

describe('summary', () => {
  it('fetchSummary returns the server summary', async () => {
    const fetchFn = reply(200, SUMMARY);
    expect(await fetchSummary(fetchFn, 'a b/c')).toEqual({ ok: true, summary: SUMMARY });
    const [url, init] = vi.mocked(fetchFn).mock.calls[0]!;
    expect(url).toBe('/api/games/a%20b%2Fc/summary');
    expect(init?.method ?? 'GET').toBe('GET');
  });

  it('fetchSummary maps 409 answers', async () => {
    expect(await fetchSummary(reply(409, { error: 'not-complete' }), 'g1')).toEqual({ ok: false, reason: 'pending' });
    expect(await fetchSummary(reply(409, { error: 'no-server-result' }), 'g1')).toEqual({
      ok: false,
      reason: 'no-result',
    });
  });

  it('fetchSummary never throws', async () => {
    const rejected: FetchFn = vi.fn(async () => {
      throw new TypeError('network down');
    });
    expect(await fetchSummary(rejected, 'g1')).toEqual({ ok: false, reason: 'error' });
    expect(await fetchSummary(reply(500, { error: 'boom' }), 'g1')).toEqual({ ok: false, reason: 'error' });
    expect(await fetchSummary(reply(404, { error: 'unknown game' }), 'g1')).toEqual({ ok: false, reason: 'error' });
    // A 409 with an unknown or unreadable body is not a known answer.
    expect(await fetchSummary(reply(409, { error: 'other' }), 'g1')).toEqual({ ok: false, reason: 'error' });
    const badJson: FetchFn = vi.fn(async () => new Response('{not json', { status: 200 }));
    expect(await fetchSummary(badJson, 'g1')).toEqual({ ok: false, reason: 'error' });
  });

  it('summaryLines formats a summary', () => {
    expect(summaryLines(SUMMARY)).toEqual([
      'Score: 2',
      'Flaps: 7 (8 presses)',
      'Score per flap: 0.29',
      'Wasted flaps: 1 of 7 (1 while rising, 0 too high)',
      'Time between flaps: 0.62 s on average (0.55 to 0.65 s)',
      'Died: Hit the ground',
    ]);
    // No extra presses: no presses note.
    expect(summaryLines({ ...SUMMARY, presses: 7, extraPresses: 0 })[1]).toBe('Flaps: 7');
  });

  it('summaryLines handles no flaps and mismatch', () => {
    const none: GameSummary = {
      ...SUMMARY,
      score: 0,
      deathCause: 'pipe-top',
      flaps: 0,
      presses: 0,
      extraPresses: 0,
      scorePerFlap: null,
      wastedFlaps: 0,
      wastedRising: 0,
      wastedOvershoot: 0,
      flapGapMs: null,
    };
    expect(summaryLines(none)).toEqual([
      'Score: 0',
      'Flaps: 0',
      'Score per flap: -',
      'Wasted flaps: 0',
      'Time between flaps: -',
      'Died: Hit the top pipe',
    ]);
    const lines = summaryLines({ ...SUMMARY, mismatch: true, countsInStats: false });
    expect(lines).toHaveLength(7);
    expect(lines[6]).toBe('Not counted in your stats: the server replay differs from the game');
  });
});
