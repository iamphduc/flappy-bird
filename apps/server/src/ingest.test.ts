import { afterEach, describe, expect, it, vi } from "vitest";
import { replayEvents, type GameEvent } from "@flappy/engine";
import { getGame, getGameEvents, insertGame, insertPlayer, openDb, type Db } from "./db.ts";
import { ingestEvents, startSweeper, sweepIdle } from "./ingest.ts";

const LOCKED_FLAPS = [13, 52, 90, 128, 166, 199, 237];
const FIVE_MIN = 5 * 60 * 1000;

/** The locked seed-42 run as events: start, 7 flaps, death (seqs 0..8). */
function lockedRun(death: { score: number; step: number } = { score: 2, step: 296 }): GameEvent[] {
  return [
    { seq: 0, step: 0, type: "start" },
    ...LOCKED_FLAPS.map((step, i): GameEvent => ({ seq: i + 1, step, type: "flap", source: "script" })),
    { seq: LOCKED_FLAPS.length + 1, step: death.step, type: "death", cause: "ground", score: death.score },
  ];
}

function setup(): { db: Db; playerId: string; gameId: string } {
  const db = openDb(":memory:");
  insertPlayer(db, { id: "p1", nickname: "Ann", createdAt: 1 });
  insertPlayer(db, { id: "p2", nickname: "Bob", createdAt: 1 });
  insertGame(db, { id: "g1", playerId: "p1", seed: 42, seedSource: "dev", createdAt: 1 });
  return { db, playerId: "p1", gameId: "g1" };
}

function ingest(db: Db, events: GameEvent[], now = 1000, playerId = "p1", gameId = "g1") {
  return ingestEvents(db, { playerId, gameId, events, now });
}

