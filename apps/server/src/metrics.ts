// Stats metrics, computed on read by replaying stored events with the engine.
// Nothing here is stored: tuning the wasted-flap rule changes every past game.
import {
  createGame,
  PIPE_GAP,
  step,
  stepsToMs,
  type DeathCause,
  type FlapGapStats,
  type GameState,
  type GameSummary,
  type PlayerStats,
  type TrendGame,
  type WasteReason,
} from "@flappy/engine";
import { getGame, getGameEvents, getPlayer, type Db, type GameRecord, type StoredEvent } from "./db.ts";

/** The bird just before one applied flap, and where that flap would take it. */
export interface FlapPoint {
  /** Step the flap is applied on (state `step` turns into `step + 1`). */
  step: number;
  /** Bird y and vy in the state the flap is applied to. */
  y: number;
  vy: number;
  /** Highest point (smallest y) the bird reaches after this flap with no further flap. */
  peakY: number;
  /** Gap edges of the first unscored pipe in the pre-flap state (null if none). */
  gapTop: number | null;
  gapBottom: number | null;
}

/** Most counted games in a player's trend (the newest ones). */
export const MAX_TREND_GAMES = 100;

/** Highest point after a flap: steps a copy with no flap until the bird stops rising or dies. */
function peakAfterFlap(before: GameState): number {
  let state = step(before, { flap: true });
  let peak = state.bird.y;
  while (state.death === null && state.bird.vy < 0) {
    state = step(state, { flap: false });
    peak = Math.min(peak, state.bird.y);
  }
  return peak;
}

/**
 * Replays a game (same loop as the engine's `replay`) and records one point per
 * applied flap. Flaps listed at or after death are not points.
 */
export function traceFlaps(
  seed: number,
  flapSteps: number[],
  maxSteps: number,
): { points: FlapPoint[]; final: GameState } {
  const flaps = new Set(flapSteps);
  const points: FlapPoint[] = [];
  let state = createGame(seed);
  while (state.death === null && state.step < maxSteps) {
    const flap = flaps.has(state.step);
    if (flap) {
      const next = state.pipes.find((pipe) => !pipe.scored);
      points.push({
        step: state.step,
        y: state.bird.y,
        vy: state.bird.vy,
        peakY: peakAfterFlap(state),
        gapTop: next ? next.gapY - PIPE_GAP / 2 : null,
        gapBottom: next ? next.gapY + PIPE_GAP / 2 : null,
      });
    }
    state = step(state, { flap });
  }
  return { points, final: state };
}

/**
 * The wasted-flap rule (see docs/decisions.md). The only place it lives.
 * `rising`: the bird was already going up. `overshoot`: the flap alone lifts
 * the bird above the top of the next pipe gap. Rising is checked first.
 */
export function wastedFlapReason(point: FlapPoint): WasteReason | null {
  if (point.vy < 0) return "rising";
  if (point.gapTop !== null && point.peakY < point.gapTop) return "overshoot";
  return null;
}

function flapSteps(events: readonly StoredEvent[]): number[] {
  const steps = new Set(events.filter((event) => event.type === "flap").map((event) => event.step));
  return [...steps].sort((a, b) => a - b);
}

function flapGaps(steps: number[]): FlapGapStats | null {
  if (steps.length < 2) return null;
  const gaps = steps.slice(1).map((s, i) => s - steps[i]!);
  return {
    average: stepsToMs(gaps.reduce((sum, gap) => sum + gap, 0)) / gaps.length,
    shortest: stepsToMs(Math.min(...gaps)),
    longest: stepsToMs(Math.max(...gaps)),
  };
}

/**
 * The server's summary of a finished game, from a fresh replay of its events.
 * Null unless the game is complete with a server death. Client claims are never used.
 */
export function summarizeGame(game: GameRecord, events: StoredEvent[]): GameSummary | null {
  if (game.status !== "complete" || game.deathStep === null) return null;
  const { points, final } = traceFlaps(game.seed, flapSteps(events), game.deathStep + 1);
  if (final.death === null) return null;

  const reasons = points.map(wastedFlapReason);
  const rising = reasons.filter((reason) => reason === "rising").length;
  const overshoot = reasons.filter((reason) => reason === "overshoot").length;
  const flaps = points.length;
  const presses = events.filter((event) => event.type === "flap").length;
  const mismatch = game.mismatch ?? false;
  return {
    gameId: game.id,
    playedAt: game.lastEventAt ?? game.createdAt,
    seedSource: game.seedSource,
    score: final.score,
    deathStep: final.death.step,
    deathCause: final.death.cause,
    durationMs: stepsToMs(final.death.step),
    flaps,
    presses,
    extraPresses: presses - flaps,
    scorePerFlap: flaps === 0 ? null : final.score / flaps,
    wastedFlaps: rising + overshoot,
    wastedRising: rising,
    wastedOvershoot: overshoot,
    flapGapMs: flapGaps(points.map((point) => point.step)),
    mismatch,
    countsInStats: !mismatch,
  };
}

function trendGame(summary: GameSummary): TrendGame {
  return {
    gameId: summary.gameId,
    playedAt: summary.playedAt,
    score: summary.score,
    flaps: summary.flaps,
    scorePerFlap: summary.scorePerFlap,
    wastedFlaps: summary.wastedFlaps,
    wastedShare: summary.flaps === 0 ? null : summary.wastedFlaps / summary.flaps,
    averageFlapGapMs: summary.flapGapMs?.average ?? null,
    deathCause: summary.deathCause,
  };
}

/** Ids of the player's newest counted games, oldest first. */
function countedGameIds(db: Db, playerId: string): string[] {
  const rows = db
    .prepare(
      `SELECT id FROM games
       WHERE player_id = ? AND status = 'complete' AND death_step IS NOT NULL AND mismatch = 0
       ORDER BY last_event_at DESC, id DESC LIMIT ?`,
    )
    .all(playerId, MAX_TREND_GAMES) as { id: string }[];
  return rows.map((row) => row.id).reverse();
}

/** A player's trend over their counted games; undefined for an unknown player. */
export function playerStats(db: Db, playerId: string): PlayerStats | undefined {
  const player = getPlayer(db, playerId);
  if (!player) return undefined;

  const games: TrendGame[] = [];
  for (const id of countedGameIds(db, playerId)) {
    const game = getGame(db, id);
    const summary = game ? summarizeGame(game, getGameEvents(db, id)) : null;
    if (summary) games.push(trendGame(summary));
  }

  const deathCauses: Record<DeathCause, number> = { ground: 0, "pipe-top": 0, "pipe-bottom": 0 };
  let score = 0;
  let flaps = 0;
  let wasted = 0;
  for (const game of games) {
    deathCauses[game.deathCause] += 1;
    score += game.score;
    flaps += game.flaps;
    wasted += game.wastedFlaps;
  }
  return {
    playerId: player.id,
    nickname: player.nickname,
    games,
    totals: {
      games: games.length,
      averageScore: games.length === 0 ? null : score / games.length,
      averageScorePerFlap: flaps === 0 ? null : score / flaps,
      wastedShare: flaps === 0 ? null : wasted / flaps,
      deathCauses,
    },
  };
}
