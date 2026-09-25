// Stats metrics, computed on read by replaying stored events with the engine.
import type { GameState, GameSummary, PlayerStats, WasteReason } from "@flappy/engine";
import type { Db, GameRecord, StoredEvent } from "./db.ts";

export interface FlapPoint {
  step: number;
  y: number;
  vy: number;
  peakY: number;
  gapTop: number | null;
  gapBottom: number | null;
}

export const MAX_TREND_GAMES = 100;

export function traceFlaps(_seed: number, _flapSteps: number[], _maxSteps: number): { points: FlapPoint[]; final: GameState } {
  throw new Error("not implemented");
}

export function wastedFlapReason(_point: FlapPoint): WasteReason | null {
  throw new Error("not implemented");
}

export function summarizeGame(_game: GameRecord, _events: StoredEvent[]): GameSummary | null {
  throw new Error("not implemented");
}

export function playerStats(_db: Db, _playerId: string): PlayerStats | undefined {
  throw new Error("not implemented");
}
