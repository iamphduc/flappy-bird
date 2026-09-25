import type { DeathCause } from '@flappy/engine';

const CAUSE_TEXT: Record<DeathCause, string> = {
  ground: 'Hit the ground',
  'pipe-top': 'Hit the top pipe',
  'pipe-bottom': 'Hit the bottom pipe',
};

/** Milliseconds as seconds with 2 decimals: 622.2 -> '0.62'. */
export function formatSeconds(ms: number): string {
  return (ms / 1000).toFixed(2);
}

/** A ratio with 2 decimals, or '-' when there is none. */
export function formatRatio(x: number | null): string {
  return x === null ? '-' : x.toFixed(2);
}

/** A share (0..1) as a whole percent: 0.286 -> '29%', or '-' when there is none. */
export function formatPercent(share: number | null): string {
  return share === null ? '-' : `${Math.round(share * 100)}%`;
}

/** What killed the bird, in words. */
export function causeText(cause: DeathCause): string {
  return CAUSE_TEXT[cause];
}
