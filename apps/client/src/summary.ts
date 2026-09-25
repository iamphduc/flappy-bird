// The game-over summary: fetched from the server, turned into the panel's lines.
// Every number shown comes from the server's replay, never from the client session.
import type { GameSummary } from '@flappy/engine';
import type { FetchFn } from './api.ts';
import { causeText, formatRatio, formatSeconds } from './format.ts';

export type SummaryResult =
  | { ok: true; summary: GameSummary }
  | { ok: false; reason: 'pending' | 'no-result' | 'error' };

/** GETs the server summary of a game. Never throws: failures come back as a reason. */
export async function fetchSummary(fetchFn: FetchFn, gameId: string): Promise<SummaryResult> {
  try {
    const res = await fetchFn(`/api/games/${encodeURIComponent(gameId)}/summary`);
    if (res.ok) return { ok: true, summary: (await res.json()) as GameSummary };
    if (res.status === 409) {
      const { error } = (await res.json()) as { error?: unknown };
      if (error === 'not-complete') return { ok: false, reason: 'pending' };
      if (error === 'no-server-result') return { ok: false, reason: 'no-result' };
    }
  } catch {
    // Network error or a body that is not JSON.
  }
  return { ok: false, reason: 'error' };
}

/** The panel's lines for a summary. */
export function summaryLines(summary: GameSummary): string[] {
  const { flaps, presses, flapGapMs } = summary;
  const lines = [
    `Score: ${summary.score}`,
    presses > flaps ? `Flaps: ${flaps} (${presses} presses)` : `Flaps: ${flaps}`,
    `Score per flap: ${formatRatio(summary.scorePerFlap)}`,
    flaps === 0
      ? 'Wasted flaps: 0'
      : `Wasted flaps: ${summary.wastedFlaps} of ${flaps} (${summary.wastedRising} while rising, ${summary.wastedOvershoot} too high)`,
    flapGapMs === null
      ? 'Time between flaps: -'
      : `Time between flaps: ${formatSeconds(flapGapMs.average)} s on average (${formatSeconds(flapGapMs.shortest)} to ${formatSeconds(flapGapMs.longest)} s)`,
    `Died: ${causeText(summary.deathCause)}`,
  ];
  if (summary.mismatch) lines.push('Not counted in your stats: the server replay differs from the game');
  return lines;
}
