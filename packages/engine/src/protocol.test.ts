import { describe, expect, it } from "vitest";
import { replay } from "./replay.ts";
import {
  MAX_BATCH,
  MAX_EVENTS_PER_GAME,
  contiguousUpTo,
  flapStepsFromEvents,
  parseClientMessage,
  replayEvents,
  type GameEvent,
} from "./protocol.ts";

const PLAYER_ID = "6f1c2a3e-1111-4222-8333-944455556666";
const GAME_ID = "0a1b2c3d-aaaa-4bbb-8ccc-dddd0000eeee";

function validEvents(): GameEvent[] {
  return [
    { seq: 0, step: 0, type: "start" },
    { seq: 1, step: 0, type: "flap", source: "space" },
    { seq: 2, step: 3, type: "flap", source: "click" },
    { seq: 3, step: 5, type: "flap", source: "tap" },
    { seq: 4, step: 6, type: "flap", source: "script" },
    { seq: 5, step: 10, type: "pause" },
    { seq: 6, step: 10, type: "resume" },
    { seq: 7, step: 40, type: "death", cause: "pipe-top", score: 1 },
  ];
}

function eventsMessage(events: unknown[]): unknown {
  return { type: "events", gameId: GAME_ID, events };
}

describe("parseClientMessage", () => {
  it("parses valid client messages", () => {
    const hello = { type: "hello", playerId: PLAYER_ID };
    expect(parseClientMessage(hello)).toEqual(hello);

    const events = { type: "events", gameId: GAME_ID, events: validEvents() };
    expect(parseClientMessage(JSON.parse(JSON.stringify(events)))).toEqual(events);

    for (const cause of ["ground", "pipe-top", "pipe-bottom"]) {
      const msg = eventsMessage([{ seq: 0, step: 9, type: "death", cause, score: 0 }]);
      expect(parseClientMessage(msg)).toEqual(msg);
    }

    const full = eventsMessage(
      Array.from({ length: MAX_BATCH }, (_, i) => ({ seq: i, step: i, type: "pause" })),
    );
    expect(parseClientMessage(full)).toEqual(full);

    const lastSeq = eventsMessage([{ seq: MAX_EVENTS_PER_GAME - 1, step: 0, type: "resume" }]);
    expect(parseClientMessage(lastSeq)).toEqual(lastSeq);
  });

  it("rejects bad client messages", () => {
    const flap = { seq: 1, step: 2, type: "flap", source: "space" };
    const bad: unknown[] = [
      // Non-object input.
      null,
      undefined,
      42,
      "hello",
      true,
      [],
      [{ type: "hello", playerId: PLAYER_ID }],
      // Unknown or missing message type.
      { type: "bye", playerId: PLAYER_ID },
      { playerId: PLAYER_ID },
      // Bad ids.
      { type: "hello" },
      { type: "hello", playerId: 7 },
      { type: "hello", playerId: "" },
      { type: "hello", playerId: "x".repeat(65) },
      { type: "events", events: [flap] },
      { type: "events", gameId: "", events: [flap] },
      { type: "events", gameId: "x".repeat(65), events: [flap] },
      // Bad batch.
      { type: "events", gameId: GAME_ID },
      { type: "events", gameId: GAME_ID, events: "nope" },
      eventsMessage([]),
      eventsMessage(
        Array.from({ length: MAX_BATCH + 1 }, (_, i) => ({ seq: i, step: i, type: "pause" })),
      ),
      // Bad events.
      eventsMessage([null]),
      eventsMessage(["flap"]),
      eventsMessage([{ ...flap, type: "jump" }]),
      eventsMessage([{ seq: 1, step: 2, type: "flap" }]),
      eventsMessage([{ ...flap, source: "keyA" }]),
      eventsMessage([{ seq: 3, step: 9, type: "death", cause: "lava", score: 0 }]),
      eventsMessage([{ seq: 3, step: 9, type: "death", score: 0 }]),
      eventsMessage([{ seq: 3, step: 9, type: "death", cause: "ground" }]),
      eventsMessage([{ seq: 3, step: 9, type: "death", cause: "ground", score: -1 }]),
      eventsMessage([{ seq: 3, step: 9, type: "death", cause: "ground", score: 1.5 }]),
      eventsMessage([{ ...flap, seq: -1 }]),
      eventsMessage([{ ...flap, seq: 1.5 }]),
      eventsMessage([{ ...flap, seq: "1" }]),
      eventsMessage([{ ...flap, seq: Number.NaN }]),
      eventsMessage([{ ...flap, seq: Number.POSITIVE_INFINITY }]),
      eventsMessage([{ ...flap, seq: MAX_EVENTS_PER_GAME }]),
      eventsMessage([{ ...flap, step: -1 }]),
      eventsMessage([{ ...flap, step: 0.5 }]),
      eventsMessage([{ type: "start", step: 0 }]),
      eventsMessage([{ type: "start", seq: 0 }]),
      // One bad event spoils the batch.
      eventsMessage([...validEvents(), { ...flap, source: "keyA" }]),
    ];
    for (const raw of bad) {
      expect(parseClientMessage(raw), JSON.stringify(raw) ?? String(raw)).toBeNull();
    }
  });

  it("drops unknown fields", () => {
    const parsed = parseClientMessage({
      type: "events",
      gameId: GAME_ID,
      extra: "top",
      events: [
        { seq: 0, step: 0, type: "start", source: "space", junk: 1 },
        { seq: 1, step: 0, type: "flap", source: "click", cause: "ground", score: 9 },
        { seq: 2, step: 4, type: "pause", x: { deep: true } },
        { seq: 3, step: 8, type: "death", cause: "ground", score: 0, source: "tap" },
      ],
    });
    expect(parsed).toEqual({
      type: "events",
      gameId: GAME_ID,
      events: [
        { seq: 0, step: 0, type: "start" },
        { seq: 1, step: 0, type: "flap", source: "click" },
        { seq: 2, step: 4, type: "pause" },
        { seq: 3, step: 8, type: "death", cause: "ground", score: 0 },
      ],
    });
    // toEqual ignores undefined properties, so check the keys too.
    const events = (parsed as { events: object[] }).events;
    expect(Object.keys(parsed as object).sort()).toEqual(["events", "gameId", "type"]);
    expect(Object.keys(events[0]!).sort()).toEqual(["seq", "step", "type"]);
    expect(Object.keys(events[1]!).sort()).toEqual(["seq", "source", "step", "type"]);

    expect(parseClientMessage({ type: "hello", playerId: PLAYER_ID, token: "x" })).toEqual({
      type: "hello",
      playerId: PLAYER_ID,
    });
    expect(
      Object.keys(parseClientMessage({ type: "hello", playerId: PLAYER_ID, token: "x" })!),
    ).toEqual(["type", "playerId"]);
  });
});

