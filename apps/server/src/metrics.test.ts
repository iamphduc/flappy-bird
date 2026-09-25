import { describe, expect, it } from "vitest";
import { createGame, replay, step, stepsToMs, type GameEvent, type GameState } from "@flappy/engine";
import { getGame, getGameEvents, insertGame, insertPlayer, openDb, type Db } from "./db.ts";
import { ingestEvents } from "./ingest.ts";
import {
  MAX_TREND_GAMES,
  playerStats,
  summarizeGame,
  traceFlaps,
  wastedFlapReason,
  type FlapPoint,
} from "./metrics.ts";

const LOCKED_FLAPS = [13, 52, 90, 128, 166, 199, 237];
/** Seed 42, flaps every 5 steps from 0: dies on the top pipe at step 153 (31 applied flaps). */
const PIPE_TOP_FLAPS = Array.from({ length: 40 }, (_, i) => i * 5);

interface RunOptions {
  seed?: number;
  flaps?: number[];
  /** Overrides the client's claimed score (a claim that differs makes a mismatch). */
  claimScore?: number;
  /** Extra events (pause/resume, extra presses) merged in by step before seqs are given. */
  extra?: { step: number; type: "pause" | "resume" | "flap" }[];
}

/** Recorded events for a run: start, flaps (+extra), and a death claim matching the replay. */
function runEvents({ seed = 42, flaps = LOCKED_FLAPS, claimScore, extra = [] }: RunOptions = {}): GameEvent[] {
  const result = replay(seed, flaps);
  if (result.deathStep === null || result.deathCause === null) throw new Error("run must die");
  const body = [
    ...flaps.filter((s) => s < result.deathStep!).map((s) => ({ step: s, type: "flap" as const })),
    ...extra,
  ].sort((a, b) => a.step - b.step);
  const events: GameEvent[] = [{ seq: 0, step: 0, type: "start" }];
  for (const e of body) {
    const seq = events.length;
    events.push(e.type === "flap" ? { seq, step: e.step, type: "flap", source: "script" } : { seq, step: e.step, type: e.type });
  }
  events.push({
    seq: events.length,
    step: result.deathStep,
    type: "death",
    cause: result.deathCause,
    score: claimScore ?? result.score,
  });
  return events;
}

function newDb(): Db {
  const db = openDb(":memory:");
  insertPlayer(db, { id: "p1", nickname: "Ann", createdAt: 1 });
  insertPlayer(db, { id: "p2", nickname: "Bob", createdAt: 1 });
  return db;
}

interface RecordOptions extends RunOptions {
  id: string;
  playerId?: string;
  now?: number;
  maxReplaySteps?: number;
  /** Store only this many events (leaves the game open). */
  take?: number;
}

/** Reserves and ingests a game; returns its id. */
function record(db: Db, { id, playerId = "p1", now = 1000, maxReplaySteps, take, ...run }: RecordOptions): string {
  insertGame(db, { id, playerId, seed: run.seed ?? 42, seedSource: "dev", createdAt: 1 });
  const events = runEvents(run);
  const outcome = ingestEvents(db, {
    playerId,
    gameId: id,
    events: take === undefined ? events : events.slice(0, take),
    now,
    maxReplaySteps,
  });
  if ("error" in outcome) throw new Error(JSON.stringify(outcome.error));
  return id;
}

function summaryOf(db: Db, id: string) {
  return summarizeGame(getGame(db, id)!, getGameEvents(db, id));
}

function point(p: Partial<FlapPoint>): FlapPoint {
  return { step: 10, y: 200, vy: 1, peakY: 180, gapTop: 150, gapBottom: 260, ...p };
}

/** Engine state after stepping `seed` to `target`, flapping on `flaps`. */
function stateAt(seed: number, flaps: number[], target: number): GameState {
  const set = new Set(flaps);
  let state = createGame(seed);
  while (state.step < target) state = step(state, { flap: set.has(state.step) });
  return state;
}

