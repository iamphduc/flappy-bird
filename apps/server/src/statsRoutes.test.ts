import { describe, expect, it } from "vitest";
import { replay, stepsToMs, type GameEvent } from "@flappy/engine";
import { buildApp } from "./app.ts";
import { insertGame, insertPlayer, openDb, type Db } from "./db.ts";
import { ingestEvents } from "./ingest.ts";

const LOCKED_FLAPS = [13, 52, 90, 128, 166, 199, 237];

function lockedRun(claimScore = 2): GameEvent[] {
  const result = replay(42, LOCKED_FLAPS);
  return [
    { seq: 0, step: 0, type: "start" },
    ...LOCKED_FLAPS.map((step, i): GameEvent => ({ seq: i + 1, step, type: "flap", source: "script" })),
    { seq: 8, step: result.deathStep!, type: "death", cause: "ground", score: claimScore },
  ];
}

function setup(): { db: Db; app: ReturnType<typeof buildApp> } {
  const db = openDb(":memory:");
  insertPlayer(db, { id: "p1", nickname: "Ann", createdAt: 1 });
  insertPlayer(db, { id: "p2", nickname: "Bob", createdAt: 1 });
  return { db, app: buildApp({ db }) };
}

function record(db: Db, id: string, { take, maxReplaySteps, now = 5000 }: { take?: number; maxReplaySteps?: number; now?: number } = {}) {
  insertGame(db, { id, playerId: "p1", seed: 42, seedSource: "dev", createdAt: 1 });
  const events = lockedRun();
  const outcome = ingestEvents(db, {
    playerId: "p1",
    gameId: id,
    events: take === undefined ? events : events.slice(0, take),
    now,
    maxReplaySteps,
  });
  if ("error" in outcome) throw new Error(JSON.stringify(outcome.error));
}

describe("stats routes", () => {
  it("summary route returns the server summary", async () => {
    const { db, app } = setup();
    record(db, "g1");
    const res = await app.inject({ method: "GET", url: "/api/games/g1/summary" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
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
      wastedFlaps: 0,
      wastedRising: 0,
      wastedOvershoot: 0,
      flapGapMs: { average: stepsToMs(224) / 6, shortest: 550, longest: 650 },
      mismatch: false,
      countsInStats: true,
    });
    await app.close();
  });

  it("summary route rejects games that are not complete", async () => {
    const { db, app } = setup();
    insertGame(db, { id: "created", playerId: "p1", seed: 42, seedSource: "dev", createdAt: 1 });
    record(db, "open", { take: 3 });
    record(db, "incomplete", { take: 3 });
    db.prepare("UPDATE games SET status = 'incomplete' WHERE id = 'incomplete'").run();

    const unknown = await app.inject({ method: "GET", url: "/api/games/nope/summary" });
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json()).toEqual({ error: "unknown game" });
    for (const id of ["created", "open", "incomplete"]) {
      const res = await app.inject({ method: "GET", url: `/api/games/${id}/summary` });
      expect(res.statusCode).toBe(409);
      expect(res.json()).toEqual({ error: "not-complete" });
    }
    await app.close();
  });

  it("summary route rejects games with no server death", async () => {
    const { db, app } = setup();
    record(db, "alive", { maxReplaySteps: 10 });
    const res = await app.inject({ method: "GET", url: "/api/games/alive/summary" });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: "no-server-result" });
    await app.close();
  });

  it("stats route returns the player trend", async () => {
    const { db, app } = setup();
    record(db, "g2", { now: 6000 });
    record(db, "g1", { now: 5000 });
    const res = await app.inject({ method: "GET", url: "/api/players/p1/stats" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({
      playerId: "p1",
      nickname: "Ann",
      totals: {
        games: 2,
        averageScore: 2,
        averageScorePerFlap: 2 / 7,
        wastedShare: 0,
        deathCauses: { ground: 2, "pipe-top": 0, "pipe-bottom": 0 },
      },
    });
    expect(body.games.map((g: { gameId: string }) => g.gameId)).toEqual(["g1", "g2"]);

    const empty = await app.inject({ method: "GET", url: "/api/players/p2/stats" });
    expect(empty.statusCode).toBe(200);
    expect(empty.json()).toMatchObject({ playerId: "p2", games: [], totals: { games: 0 } });

    const unknown = await app.inject({ method: "GET", url: "/api/players/ghost/stats" });
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json()).toEqual({ error: "unknown player" });
    await app.close();
  });
});