describe("flapStepsFromEvents", () => {
  it("flapStepsFromEvents keeps distinct flap steps", () => {
    const events: GameEvent[] = [
      { seq: 0, step: 0, type: "start" },
      { seq: 1, step: 30, type: "flap", source: "space" },
      { seq: 2, step: 5, type: "flap", source: "click" },
      { seq: 3, step: 30, type: "flap", source: "tap" },
      { seq: 4, step: 12, type: "pause" },
      { seq: 5, step: 12, type: "resume" },
      { seq: 6, step: 5, type: "flap", source: "space" },
      { seq: 7, step: 99, type: "death", cause: "ground", score: 0 },
    ];
    expect(flapStepsFromEvents(events)).toEqual([5, 30]);
    expect(flapStepsFromEvents([])).toEqual([]);
    expect(flapStepsFromEvents([{ seq: 0, step: 0, type: "start" }])).toEqual([]);
    // Numeric sort, not string sort.
    expect(
      flapStepsFromEvents([
        { seq: 0, step: 100, type: "flap", source: "script" },
        { seq: 1, step: 9, type: "flap", source: "script" },
      ]),
    ).toEqual([9, 100]);
  });
});

describe("replayEvents", () => {
  it("replayEvents matches the locked regression run", () => {
    const flaps = [13, 52, 52, 90, 128, 166, 199, 237];
    const events: GameEvent[] = [
      { seq: 0, step: 0, type: "start" },
      ...flaps.map((step, i): GameEvent => ({ seq: i + 1, step, type: "flap", source: "space" })),
      { seq: 9, step: 296, type: "death", cause: "ground", score: 2 },
    ];
    const r = replayEvents(42, events);
    expect({
      score: r.score,
      deathStep: r.deathStep,
      deathCause: r.deathCause,
      flapCount: r.flapCount,
      pressCount: r.pressCount,
    }).toEqual({ score: 2, deathStep: 296, deathCause: "ground", flapCount: 7, pressCount: 8 });
    expect(r.finalState).toEqual(replay(42, [13, 52, 90, 128, 166, 199, 237]).finalState);
  });

  it("ignores the client's claimed death", () => {
    const r = replayEvents(42, [
      { seq: 0, step: 0, type: "start" },
      { seq: 1, step: 13, type: "flap", source: "click" },
      { seq: 2, step: 1000, type: "death", cause: "pipe-top", score: 99 },
    ]);
    const expected = replay(42, [13]);
    expect(r.score).toBe(expected.score);
    expect(r.deathStep).toBe(expected.deathStep);
    expect(r.deathCause).toBe(expected.deathCause);
    expect(r.pressCount).toBe(1);
  });
});

describe("contiguousUpTo", () => {
  it("contiguousUpTo stops at the first gap", () => {
    expect(contiguousUpTo([])).toBe(-1);
    expect(contiguousUpTo(new Set([0, 1, 3]))).toBe(1);
    expect(contiguousUpTo([0, 1, 2, 3])).toBe(3);
    expect(contiguousUpTo([3, 1, 0, 2])).toBe(3);
    expect(contiguousUpTo([1, 2, 3])).toBe(-1);
    expect(contiguousUpTo([0, 0, 1, 1])).toBe(1);
  });
});