describe("flap trace and waste rule", () => {
  it("wastedFlapReason applies the rising and overshoot rule", () => {
    // Rising wins even when the peak also overshoots.
    expect(wastedFlapReason(point({ vy: -0.1, peakY: 100, gapTop: 150 }))).toBe("rising");
    expect(wastedFlapReason(point({ vy: -2, peakY: 200, gapTop: 150 }))).toBe("rising");
    expect(wastedFlapReason(point({ vy: 0, peakY: 149.9, gapTop: 150 }))).toBe("overshoot");
    expect(wastedFlapReason(point({ vy: 3, peakY: 100, gapTop: 150 }))).toBe("overshoot");
    // A peak inside (or at the top of) the gap is fine.
    expect(wastedFlapReason(point({ vy: 3, peakY: 150, gapTop: 150 }))).toBeNull();
    expect(wastedFlapReason(point({ vy: 3, peakY: 200, gapTop: 150 }))).toBeNull();
    // No next pipe: no overshoot.
    expect(wastedFlapReason(point({ vy: 3, peakY: 0, gapTop: null, gapBottom: null }))).toBeNull();
  });

  it("traceFlaps records the bird state before each applied flap", () => {
    const { points, final } = traceFlaps(42, LOCKED_FLAPS, 5000);
    expect(points.map((p) => p.step)).toEqual(LOCKED_FLAPS);
    for (const p of points) {
      const before = stateAt(42, LOCKED_FLAPS, p.step);
      expect(p.y).toBe(before.bird.y);
      expect(p.vy).toBe(before.bird.vy);
    }
    const expected = replay(42, LOCKED_FLAPS);
    expect(final.score).toBe(2);
    expect(final.death).toEqual({ step: 296, cause: "ground" });
    expect(final).toEqual(expected.finalState);
    // Flaps listed at or after death are not points.
    expect(traceFlaps(42, [...LOCKED_FLAPS, 296, 400], 5000).points).toHaveLength(7);
  });

  it("a flap soon after another is wasted as rising", () => {
    const { points } = traceFlaps(42, [13, 16], 5000);
    expect(points[1]!.step).toBe(16);
    expect(points[1]!.vy).toBeCloseTo(-5.8, 10);
    expect(wastedFlapReason(points[0]!)).toBeNull();
    expect(wastedFlapReason(points[1]!)).toBe("rising");
  });

  it("a flap that lifts the bird above the next gap is an overshoot", () => {
    // Locked: seed 42, flaps [13, 40]. The flap at 40 starts falling (vy 2.6) at y 179.2,
    // peaks at y ~115.55, above the first pipe's gap top (gapY 218 - 55 = 163).
    const { points } = traceFlaps(42, [13, 40], 5000);
    const late = points[1]!;
    expect(late.step).toBe(40);
    expect(late.vy).toBeGreaterThanOrEqual(0);
    expect(late.gapTop).toBe(163);
    expect(late.gapBottom).toBe(273);
    expect(late.peakY).toBeCloseTo(115.55, 6);
    expect(wastedFlapReason(late)).toBe("overshoot");
    expect(wastedFlapReason(points[0]!)).toBeNull();
    // The look-ahead never changes the main run.
    const result = replay(42, [13, 40]);
    expect(traceFlaps(42, [13, 40], 5000).final).toEqual(result.finalState);
  });
});

