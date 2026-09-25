import type { GameSummary } from '@flappy/engine';
import type { FetchFn } from './api.ts';

export type SummaryResult =
  | { ok: true; summary: GameSummary }
  | { ok: false; reason: 'pending' | 'no-result' | 'error' };

export async function fetchSummary(_fetchFn: FetchFn, _gameId: string): Promise<SummaryResult> {
  throw new Error('not implemented');
}

export function summaryLines(_summary: GameSummary): string[] {
  throw new Error('not implemented');
}
