import type { PlayerStats } from '@flappy/engine';
import type { FetchFn } from './api.ts';
import { causeText, formatPercent, formatRatio, formatSeconds } from './format.ts';

export type StatsResult =
  | { ok: true; stats: PlayerStats }
  | { ok: false; reason: 'unknown-player' | 'error' };

export interface StatsView {
  headline: string[];
  /** Oldest first, games with no flaps left out. */
  scorePerFlap: number[];
  /** Wasted share as 0..100, oldest first, games with no flaps left out. */
  wastedPercent: number[];
  /** Newest first: date, score, flaps, score per flap, wasted, time between flaps, death. */
  rows: string[][];
}

export const NO_GAMES_TEXT = 'No complete games yet - play a game first';

/** GET the player's trend. Never throws. */
export async function fetchStats(fetchFn: FetchFn, playerId: string): Promise<StatsResult> {
  try {
    const res = await fetchFn(`/api/players/${encodeURIComponent(playerId)}/stats`);
    if (res.status === 404) return { ok: false, reason: 'unknown-player' };
    if (!res.ok) return { ok: false, reason: 'error' };
    return { ok: true, stats: (await res.json()) as PlayerStats };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

/** Turns the server's stats into the text and numbers the page shows. */
export function statsView(stats: PlayerStats): StatsView {
  const { games, totals } = stats;
  if (games.length === 0) return { headline: [NO_GAMES_TEXT], scorePerFlap: [], wastedPercent: [], rows: [] };

  const deaths = totals.deathCauses;
  const headline = [
    `Games: ${games.length}`,
    `Average score: ${formatRatio(totals.averageScore)}`,
    `Score per flap: ${formatRatio(totals.averageScorePerFlap)}`,
    `Wasted flaps: ${formatPercent(totals.wastedShare)}`,
    `Deaths: ${deaths.ground} ground, ${deaths['pipe-top']} top pipe, ${deaths['pipe-bottom']} bottom pipe`,
  ];

  const scorePerFlap: number[] = [];
  const wastedPercent: number[] = [];
  for (const g of games) {
    if (g.scorePerFlap !== null) scorePerFlap.push(g.scorePerFlap);
    if (g.wastedShare !== null) wastedPercent.push(g.wastedShare * 100);
  }

  const rows = [...games].reverse().map((g) => [
    new Date(g.playedAt).toLocaleString(),
    String(g.score),
    String(g.flaps),
    formatRatio(g.scorePerFlap),
    `${g.wastedFlaps} (${formatPercent(g.wastedShare)})`,
    g.averageFlapGapMs === null ? '-' : `${formatSeconds(g.averageFlapGapMs)} s`,
    causeText(g.deathCause),
  ]);

  return { headline, scorePerFlap, wastedPercent, rows };
}