describe("summarizeGame", () => {
  it("summarizeGame gives the locked seed-42 summary", () => {
    const db = newDb();
    record(db, { id: "g1", now: 5000 });
    expect(summaryOf(db, "g1")).toEqual({
      gameId: "g1",
      playedAt: 5000,
      seedSource: "dev",
      score: 2,
      deathStep: 296,
      deathCause: "ground",
      durationMs: 296000 / 60,
      flaps: 7,
      presses: 7,
      extraPresses: 0,
      scorePerFlap: 2 / 7,
      // Locked smoke-recipe values: no flap in this run is wasted.
      wastedFlaps: 0,
      wastedRising: 0,
      wastedOvershoot: 0,
      flapGapMs: { average: stepsToMs(224) / 6, shortest: 550, longest: 650 },
      mismatch: false,
      countsInStats: true,
    });
    expect(summaryOf(db, "g1")!.flapGapMs!.average).toBeCloseTo(622.22, 2);
  });

  it("counts rising and overshoot flaps in the summary", () => {
    const db = newDb();
    record(db, { id: "g1", flaps: [13, 16, 40] });
    expect(summaryOf(db, "g1")).toMatchObject({ flaps: 3, wastedFlaps: 2, wastedRising: 1, wastedOvershoot: 1 });
  });

  it("no flaps gives null ratios, one flap gives no flap timing", () => {
    const db = newDb();
    record(db, { id: "none", flaps: [] });
    record(db, { id: "one", flaps: [13] });
    expect(summaryOf(db, "none")).toMatchObject({ flaps: 0, scorePerFlap: null, wastedFlaps: 0, flapGapMs: null });
    expect(summaryOf(db, "one")).toMatchObject({ flaps: 1, scorePerFlap: 0, flapGapMs: null });
  });

  it("extra presses in one step are not flaps or waste", () => {
    const db = newDb();
    record(db, { id: "g1", extra: [{ step: 52, type: "flap" }] });
    const summary = summaryOf(db, "g1")!;
    expect(summary).toMatchObject({ flaps: 7, presses: 8, extraPresses: 1, wastedFlaps: 0, wastedRising: 0, wastedOvershoot: 0 });
  });

  it("flap timing uses game steps so pauses do not count", () => {
    const db = newDb();
    record(db, { id: "plain", now: 1000 });
    record(db, {
      id: "paused",
      now: 999_999,
      extra: [
        { step: 60, type: "pause" },
        { step: 60, type: "resume" },
        { step: 200, type: "pause" },
        { step: 200, type: "resume" },
      ],
    });
    expect(summaryOf(db, "paused")!.flapGapMs).toEqual(summaryOf(db, "plain")!.flapGapMs);
  });

  it("client claims never reach the summary", () => {
    const db = newDb();
    record(db, { id: "g1", claimScore: 99 });
    expect(summaryOf(db, "g1")).toMatchObject({ score: 2, deathStep: 296, mismatch: true, countsInStats: false });
  });

  it("no summary without a server death", () => {
    const db = newDb();
    insertGame(db, { id: "created", playerId: "p1", seed: 42, seedSource: "dev", createdAt: 1 });
    record(db, { id: "open", take: 3 });
    record(db, { id: "incomplete", take: 3 });
    db.prepare("UPDATE games SET status = 'incomplete' WHERE id = 'incomplete'").run();
    record(db, { id: "alive", maxReplaySteps: 10 });
    expect(getGame(db, "open")!.status).toBe("open");
    expect(getGame(db, "alive")).toMatchObject({ status: "complete", deathStep: null, mismatch: true });
    for (const id of ["created", "open", "incomplete", "alive"]) expect(summaryOf(db, id)).toBeNull();
  });

  it("summary agrees with the stored replay result", () => {
    const db = newDb();
    for (const [id, flaps] of [
      ["a", LOCKED_FLAPS],
      ["b", [13, 16, 40]],
      ["c", PIPE_TOP_FLAPS],
    ] as const) {
      record(db, { id, flaps: [...flaps] });
      const game = getGame(db, id)!;
      const summary = summaryOf(db, id)!;
      expect(summary.score).toBe(game.score);
      expect(summary.deathStep).toBe(game.deathStep);
      expect(summary.deathCause).toBe(game.deathCause);
      expect(summary.flaps).toBe(game.flapCount);
      expect(summary.presses).toBe(game.pressCount);
    }
  });
});

