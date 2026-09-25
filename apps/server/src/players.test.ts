import { describe, expect, it } from "vitest";
import { buildApp } from "./app.ts";

describe("player routes", () => {
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
    const missing = await app.inject({ method: "POST", url: "/api/players", payload: {} });
    expect(missing.statusCode).toBe(400);
    const noBody = await app.inject({ method: "POST", url: "/api/players" });
    expect(noBody.statusCode).toBe(400);
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
});
