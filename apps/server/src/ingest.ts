// Event ingest: store each event once, ack, replay finished games, sweep idle ones.
// Pure DB logic (no Fastify), so it is tested without sockets.
import {
  contiguousUpTo,
  DEFAULT_MAX_STEPS,
  flapStepsFromEvents,
  replay,
  STEPS_PER_SECOND,
  type GameEvent,
  type ServerMessage,
} from "@flappy/engine";
import { getGame, getGameEvents, type Db, type StoredEvent } from "./db.ts";

/** Longest game the server will replay: one hour of game time. */
export const MAX_REPLAY_STEPS = STEPS_PER_SECOND * 60 * 60;

export interface IngestInput {
  playerId: string;
  gameId: string;
  events: GameEvent[];
  now: number;
  /** Replay step limit; defaults to MAX_REPLAY_STEPS (tests lower it). */
  maxReplaySteps?: number;
}

export type IngestOutcome = { ack: ServerMessage; result?: ServerMessage } | { error: ServerMessage };

function errorOf(code: string, message: string, gameId: string): { error: ServerMessage } {
  return { error: { type: "error", code, message, gameId } };
}

function storedSeqs(db: Db, gameId: string): number[] {
  const rows = db.prepare("SELECT seq FROM events WHERE game_id = ?").all(gameId) as { seq: number }[];
  return rows.map((row) => row.seq);
}

function storedDeathSeq(db: Db, gameId: string): number | null {
  const row = db
    .prepare("SELECT MIN(seq) AS seq FROM events WHERE game_id = ? AND type = 'death'")
    .get(gameId) as { seq: number | null };
  return row.seq;
}

function toGameEvent(event: StoredEvent): GameEvent {
  const base = { seq: event.seq, step: event.step };
  switch (event.type) {
    case "flap":
      return { ...base, type: "flap", source: event.source as "space" };
    case "death":
      return { ...base, type: "death", cause: event.cause as "ground", score: event.score ?? 0 };
    default:
      return { ...base, type: event.type as "start" | "pause" | "resume" };
  }
}

function inTransaction<T>(db: Db, work: () => T): T {
  db.exec("BEGIN");
  try {
    const value = work();
    db.exec("COMMIT");
    return value;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/**
 * Stores a batch of events for one game and acks it. Resends are no-ops (the
 * first write for a seq wins). Completes the game once its death event and
 * every seq before it are stored.
 */
export function ingestEvents(db: Db, { playerId, gameId, events, now, maxReplaySteps = MAX_REPLAY_STEPS }: IngestInput): IngestOutcome {
  const game = getGame(db, gameId);
  if (!game) return errorOf("unknown-game", "no such game", gameId);
  if (game.playerId !== playerId) return errorOf("not-your-game", "this game belongs to another player", gameId);

  const ack = (): ServerMessage => ({ type: "ack", gameId, upTo: contiguousUpTo(storedSeqs(db, gameId)) });
  if (game.status === "complete") return { ack: ack() };

  return inTransaction(db, () => {
    // Nothing may be stored past the (first) death: check against both the
    // stored death and any new death in this batch.
    const stored = new Set(storedSeqs(db, gameId));
    const fresh = events.filter((event) => !stored.has(event.seq));
    const deaths = [storedDeathSeq(db, gameId), ...fresh.filter((e) => e.type === "death").map((e) => e.seq)];
    const deathSeq = Math.min(...deaths.filter((seq): seq is number => seq !== null));
    const highest = Math.max(-1, ...stored, ...fresh.map((e) => e.seq));
    if (highest > deathSeq) return errorOf("after-death", "events after the death event are not accepted", gameId);

    const insert = db.prepare(
      "INSERT OR IGNORE INTO events (game_id, seq, step, type, source, cause, score, received_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    );
    let added = 0;
    for (const event of fresh) {
      const source = event.type === "flap" ? event.source : null;
      const cause = event.type === "death" ? event.cause : null;
      const score = event.type === "death" ? event.score : null;
      added += Number(insert.run(gameId, event.seq, event.step, event.type, source, cause, score, now).changes);
    }
    if (added > 0) {
      db.prepare(
        "UPDATE games SET last_event_at = ?, status = CASE WHEN status IN ('created', 'incomplete') THEN 'open' ELSE status END WHERE id = ?",
      ).run(now, gameId);
    }

    const result = finalize(db, gameId, game.seed, maxReplaySteps);
    return result ? { ack: ack(), result } : { ack: ack() };
  });
}

/** Replays and completes the game if its death and every seq before it are stored. */
function finalize(db: Db, gameId: string, seed: number, maxReplaySteps: number): ServerMessage | undefined {
  const deathSeq = storedDeathSeq(db, gameId);
  if (deathSeq === null || contiguousUpTo(storedSeqs(db, gameId)) < deathSeq) return undefined;

  const events = getGameEvents(db, gameId).map(toGameEvent);
  const claim = events[deathSeq];
  if (claim?.type !== "death") return undefined;

  // Same as replayEvents, but long games (past the engine's 10 min default)
  // replay up to the claimed death, never past maxReplaySteps.
  const maxSteps = Math.min(Math.max(claim.step + 1, DEFAULT_MAX_STEPS), maxReplaySteps);
  const run = replay(seed, flapStepsFromEvents(events), maxSteps);
  const pressCount = events.filter((event) => event.type === "flap").length;
  const mismatch = run.deathStep !== claim.step || run.score !== claim.score;

  db.prepare(
    `UPDATE games SET status = 'complete', score = ?, death_step = ?, death_cause = ?, flap_count = ?, press_count = ?,
       client_score = ?, client_death_step = ?, mismatch = ? WHERE id = ?`,
  ).run(
    run.score,
    run.deathStep,
    run.deathCause,
    run.flapCount,
    pressCount,
    claim.score,
    claim.step,
    mismatch ? 1 : 0,
    gameId,
  );

  // The bird was still alive when the replay stopped: stored as a mismatch,
  // but there is no death to report.
  if (run.deathStep === null || run.deathCause === null) return undefined;
  return {
    type: "result",
    gameId,
    status: "complete",
    score: run.score,
    deathStep: run.deathStep,
    deathCause: run.deathCause,
    flapCount: run.flapCount,
    pressCount,
    mismatch,
  };
}

/** Marks open games with no new event for more than `timeoutMs` as incomplete. */
export function sweepIdle(db: Db, now: number, timeoutMs: number): void {
  db.prepare("UPDATE games SET status = 'incomplete' WHERE status = 'open' AND last_event_at < ?").run(now - timeoutMs);
}

export interface SweeperOptions {
  timeoutMs: number;
  /** Default: half the timeout, at most 30 s. */
  intervalMs?: number;
  /** Clock, injectable for tests. Default Date.now. */
  now?: () => number;
}

/** Runs sweepIdle on an interval. Returns a function that stops it. */
export function startSweeper(db: Db, { timeoutMs, intervalMs, now = Date.now }: SweeperOptions): () => void {
  const every = intervalMs ?? Math.min(30_000, timeoutMs / 2);
  const timer = setInterval(() => {
    try {
      sweepIdle(db, now(), timeoutMs);
    } catch {
      // DB closed or busy: try again next tick.
    }
  }, every);
  timer.unref?.();
  return () => clearInterval(timer);
}
