import { describe, expect, it } from "vitest";
import * as engine from "./index.ts";
import {
  STEPS_PER_SECOND,
  stepsToMs,
  type ClientMessage,
  type GameEvent,
  type RecordedFlapSource,
  type ReplayEventsResult,
  type ServerMessage,
} from "./index.ts";

describe("package root", () => {
  it("exports the protocol helpers", () => {
    expect(engine.MAX_BATCH).toBe(500);
    expect(engine.MAX_EVENTS_PER_GAME).toBe(20000);
    expect(engine.MAX_ID_LENGTH).toBe(64);
    expect(typeof engine.parseClientMessage).toBe("function");
    expect(typeof engine.flapStepsFromEvents).toBe("function");
    expect(typeof engine.replayEvents).toBe("function");
    expect(typeof engine.contiguousUpTo).toBe("function");

    // Types are exported too (checked by `tsc`).
    const source: RecordedFlapSource = "script";
    const event: GameEvent = { seq: 0, step: 0, type: "flap", source };
    const msg: ClientMessage = { type: "events", gameId: "g", events: [event] };
    const reply: ServerMessage = { type: "ack", gameId: "g", upTo: 0 };
    const result: ReplayEventsResult = engine.replayEvents(42, msg.events);
    expect(engine.parseClientMessage(msg)).toEqual(msg);
    expect(reply.type).toBe("ack");
    expect(result.pressCount).toBe(1);
  });
});

describe("stepsToMs", () => {
  it("maps one second of steps to 1000 ms", () => {
    expect(stepsToMs(STEPS_PER_SECOND)).toBe(1000);
  });

  it("maps zero steps to zero", () => {
    expect(stepsToMs(0)).toBe(0);
  });
});
