import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getGame, getGameEvents, getPlayer, insertGame, insertPlayer, openDb } from "./db.ts";

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("openDb", () => {
  it("creates the schema", () => {
    const db = openDb(":memory:");
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => row.name);
    expect(tables).toEqual(["events", "games", "players"]);
    const fk = db.prepare("PRAGMA foreign_keys").get();
    expect(fk?.foreign_keys).toBe(1);
    db.close();
  });

  it("reopening a file keeps data", () => {
    const dir = mkdtempSync(join(tmpdir(), "flappy-db-"));
    tempDirs.push(dir);
    const path = join(dir, "nested", "flappy.db");

    const first = openDb(path);
    insertPlayer(first, { id: "p1", nickname: "Ann", createdAt: 1000 });
    insertGame(first, { id: "g1", playerId: "p1", seed: 42, seedSource: "dev", createdAt: 2000 });
    first.close();

    const second = openDb(path);
    expect(getPlayer(second, "p1")).toEqual({ id: "p1", nickname: "Ann", createdAt: 1000 });
    expect(getGame(second, "g1")).toMatchObject({
      id: "g1",
      playerId: "p1",
      seed: 42,
      seedSource: "dev",
      status: "created",
      createdAt: 2000,
    });
    const mode = second.prepare("PRAGMA journal_mode").get();
    expect(mode?.journal_mode).toBe("wal");
    second.close();
  });
});

describe("helpers", () => {
  it("return undefined for unknown rows and events in seq order", () => {
    const db = openDb(":memory:");
    expect(getPlayer(db, "nope")).toBeUndefined();
    expect(getGame(db, "nope")).toBeUndefined();
    insertPlayer(db, { id: "p1", nickname: "Ann", createdAt: 1 });
    insertGame(db, { id: "g1", playerId: "p1", seed: 4294967295, seedSource: "server", createdAt: 2 });
    const insert = db.prepare(
      "INSERT INTO events (game_id, seq, step, type, source, cause, score, received_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    );
    insert.run("g1", 1, 5, "flap", "space", null, null, 10);
    insert.run("g1", 0, 0, "start", null, null, null, 10);
    expect(getGameEvents(db, "g1")).toEqual([
      { seq: 0, step: 0, type: "start", source: null, cause: null, score: null, receivedAt: 10 },
      { seq: 1, step: 5, type: "flap", source: "space", cause: null, score: null, receivedAt: 10 },
    ]);
    expect(getGame(db, "g1")?.seed).toBe(4294967295);
    db.close();
  });

  it("rejects a game for an unknown player", () => {
    const db = openDb(":memory:");
    expect(() =>
      insertGame(db, { id: "g1", playerId: "ghost", seed: 1, seedSource: "server", createdAt: 1 }),
    ).toThrow();
    db.close();
  });
});