function ackOf(outcome: ReturnType<typeof ingestEvents>) {
  if ("error" in outcome) throw new Error(`unexpected error: ${JSON.stringify(outcome.error)}`);
  return outcome.ack;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("ingestEvents", () => {
  it("duplicate events are stored once", () => {
    const { db } = setup();
    const batch = lockedRun().slice(0, 4);
    const first = ingest(db, batch, 1000);
    const second = ingest(db, batch, 2000);
    expect(ackOf(first)).toEqual({ type: "ack", gameId: "g1", upTo: 3 });
    expect(ackOf(second)).toEqual(ackOf(first));
    expect(getGameEvents(db, "g1").map((e) => e.seq)).toEqual([0, 1, 2, 3]);
    // Nothing new was stored the second time, so the game did not move.
    expect(getGame(db, "g1")?.lastEventAt).toBe(1000);
    // Duplicates inside one batch are stored once too (first write wins).
    const dup = ingest(db, [lockedRun()[4]!, { seq: 4, step: 999, type: "pause" }], 3000);
    expect(ackOf(dup).upTo).toBe(4);
    expect(getGameEvents(db, "g1")[4]).toMatchObject({ seq: 4, type: "flap", step: 128 });
  });

  it("ack is the highest contiguous seq", () => {
    const { db } = setup();
    const run = lockedRun();
    expect(ackOf(ingest(db, [run[0]!, run[1]!, run[3]!])).upTo).toBe(1);
    expect(ackOf(ingest(db, [run[2]!])).upTo).toBe(3);
  });

  it("complete game stores the server replay result", () => {
    const { db } = setup();
    const events = lockedRun();
    const expected = replayEvents(42, events);
    const outcome = ingest(db, events, 5000);
    if ("error" in outcome) throw new Error("unexpected error");
    expect(outcome.ack).toEqual({ type: "ack", gameId: "g1", upTo: 8 });
    expect(outcome.result).toEqual({
      type: "result",
      gameId: "g1",
      status: "complete",
      score: 2,
      deathStep: 296,
      deathCause: "ground",
      flapCount: 7,
      pressCount: 7,
      mismatch: false,
    });
    expect(outcome.result).toMatchObject({
      score: expected.score,
      deathStep: expected.deathStep,
      deathCause: expected.deathCause,
      flapCount: expected.flapCount,
      pressCount: expected.pressCount,
    });
    expect(getGame(db, "g1")).toMatchObject({
      status: "complete",
      score: 2,
      deathStep: 296,
      deathCause: "ground",
      flapCount: 7,
      pressCount: 7,
      clientScore: 2,
      clientDeathStep: 296,
      mismatch: false,
      lastEventAt: 5000,
    });
  });

  it("counts every press but replays distinct flap steps", () => {
    const { db } = setup();
    const events: GameEvent[] = [
      { seq: 0, step: 0, type: "start" },
      { seq: 1, step: 13, type: "flap", source: "script" },
      { seq: 2, step: 52, type: "flap", source: "space" },
      { seq: 3, step: 52, type: "flap", source: "click" },
      ...LOCKED_FLAPS.slice(2).map((step, i): GameEvent => ({ seq: i + 4, step, type: "flap", source: "tap" })),
      { seq: 9, step: 296, type: "death", cause: "ground", score: 2 },
    ];
    const outcome = ingest(db, events);
    if ("error" in outcome) throw new Error("unexpected error");
    expect(outcome.result).toMatchObject({ score: 2, deathStep: 296, flapCount: 7, pressCount: 8, mismatch: false });
  });

  it("client claimed results are never used", () => {
    const { db } = setup();
    const outcome = ingest(db, lockedRun({ score: 99, step: 296 }));
    if ("error" in outcome) throw new Error("unexpected error");
    expect(outcome.result).toMatchObject({ score: 2, deathStep: 296, mismatch: true });
    expect(getGame(db, "g1")).toMatchObject({
      status: "complete",
      score: 2,
      deathStep: 296,
      clientScore: 99,
      clientDeathStep: 296,
      mismatch: true,
    });
  });

  it("a wrong claimed death step is a mismatch", () => {
    const { db } = setup();
    const outcome = ingest(db, lockedRun({ score: 2, step: 400 }));
    if ("error" in outcome) throw new Error("unexpected error");
    expect(outcome.result).toMatchObject({ score: 2, deathStep: 296, mismatch: true });
    expect(getGame(db, "g1")).toMatchObject({ deathStep: 296, clientDeathStep: 400, mismatch: true });
  });

  it("a death the replay does not reach completes without a result", () => {
    const { db } = setup();
    // No flaps, and a claimed death long before the bird can hit the ground.
    const outcome = ingest(db, [
      { seq: 0, step: 0, type: "start" },
      { seq: 1, step: 5, type: "death", cause: "ground", score: 0 },
    ]);
    if ("error" in outcome) throw new Error("unexpected error");
    expect(outcome.result).toBeUndefined();
    expect(getGame(db, "g1")).toMatchObject({
      status: "complete",
      score: 0,
      deathStep: null,
      deathCause: null,
      clientDeathStep: 5,
      mismatch: true,
    });
  });

  it("gaps block completion until filled", () => {
    const { db } = setup();
    const run = lockedRun();
    const partial = ingest(
      db,
      run.filter((e) => e.seq !== 3),
    );
    if ("error" in partial) throw new Error("unexpected error");
    expect(partial.ack.upTo).toBe(2);
    expect(partial.result).toBeUndefined();
    expect(getGame(db, "g1")?.status).toBe("open");

    const filled = ingest(db, [run[3]!]);
    if ("error" in filled) throw new Error("unexpected error");
    expect(filled.ack.upTo).toBe(8);
    expect(filled.result).toMatchObject({ status: "complete", score: 2 });
    expect(getGame(db, "g1")?.status).toBe("complete");
  });

  it("events after death are rejected", () => {
    const { db } = setup();
    const run = lockedRun();
    // Death (seq 8) stored with a gap at seq 3, so the game stays open.
    ingest(
      db,
      run.filter((e) => e.seq !== 3),
    );
    const late = ingest(db, [{ seq: 9, step: 300, type: "flap", source: "space" }]);
    expect(late).toEqual({
      error: { type: "error", code: "after-death", message: expect.any(String), gameId: "g1" },
    });
    expect(getGameEvents(db, "g1").map((e) => e.seq)).not.toContain(9);

    // A batch mixing a valid gap fill with a late event stores nothing.
    const mixed = ingest(db, [run[3]!, { seq: 10, step: 300, type: "pause" }]);
    expect("error" in mixed).toBe(true);
    expect(getGameEvents(db, "g1").map((e) => e.seq)).not.toContain(3);
  });

  it("a resent seq never replaces the stored event", () => {
    const { db } = setup();
    ingest(db, lockedRun().slice(0, 5)); // seqs 0..4
    const resend = ingest(db, [{ seq: 2, step: 60, type: "death", cause: "ground", score: 0 }]);
    expect(ackOf(resend).upTo).toBe(4);
    expect(getGameEvents(db, "g1")[2]).toMatchObject({ type: "flap", step: 52 });
  });

  it("a new death below an already stored seq is rejected", () => {
    const { db } = setup();
    const run = lockedRun();
    ingest(db, [run[0]!, run[5]!]); // seqs 0 and 5
    const deathBelow = ingest(db, [{ seq: 2, step: 60, type: "death", cause: "ground", score: 0 }]);
    expect(deathBelow).toMatchObject({ error: { code: "after-death", gameId: "g1" } });
    expect(getGameEvents(db, "g1").map((e) => e.seq)).toEqual([0, 5]);
  });

  it("rejects games the player does not own", () => {
    const { db } = setup();
    const notMine = ingest(db, lockedRun().slice(0, 2), 1000, "p2", "g1");
    expect(notMine).toEqual({
      error: { type: "error", code: "not-your-game", message: expect.any(String), gameId: "g1" },
    });
    const unknown = ingest(db, lockedRun().slice(0, 2), 1000, "p1", "nope");
    expect(unknown).toEqual({
      error: { type: "error", code: "unknown-game", message: expect.any(String), gameId: "nope" },
    });
    expect(getGameEvents(db, "g1")).toEqual([]);
    expect(getGame(db, "g1")?.status).toBe("created");
  });

  it("events for a complete game are ignored but acked", () => {
    const { db } = setup();
    ingest(db, lockedRun(), 1000);
    const again = ingest(db, lockedRun(), 2000);
    expect(again).toEqual({ ack: { type: "ack", gameId: "g1", upTo: 8 } });
    expect(getGame(db, "g1")?.lastEventAt).toBe(1000);
  });

  it("idle games are marked incomplete after the timeout", () => {
    const { db } = setup();
    insertGame(db, { id: "g2", playerId: "p1", seed: 7, seedSource: "server", createdAt: 1 });
    const t0 = 10_000;
    ingest(db, lockedRun().slice(0, 3), t0);
    expect(getGame(db, "g1")?.status).toBe("open");

    sweepIdle(db, t0 + FIVE_MIN, FIVE_MIN);
    expect(getGame(db, "g1")?.status).toBe("open");
    sweepIdle(db, t0 + FIVE_MIN + 1, FIVE_MIN);
    expect(getGame(db, "g1")?.status).toBe("incomplete");
    expect(getGame(db, "g2")?.status).toBe("created");
  });

  it("late events can still complete a game", () => {
    const { db } = setup();
    const run = lockedRun();
    ingest(db, run.slice(0, 3), 0);
    sweepIdle(db, FIVE_MIN + 1, FIVE_MIN);
    expect(getGame(db, "g1")?.status).toBe("incomplete");

    const late = ingest(db, run.slice(3), FIVE_MIN + 2);
    if ("error" in late) throw new Error("unexpected error");
    expect(late.result).toMatchObject({ status: "complete", score: 2, deathStep: 296 });
    expect(getGame(db, "g1")?.status).toBe("complete");
  });

  it("a stored event reopens an incomplete game", () => {
    const { db } = setup();
    const run = lockedRun();
    ingest(db, run.slice(0, 3), 0);
    sweepIdle(db, FIVE_MIN + 1, FIVE_MIN);
    ingest(db, [run[3]!], FIVE_MIN + 2);
    expect(getGame(db, "g1")).toMatchObject({ status: "open", lastEventAt: FIVE_MIN + 2 });
  });
});

describe("startSweeper", () => {
  it("sweeper runs on its interval", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { db } = setup();
    ingest(db, lockedRun().slice(0, 2), 0);
    const stop = startSweeper(db, { timeoutMs: 1000, intervalMs: 500 });

    vi.advanceTimersByTime(1000); // sweeps at 500 and 1000: not older than 1000 ms yet
    expect(getGame(db, "g1")?.status).toBe("open");
    vi.advanceTimersByTime(500); // sweep at 1500
    expect(getGame(db, "g1")?.status).toBe("incomplete");

    stop();
    insertGame(db, { id: "g3", playerId: "p1", seed: 1, seedSource: "server", createdAt: 0 });
    ingestEvents(db, { playerId: "p1", gameId: "g3", events: lockedRun().slice(0, 1), now: Date.now() });
    vi.advanceTimersByTime(10_000);
    expect(getGame(db, "g3")?.status).toBe("open");
  });

  it("defaults the interval to half the timeout, at most 30 s", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { db } = setup();
    ingest(db, lockedRun().slice(0, 2), 0);
    const stop = startSweeper(db, { timeoutMs: 1000 });
    vi.advanceTimersByTime(1499);
    expect(getGame(db, "g1")?.status).toBe("open");
    vi.advanceTimersByTime(1); // sweep at 1500
    expect(getGame(db, "g1")?.status).toBe("incomplete");
    stop();

    const long = setup();
    ingest(long.db, lockedRun().slice(0, 2), Date.now());
    const stopLong = startSweeper(long.db, { timeoutMs: FIVE_MIN });
    vi.advanceTimersByTime(FIVE_MIN + 29_999);
    expect(getGame(long.db, "g1")?.status).toBe("open");
    vi.advanceTimersByTime(1); // interval 30 s: sweep at 5 min + 30 s
    expect(getGame(long.db, "g1")?.status).toBe("incomplete");
    stopLong();
  });
});
