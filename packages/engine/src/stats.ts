// Response types for the stats routes, shared by the server and the client.
// Types only: the metrics are computed on the server from the stored events.
import type { DeathCause } from "./game.ts";

/** Why a flap counts as wasted. */
export type WasteReason = "rising" | "overshoot";

/** Milliseconds of game time between consecutive applied flaps. */
export interface FlapGapStats {
  average: number;
  shortest: number;
  longest: number;
}

/** One finished game, from the server replay. */
export interface GameSummary {
  gameId: string;
  /** When the game was last played (the game's last stored event, ms since epoch). */
  playedAt: number;
  seedSource: "server" | "dev";
  score: number;
  deathStep: number;
  deathCause: DeathCause;
  durationMs: number;
  /** Applied flaps (at most one per step, before death). */
  flaps: number;
  /** All flap presses, several per step included. */
  presses: number;
  /** presses - flaps: presses that did nothing to the bird. */
  extraPresses: number;
  /** null when there were no flaps. */
  scorePerFlap: number | null;
  wastedFlaps: number;
  wastedRising: number;
  wastedOvershoot: number;
  /** null with fewer than 2 flaps. */
  flapGapMs: FlapGapStats | null;
  /** The client's claimed result differs from the server replay. */
  mismatch: boolean;
  countsInStats: boolean;
}

/** One point of a player's trend. */
export interface TrendGame {
  gameId: string;
  playedAt: number;
  score: number;
  flaps: number;
  scorePerFlap: number | null;
  wastedFlaps: number;
  /** wastedFlaps / flaps, null with no flaps. */
  wastedShare: number | null;
  averageFlapGapMs: number | null;
  deathCause: DeathCause;
}

export interface PlayerStats {
  playerId: string;
  nickname: string;
  /** Counted games, oldest first. */
  games: TrendGame[];
  totals: {
    games: number;
    averageScore: number | null;
    /** Total score / total flaps. */
    averageScorePerFlap: number | null;
    /** Total wasted flaps / total flaps. */
    wastedShare: number | null;
    deathCauses: Record<DeathCause, number>;
  };
}
