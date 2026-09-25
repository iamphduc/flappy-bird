import { describe, expect, it } from "vitest";
import { buildApp } from "./app.ts";
import { openDb } from "./db.ts";

async function newPlayer(app: ReturnType<typeof buildApp>): Promise<string> {
  const res = await app.inject({ method: "POST", url: "/api/players", payload: { nickname: "Ann" } });
  return res.json().id;
}

describe("game routes", () => {
  it("reserves a game with a server seed", async () => {
    const app = buildApp();
    const playerId = await newPlayer(app);
    const res = await app.inject({ method: "POST", url: "/api/games", payload: { playerId } });
    expect(res.statusCode).toBe(201);
    const { gameId, seed } = res.json();
    expect(typeof gameId).toBe("string");
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThan(2 ** 32);

    const game = (await app.inject({ method: "GET", url: `/api/games/${gameId}` })).json();
    expect(game).toMatchObject({ id: gameId, playerId, seed, status: "created", seedSource: "server", events: [] });
    await app.close();
  });

  it("unknown player cannot reserve a game", async () => {
    const app = buildApp();
    const res = await app.inject({ method: "POST", url: "/api/games", payload: { playerId: "ghost" } });
    expect(res.statusCode).toBe(404);
    const noId = await app.inject({ method: "POST", url: "/api/games", payload: {} });
    expect(noId.statusCode).toBe(400);
    await app.close();
  });

  it("client seeds only in dev", async () => {
    const prod = buildApp();
    const prodPlayer = await newPlayer(prod);
    const rejected = await prod.inject({
      method: "POST",
      url: "/api/games",
      payload: { playerId: prodPlayer, seed: 42 },
    });
    expect(rejected.statusCode).toBe(400);
    await prod.close();

    const dev = buildApp({ devSeeds: true });
    const devPlayer = await newPlayer(dev);
    const res = await dev.inject({ method: "POST", url: "/api/games", payload: { playerId: devPlayer, seed: 42 } });
    expect(res.statusCode).toBe(201);
    expect(res.json().seed).toBe(42);
    const game = (await dev.inject({ method: "GET", url: `/api/games/${res.json().gameId}` })).json();
    expect(game).toMatchObject({ seed: 42, seedSource: "dev" });

    for (const seed of [-1, 2 ** 32, 1.5, "42"]) {
      const bad = await dev.inject({ method: "POST", url: "/api/games", payload: { playerId: devPlayer, seed } });
      expect(bad.statusCode, JSON.stringify(seed)).toBe(400);
    }
    await dev.close();
  });

  it("returns a game with its events", async () => {
    const db = openDb(":memory:");
    const app = buildApp({ db, devSeeds: true });
    const playerId = await newPlayer(app);
    const { gameId } = (
      await app.inject({ method: "POST", url: "/api/games", payload: { playerId, seed: 7 } })
    ).json();

    const insert = db.prepare(
      "INSERT INTO events (game_id, seq, step, type, source, cause, score, received_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    );
    insert.run(gameId, 2, 40, "death", null, "ground", 0, 500);
    insert.run(gameId, 0, 0, "start", null, null, null, 500);
    insert.run(gameId, 1, 0, "flap", "click", null, null, 500);

    const res = await app.inject({ method: "GET", url: `/api/games/${gameId}` });
    expect(res.statusCode).toBe(200);
    const game = res.json();
    expect(game).toMatchObject({
      id: gameId,
      playerId,
      seed: 7,
      seedSource: "dev",
      status: "created",
      lastEventAt: null,
      score: null,
      deathStep: null,
      deathCause: null,
      flapCount: null,
      pressCount: null,
      clientScore: null,
      clientDeathStep: null,
      mismatch: null,
    });
    expect(typeof game.createdAt).toBe("number");
    expect(game.events.map((e: { seq: number }) => e.seq)).toEqual([0, 1, 2]);
    expect(game.events[1]).toMatchObject({ seq: 1, step: 0, type: "flap", source: "click" });
    expect(game.events[2]).toMatchObject({ type: "death", cause: "ground", score: 0 });

    const missing = await app.inject({ method: "GET", url: "/api/games/nope" });
    expect(missing.statusCode).toBe(404);
    await app.close();
  });
});
