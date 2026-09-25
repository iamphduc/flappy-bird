import { describe, expect, it, vi } from 'vitest';
import type { PlayerStats, TrendGame } from '@flappy/engine';
import type { FetchFn } from './api.ts';
import { fetchStats, statsView } from './stats.ts';

function reply(status: number, body?: unknown): FetchFn {
  return vi.fn(async () => new Response(body === undefined ? null : JSON.stringify(body), { status }));
}

function game(overrides: Partial<TrendGame>): TrendGame {
  return {
    gameId: 'g',
    playedAt: 1_700_000_000_000,
    score: 0,
    flaps: 0,
    scorePerFlap: null,
    wastedFlaps: 0,
    wastedShare: null,
    averageFlapGapMs: null,
    deathCause: 'ground',
    ...overrides,
  };
}

const older = game({
  gameId: 'g1',
  playedAt: 1_700_000_000_000,
  score: 2,
  flaps: 7,
  scorePerFlap: 2 / 7,
  wastedFlaps: 0,
  wastedShare: 0,
  averageFlapGapMs: 622.2222,
  deathCause: 'ground',
});
const newer = game({
  gameId: 'g2',
  playedAt: 1_700_000_060_000,
  score: 0,
  flaps: 3,
  scorePerFlap: 0,
  wastedFlaps: 2,
  wastedShare: 2 / 3,
  averageFlapGapMs: 225,
  deathCause: 'pipe-top',
});

function stats(games: TrendGame[], totals: Partial<PlayerStats['totals']> = {}): PlayerStats {
  return {
    playerId: 'p1',
    nickname: 'Ann',
    games,
    totals: {
      games: games.length,
      averageScore: null,
      averageScorePerFlap: null,
      wastedShare: null,
      deathCauses: { ground: 0, 'pipe-top': 0, 'pipe-bottom': 0 },
      ...totals,
    },
  };
}

describe('stats', () => {
  it('fetchStats maps server answers', async () => {
    const body = stats([older]);
    const ok = reply(200, body);
    expect(await fetchStats(ok, 'p 1')).toEqual({ ok: true, stats: body });
    expect(vi.mocked(ok).mock.calls[0]![0]).toBe('/api/players/p%201/stats');

    expect(await fetchStats(reply(404, { error: 'unknown player' }), 'p1')).toEqual({
      ok: false,
      reason: 'unknown-player',
    });
    expect(await fetchStats(reply(500), 'p1')).toEqual({ ok: false, reason: 'error' });
    const rejected: FetchFn = vi.fn(async () => {
      throw new Error('network down');
    });
    expect(await fetchStats(rejected, 'p1')).toEqual({ ok: false, reason: 'error' });
    expect(await fetchStats(reply(200), 'p1')).toEqual({ ok: false, reason: 'error' });
  });

  it('statsView builds the headline and rows', () => {
    const view = statsView(
      stats([older, newer], {
        averageScore: 1,
        averageScorePerFlap: 0.2,
        wastedShare: 0.2,
        deathCauses: { ground: 1, 'pipe-top': 1, 'pipe-bottom': 0 },
      }),
    );
    expect(view.headline).toEqual([
      'Games: 2',
      'Average score: 1.00',
      'Score per flap: 0.20',
      'Wasted flaps: 20%',
      'Deaths: 1 ground, 1 top pipe, 0 bottom pipe',
    ]);
    expect(view.rows).toEqual([
      [new Date(newer.playedAt).toLocaleString(), '0', '3', '0.00', '2 (67%)', '0.23 s', 'Hit the top pipe'],
      [new Date(older.playedAt).toLocaleString(), '2', '7', '0.29', '0 (0%)', '0.62 s', 'Hit the ground'],
    ]);
  });

  it('statsView series skip games with no flaps', () => {
    const noFlaps = game({ gameId: 'g0', playedAt: 1_700_000_030_000, deathCause: 'pipe-bottom' });
    const view = statsView(stats([older, noFlaps, newer]));
    expect(view.scorePerFlap).toEqual([2 / 7, 0]);
    expect(view.wastedPercent).toEqual([0, (2 / 3) * 100]);
    expect(view.rows).toHaveLength(3);
    expect(view.rows[1]).toEqual([
      new Date(noFlaps.playedAt).toLocaleString(),
      '0',
      '0',
      '-',
      '0 (-)',
      '-',
      'Hit the bottom pipe',
    ]);
  });

  it('statsView with no games', () => {
    expect(statsView(stats([]))).toEqual({
      headline: ['No complete games yet - play a game first'],
      scorePerFlap: [],
      wastedPercent: [],
      rows: [],
    });
  });
});
