// The "Last game" card: waits for the server to finish the latest ended game, then
// fetches its summary. No DOM here; the page wires it to the card and the recorder.
import type { GameSummary } from '@flappy/engine';
import { summaryLines, type SummaryResult } from './summary.ts';

/** If no result has come this long after game over, fetch the summary anyway. */
export const SUMMARY_FALLBACK_MS = 5000;

export type LastGameState =
  | { kind: 'none' }
  | { kind: 'unrecorded' }
  | { kind: 'waiting'; gameId: string }
  | { kind: 'shown'; gameId: string; summary: GameSummary }
  | { kind: 'no-result'; gameId: string }
  | { kind: 'error'; gameId: string };

export interface LastGameOptions {
  fetchSummary: (gameId: string) => Promise<SummaryResult>;
  /** Runs `fn` after `ms`; returns a function that cancels it. */
  setTimer: (fn: () => void, ms: number) => () => void;
  onChange: (state: LastGameState) => void;
  fallbackMs?: number;
}

export interface LastGame {
  state(): LastGameState;
  /** A game ended; `null` means it was not recorded. */
  gameOver(gameId: string | null): void;
  /** The server sent its result for a game. */
  result(gameId: string): void;
}

export function createLastGame(options: LastGameOptions): LastGame {
  const { fetchSummary, setTimer, onChange } = options;
  const fallbackMs = options.fallbackMs ?? SUMMARY_FALLBACK_MS;

  let current: LastGameState = { kind: 'none' };
  /** The latest ended recorded game (null when none, or the latest was unrecorded). */
  let latest: string | null = null;
  let cancelTimer: (() => void) | null = null;
  /** Set once the server's result for `latest` has come (each game fetches on it once). */
  let resultSeen = false;
  /** A summary fetch for `latest` is out. */
  let inFlight = false;
  /** The result came while a fetch was out: if that fetch says 'pending', fetch again. */
  let retryIfPending = false;
  /** The last result for a game other than `latest` (it may come before its game over). */
  let otherResult: string | null = null;

  function set(next: LastGameState): void {
    current = next;
    onChange(next);
  }

  function stopTimer(): void {
    cancelTimer?.();
    cancelTimer = null;
  }

  function load(gameId: string): void {
    inFlight = true;
    void fetchSummary(gameId).then((r) => {
      // Another game has ended since: this answer is out of date.
      if (latest !== gameId) return;
      inFlight = false;
      if (r.ok) set({ kind: 'shown', gameId, summary: r.summary });
      else if (r.reason === 'no-result') set({ kind: 'no-result', gameId });
      else if (r.reason === 'error') set({ kind: 'error', gameId });
      else if (retryIfPending) {
        // 'pending' from a fetch sent before the result came: ask again.
        retryIfPending = false;
        load(gameId);
      }
      // Other 'pending': not complete yet; the game's result will trigger a fetch.
    });
  }

  function onResult(gameId: string): void {
    if (resultSeen) return;
    resultSeen = true;
    stopTimer();
    if (inFlight) retryIfPending = true;
    else load(gameId);
  }

  return {
    state: () => current,
    gameOver(gameId) {
      stopTimer();
      latest = gameId;
      resultSeen = false;
      inFlight = false;
      retryIfPending = false;
      if (gameId === null) {
        set({ kind: 'unrecorded' });
        return;
      }
      set({ kind: 'waiting', gameId });
      if (otherResult === gameId) {
        otherResult = null;
        onResult(gameId);
        return;
      }
      cancelTimer = setTimer(() => {
        cancelTimer = null;
        if (latest === gameId && !resultSeen && !inFlight) load(gameId);
      }, fallbackMs);
    },
    result(gameId) {
      if (gameId === latest) onResult(gameId);
      else otherResult = gameId;
    },
  };
}

/** The card's lines for a state. */
export function lastGameView(state: LastGameState): string[] {
  switch (state.kind) {
    case 'none':
      return ['No game yet - flap to start'];
    case 'unrecorded':
      return ['This game was not recorded'];
    case 'waiting':
      return ['Waiting for the server…'];
    case 'shown':
      return summaryLines(state.summary);
    case 'no-result':
      return ['The server could not score this game'];
    case 'error':
      return ['Could not load the summary'];
  }
}