describe("playerStats", () => {
  it("player stats count only complete, matching games of that player", () => {
    const db = newDb();
    record(db, { id: "newer", now: 3000 });
    record(db, { id: "older", now: 2000 });
    record(db, { id: "incomplete", now: 1500, take: 3 });
    db.prepare("UPDATE games SET status = 'incomplete' WHERE id = 'incomplete'").run();
    record(db, { id: "open", now: 1500, take: 3 });
    insertGame(db, { id: "created", playerId: "p1", seed: 42, seedSource: "server", createdAt: 1 });
    record(db, { id: "mismatch", now: 1500, claimScore: 99 });
    record(db, { id: "alive", now: 1500, maxReplaySteps: 10 });
    record(db, { id: "bobs", now: 1500, playerId: "p2" });

    const stats = playerStats(db, "p1")!;
    expect(stats.playerId).toBe("p1");
    expect(stats.nickname).toBe("Ann");
    expect(stats.games.map((g) => g.gameId)).toEqual(["older", "newer"]);
    expect(stats.games[0]).toEqual({
      gameId: "older",
      playedAt: 2000,
      score: 2,
      flaps: 7,
      scorePerFlap: 2 / 7,
      wastedFlaps: 0,
      wastedShare: 0,
      averageFlapGapMs: stepsToMs(224) / 6,
      deathCause: "ground",
    });
    expect(stats.totals.games).toBe(2);
  });

  it("player stats order games with the same time by id", () => {
    const db = newDb();
    record(db, { id: "b", now: 1000 });
    record(db, { id: "a", now: 1000 });
    expect(playerStats(db, "p1")!.games.map((g) => g.gameId)).toEqual(["a", "b"]);
  });

  it("player stats totals add up across games", () => {
    const db = newDb();
    record(db, { id: "a", now: 1000 });
    record(db, { id: "b", now: 2000, flaps: [13, 16, 40] });
    record(db, { id: "c", now: 3000, flaps: PIPE_TOP_FLAPS });
    const summaries = ["a", "b", "c"].map((id) => summaryOf(db, id)!);
    const score = summaries.reduce((n, s) => n + s.score, 0);
    const flaps = summaries.reduce((n, s) => n + s.flaps, 0);
    const wasted = summaries.reduce((n, s) => n + s.wastedFlaps, 0);
    expect(flaps).toBe(7 + 3 + 31);
    expect(wasted).toBeGreaterThan(0);

    const { totals, games } = playerStats(db, "p1")!;
    expect(totals).toEqual({
      games: 3,
      averageScore: score / 3,
      averageScorePerFlap: score / flaps,
      wastedShare: wasted / flaps,
      deathCauses: { ground: 2, "pipe-top": 1, "pipe-bottom": 0 },
    });
    expect(games[1]).toMatchObject({ gameId: "b", flaps: 3, wastedFlaps: 2, wastedShare: 2 / 3 });
  });

  it("player stats keep only the newest games", () => {
    const db = newDb();
    for (let i = 0; i <= MAX_TREND_GAMES; i += 1) {
      record(db, { id: `g${String(i).padStart(3, "0")}`, now: 1000 + i });
    }
    const { games, totals } = playerStats(db, "p1")!;
    expect(games).toHaveLength(MAX_TREND_GAMES);
    expect(totals.games).toBe(MAX_TREND_GAMES);
    expect(games[0]!.gameId).toBe("g001");
    expect(games[games.length - 1]!.gameId).toBe(`g${MAX_TREND_GAMES}`);
  });

  it("player with no games has empty stats", () => {
    const db = newDb();
    record(db, { id: "open", take: 3 });
    expect(playerStats(db, "p1")).toEqual({
      playerId: "p1",
      nickname: "Ann",
      games: [],
      totals: {
        games: 0,
        averageScore: null,
        averageScorePerFlap: null,
        wastedShare: null,
        deathCauses: { ground: 0, "pipe-top": 0, "pipe-bottom": 0 },
      },
    });
    expect(playerStats(db, "ghost")).toBeUndefined();
  });
});
