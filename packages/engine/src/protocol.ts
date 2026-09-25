// Event and message contract shared by the client recorder and the server ingest.
// Pure TypeScript: no DOM, no Node APIs, no wall-clock time.
import type { DeathCause } from "./game.ts";
import { replay, type ReplayResult } from "./replay.ts";

/** Most events one `events` message may carry. */
export const MAX_BATCH = 500;
/** Most events one game may have; every seq must be below this. */
export const MAX_EVENTS_PER_GAME = 20000;
/** Longest player or game id accepted. */
export const MAX_ID_LENGTH = 64;

export type RecordedFlapSource = "space" | "click" | "tap" | "script";

const FLAP_SOURCES: readonly RecordedFlapSource[] = ["space", "click", "tap", "script"];
const DEATH_CAUSES: readonly DeathCause[] = ["ground", "pipe-top", "pipe-bottom"];

/**
 * One recorded game event. `seq` is per game, contiguous from 0; `step` is the
 * engine step the event happened on (`start` is always step 0).
 */
export type GameEvent = { seq: number; step: number } & (
  | { type: "start" }
  | { type: "flap"; source: RecordedFlapSource }
  | { type: "pause" }
  | { type: "resume" }
  /** The client's claim; stored only to spot drift, never trusted. */
  | { type: "death"; cause: DeathCause; score: number }
);

export type ClientMessage =
  | { type: "hello"; playerId: string }
  | { type: "events"; gameId: string; events: GameEvent[] };

export type ServerMessage =
  | { type: "welcome" }
  /** `upTo`: highest seq n such that 0..n are all stored, -1 if none. */
  | { type: "ack"; gameId: string; upTo: number }
  | {
      type: "result";
      gameId: string;
      status: "complete";
      score: number;
      deathStep: number;
      deathCause: DeathCause;
      flapCount: number;
      pressCount: number;
      mismatch: boolean;
    }
  | { type: "error"; code: string; message: string; gameId?: string };

export type ReplayEventsResult = ReplayResult & {
  /** Number of flap events (raw presses), counting several per step. */
  pressCount: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_ID_LENGTH;
}

function isOneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (list as readonly string[]).includes(value);
}

/** Validates one event and copies only its known fields, or returns null. */
function parseEvent(raw: unknown): GameEvent | null {
  if (!isRecord(raw)) return null;
  const { seq, step, type } = raw;
  if (!isCount(seq) || seq >= MAX_EVENTS_PER_GAME || !isCount(step)) return null;
  switch (type) {
    case "start":
    case "pause":
    case "resume":
      return { seq, step, type };
    case "flap":
      return isOneOf(FLAP_SOURCES, raw.source) ? { seq, step, type, source: raw.source } : null;
    case "death":
      return isOneOf(DEATH_CAUSES, raw.cause) && isCount(raw.score)
        ? { seq, step, type, cause: raw.cause, score: raw.score }
        : null;
    default:
      return null;
  }
}

/**
 * Strictly validates an already-parsed JSON value as a client message.
 * Returns a fresh object holding only the known fields, or null if anything is off.
 */
export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (!isRecord(raw)) return null;
  if (raw.type === "hello") {
    return isId(raw.playerId) ? { type: "hello", playerId: raw.playerId } : null;
  }
  if (raw.type === "events") {
    const { gameId, events } = raw;
    if (!isId(gameId) || !Array.isArray(events)) return null;
    if (events.length === 0 || events.length > MAX_BATCH) return null;
    const parsed: GameEvent[] = [];
    for (const item of events) {
      const event = parseEvent(item);
      if (event === null) return null;
      parsed.push(event);
    }
    return { type: "events", gameId, events: parsed };
  }
  return null;
}

/** Sorted, distinct steps of the flap events; other events are ignored. */
export function flapStepsFromEvents(events: readonly GameEvent[]): number[] {
  const steps = new Set<number>();
  for (const event of events) {
    if (event.type === "flap") steps.add(event.step);
  }
  return [...steps].sort((a, b) => a - b);
}

/**
 * Replays a recorded game with the engine. Client and server both use this,
 * so their results can only differ if their events differ.
 */
export function replayEvents(seed: number, events: readonly GameEvent[]): ReplayEventsResult {
  const pressCount = events.filter((event) => event.type === "flap").length;
  return { ...replay(seed, flapStepsFromEvents(events)), pressCount };
}

/** Highest n such that 0..n are all in `seqs`, or -1 if 0 is missing. */
export function contiguousUpTo(seqs: Iterable<number>): number {
  const have = new Set(seqs);
  let upTo = -1;
  while (have.has(upTo + 1)) upTo += 1;
  return upTo;
}
