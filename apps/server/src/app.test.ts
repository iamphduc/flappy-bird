import { describe, expect, it } from "vitest";
import { buildApp } from "./app.ts";
import { openDb } from "./db.ts";

describe("GET /api/health", () => {
  it("returns ok", async () => {
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, stepsPerSecond: 60 });
    await app.close();
  });
});

describe("buildApp", () => {
  it("closes the DB on app close", async () => {
    const db = openDb(":memory:");
    const app = buildApp({ db });
    await app.ready();
    await app.close();
    expect(() => db.prepare("SELECT 1")).toThrow();
  });

  it("does not fail when the DB was already closed", async () => {
    const db = openDb(":memory:");
    const app = buildApp({ db });
    db.close();
    await expect(app.close()).resolves.toBeUndefined();
  });
});
