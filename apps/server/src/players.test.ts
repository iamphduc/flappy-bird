import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "./app.ts";

const FUNNY = /^[A-Z][a-z]+ [A-Z][a-z]+ ([1-9]|[1-9][0-9])$/;

async function register(app: ReturnType<typeof buildApp>, nickname: string) {
  return (await app.inject({ method: "POST", url: "/api/players", payload: { nickname } })).json() as {
    id: string;
    nickname: string;
  };
}

describe("player routes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("registers a player", async () => {
    const app = buildApp();
    const res = await app.inject({ method: "POST", url: "/api/players", payload: { nickname: "  Ann  " } });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.nickname).toBe("Ann");
    expect(typeof body.id).toBe("string");
    expect(body.id.length).toBeGreaterThan(0);
    await app.close();
  });

  it("rejects bad nicknames", async () => {
    const app = buildApp();
    const bad: unknown[] = ["", "   ", "x".repeat(21), 42, null, ["Ann"]];
    for (const nickname of bad) {
      const res = await app.inject({ method: "POST", url: "/api/players", payload: { nickname } });
      expect(res.statusCode, JSON.stringify(nickname)).toBe(400);
    }
    const trimmed = await app.inject({ method: "POST", url: "/api/players", payload: { nickname: "  Ann  " } });
    expect(trimmed.statusCode).toBe(201);
    expect(trimmed.json().nickname).toBe("Ann");
    const ok = await app.inject({ method: "POST", url: "/api/players", payload: { nickname: "x".repeat(20) } });
    expect(ok.statusCode).toBe(201);
    await app.close();
  });

  it("looks up a player", async () => {
    const app = buildApp();
    const created = (
      await app.inject({ method: "POST", url: "/api/players", payload: { nickname: "Bob" } })
    ).json();
    const res = await app.inject({ method: "GET", url: `/api/players/${created.id}` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ id: created.id, nickname: "Bob" });
    const missing = await app.inject({ method: "GET", url: "/api/players/unknown-id" });
    expect(missing.statusCode).toBe(404);
    await app.close();
  });

  it("registers a player with a funny name when no nickname is given", async () => {
    const app = buildApp();
    const noBody = await app.inject({ method: "POST", url: "/api/players" });
    const empty = await app.inject({ method: "POST", url: "/api/players", payload: {} });
    for (const res of [noBody, empty]) {
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.nickname).toMatch(FUNNY);
      const looked = await app.inject({ method: "GET", url: `/api/players/${body.id}` });
      expect(looked.json()).toEqual({ id: body.id, nickname: body.nickname });
    }
    await app.close();
  });

  it("renames a player", async () => {
    const app = buildApp();
    const player = await register(app, "Ann");
    const res = await app.inject({ method: "PATCH", url: `/api/players/${player.id}`, payload: { nickname: "  Zed " } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ id: player.id, nickname: "Zed" });
    expect((await app.inject({ method: "GET", url: `/api/players/${player.id}` })).json().nickname).toBe("Zed");

    for (const nickname of ["", "   ", "x".repeat(21), 42, null, ["Ann"]]) {
      const bad = await app.inject({ method: "PATCH", url: `/api/players/${player.id}`, payload: { nickname } });
      expect(bad.statusCode, JSON.stringify(nickname)).toBe(400);
      expect(bad.json()).toEqual({ error: "nickname must be 1-20 characters" });
    }
    expect((await app.inject({ method: "GET", url: `/api/players/${player.id}` })).json().nickname).toBe("Zed");

    const unknown = await app.inject({ method: "PATCH", url: "/api/players/ghost", payload: { nickname: "Zed" } });
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json()).toEqual({ error: "unknown player" });
    const unknownBad = await app.inject({ method: "PATCH", url: "/api/players/ghost", payload: { nickname: "" } });
    expect(unknownBad.statusCode).toBe(404);
    await app.close();
  });

  it("rerolls a player name", async () => {
    const app = buildApp();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const player = (await app.inject({ method: "POST", url: "/api/players" })).json();
    expect(player.nickname).toMatch(FUNNY);

    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const empty = await app.inject({ method: "PATCH", url: `/api/players/${player.id}`, payload: {} });
    expect(empty.statusCode).toBe(200);
    expect(empty.json().id).toBe(player.id);
    expect(empty.json().nickname).toMatch(FUNNY);
    expect(empty.json().nickname).not.toBe(player.nickname);

    vi.spyOn(Math, "random").mockReturnValue(0.999999);
    const noBody = await app.inject({ method: "PATCH", url: `/api/players/${player.id}` });
    expect(noBody.statusCode).toBe(200);
    expect(noBody.json().nickname).toMatch(FUNNY);
    expect(noBody.json().nickname).not.toBe(empty.json().nickname);
    expect((await app.inject({ method: "GET", url: `/api/players/${player.id}` })).json().nickname).toBe(
      noBody.json().nickname,
    );
    await app.close();
  });

  it("rename keeps the player's games", async () => {
    const app = buildApp();
    const player = await register(app, "Ann");
    const other = await register(app, "Bob");
    const game = await app.inject({ method: "POST", url: "/api/games", payload: { playerId: player.id } });
    expect(game.statusCode).toBe(201);
    const gameId = game.json().gameId as string;

    const renamed = await app.inject({ method: "PATCH", url: `/api/players/${player.id}`, payload: { nickname: "Zed" } });
    expect(renamed.statusCode).toBe(200);

    expect((await app.inject({ method: "GET", url: `/api/games/${gameId}` })).json().playerId).toBe(player.id);
    const stats = await app.inject({ method: "GET", url: `/api/players/${player.id}/stats` });
    expect(stats.statusCode).toBe(200);
    expect(stats.json().nickname).toBe("Zed");
    expect((await app.inject({ method: "GET", url: `/api/players/${other.id}` })).json().nickname).toBe("Bob");
    await app.close();
  });
});
