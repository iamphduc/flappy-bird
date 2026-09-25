import { afterEach, describe, expect, it } from "vitest";
import type { GameEvent, ServerMessage } from "@flappy/engine";
import { buildApp } from "./app.ts";
import { getGame, getGameEvents, insertGame, insertPlayer, openDb, type Db } from "./db.ts";

const LOCKED_FLAPS = [13, 52, 90, 128, 166, 199, 237];

function lockedRun(): GameEvent[] {
  return [
    { seq: 0, step: 0, type: "start" },
    ...LOCKED_FLAPS.map((step, i): GameEvent => ({ seq: i + 1, step, type: "flap", source: "script" })),
    { seq: 8, step: 296, type: "death", cause: "ground", score: 2 },
  ];
}

type App = ReturnType<typeof buildApp>;
const apps: App[] = [];

function setup(): { app: App; db: Db } {
  const db = openDb(":memory:");
  insertPlayer(db, { id: "p1", nickname: "Ann", createdAt: 1 });
  insertGame(db, { id: "g1", playerId: "p1", seed: 42, seedSource: "dev", createdAt: 1 });
  const app = buildApp({ db, devSeeds: true });
  apps.push(app);
  return { app, db };
}

/** Opens an in-process socket and queues every message it receives. */
async function connect(app: App) {
  const queue: ServerMessage[] = [];
  const waiters: ((msg: ServerMessage) => void)[] = [];
  const ws = await app.injectWS("/api/ws", {}, {
    onInit(socket) {
      socket.on("message", (data) => {
        const msg = JSON.parse(data.toString()) as ServerMessage;
        const waiter = waiters.shift();
        if (waiter) waiter(msg);
        else queue.push(msg);
      });
    },
  });
  return {
    ws,
    send(value: unknown) {
      ws.send(typeof value === "string" ? value : JSON.stringify(value));
    },
    next(): Promise<ServerMessage> {
      const queued = queue.shift();
      if (queued) return Promise.resolve(queued);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("no message within 2 s")), 2000);
        waiters.push((msg) => {
          clearTimeout(timer);
          resolve(msg);
        });
      });
    },
  };
}

afterEach(async () => {
  while (apps.length > 0) await apps.pop()!.close();
});

describe("websocket ingest", () => {
  it("hello is required", async () => {
    const { app, db } = setup();
    const client = await connect(app);
    client.send({ type: "events", gameId: "g1", events: lockedRun().slice(0, 2) });
    expect(await client.next()).toMatchObject({ type: "error", code: "hello-first" });

    client.send({ type: "hello", playerId: "ghost" });
    expect(await client.next()).toMatchObject({ type: "error", code: "unknown-player" });

    client.send({ type: "events", gameId: "g1", events: lockedRun().slice(0, 2) });
    expect(await client.next()).toMatchObject({ type: "error", code: "hello-first" });
    expect(getGameEvents(db, "g1")).toEqual([]);

    client.send({ type: "hello", playerId: "p1" });
    expect(await client.next()).toEqual({ type: "welcome" });
    client.ws.terminate();
  });

  it("events are acked", async () => {
    const { app, db } = setup();
    const client = await connect(app);
    client.send({ type: "hello", playerId: "p1" });
    expect(await client.next()).toEqual({ type: "welcome" });
    client.send({ type: "events", gameId: "g1", events: lockedRun().slice(0, 3) });
    expect(await client.next()).toEqual({ type: "ack", gameId: "g1", upTo: 2 });
    expect(getGameEvents(db, "g1")).toHaveLength(3);
    expect(getGame(db, "g1")?.status).toBe("open");
    client.ws.terminate();
  });

  it("ingest errors are sent back", async () => {
    const { app, db } = setup();
    insertPlayer(db, { id: "p2", nickname: "Bob", createdAt: 1 });
    const client = await connect(app);
    client.send({ type: "hello", playerId: "p2" });
    await client.next();
    client.send({ type: "events", gameId: "g1", events: lockedRun().slice(0, 2) });
    expect(await client.next()).toMatchObject({ type: "error", code: "not-your-game", gameId: "g1" });
    client.ws.terminate();
  });

  it("resend after reconnect has no duplicates", async () => {
    const { app, db } = setup();
    const events = lockedRun();
    const first = await connect(app);
    first.send({ type: "hello", playerId: "p1" });
    await first.next();
    first.send({ type: "events", gameId: "g1", events: events.slice(0, 5) });
    expect(await first.next()).toEqual({ type: "ack", gameId: "g1", upTo: 4 });
    first.ws.close();

    const second = await connect(app);
    second.send({ type: "hello", playerId: "p1" });
    await second.next();
    second.send({ type: "events", gameId: "g1", events });
    expect(await second.next()).toEqual({ type: "ack", gameId: "g1", upTo: 8 });
    expect(await second.next()).toMatchObject({ type: "result", status: "complete" });

    expect(getGameEvents(db, "g1").map((e) => e.seq)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(getGame(db, "g1")?.status).toBe("complete");
    second.ws.terminate();
  });

  it("finished game sends a result", async () => {
    const { app } = setup();
    const events = lockedRun();
    const client = await connect(app);
    client.send({ type: "hello", playerId: "p1" });
    await client.next();
    client.send({ type: "events", gameId: "g1", events: events.filter((e) => e.seq !== 4) });
    expect(await client.next()).toEqual({ type: "ack", gameId: "g1", upTo: 3 });

    client.send({ type: "events", gameId: "g1", events: [events[4]] });
    expect(await client.next()).toEqual({ type: "ack", gameId: "g1", upTo: 8 });
    expect(await client.next()).toEqual({
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
    client.ws.terminate();
  });

  it("bad messages do not close the socket", async () => {
    const { app } = setup();
    const client = await connect(app);
    client.send("not json {");
    expect(await client.next()).toMatchObject({ type: "error", code: "bad-message" });
    client.send({ type: "hello" });
    expect(await client.next()).toMatchObject({ type: "error", code: "bad-message" });
    client.send({ type: "hello", playerId: "p1" });
    expect(await client.next()).toEqual({ type: "welcome" });
    client.send({ type: "events", gameId: "g1", events: [{ seq: 0, step: 0, type: "keyA" }] });
    expect(await client.next()).toMatchObject({ type: "error", code: "bad-message" });
    client.send({ type: "events", gameId: "g1", events: lockedRun().slice(0, 1) });
    expect(await client.next()).toEqual({ type: "ack", gameId: "g1", upTo: 0 });
    client.ws.terminate();
  });

  it("a server failure is reported and does not crash the server", async () => {
    const { app, db } = setup();
    const client = await connect(app);
    client.send({ type: "hello", playerId: "p1" });
    await client.next();
    db.exec("DROP TABLE events");
    client.send({ type: "events", gameId: "g1", events: lockedRun().slice(0, 1) });
    expect(await client.next()).toMatchObject({ type: "error", code: "server-error", gameId: "g1" });
    const health = await app.inject({ method: "GET", url: "/api/health" });
    expect(health.statusCode).toBe(200);
    client.ws.terminate();
  });
});
