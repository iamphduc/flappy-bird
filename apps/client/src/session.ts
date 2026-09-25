import { createGame, step, type GameEvent, type GameState, type RecordedFlapSource } from '@flappy/engine';
import type { Action } from './input.ts';

/** A `GameEvent` before its seq is given out. */
type NewEvent = DistributiveOmit<GameEvent, 'seq'>;
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export type Phase = 'ready' | 'playing' | 'paused' | 'over';

export type SessionAction = Action | { type: 'restart' };

export interface SessionOptions {
  seed: number;
  /** Step numbers to flap on. A scripted session starts by itself and ignores player flaps. */
  script?: number[];
  /** Seed for the next game after a restart. Defaults to a fixed mix of the current seed. */
  nextSeed?: (current: number) => number;
}

/** One play session around the engine. Plain data; every function returns a new session. */
export interface Session {
  phase: Phase;
  seed: number;
  game: GameState;
  /** Step numbers the bird flapped on, in order. */
  flaps: number[];
  /** Server game id for this game, or null when it is not recorded. */
  gameId: string | null;
  /** Recorded events of the current game, seq contiguous from 0. */
  events: GameEvent[];
  /** Flap presses waiting for the next tick, in order. Each becomes its own flap event. */
  pendingPresses: RecordedFlapSource[];
  script: ReadonlySet<number> | null;
  nextSeed: (current: number) => number;
}

/** Read-only view for the dev hook and overlays. */
export interface Snapshot {
  phase: Phase;
  seed: number;
  step: number;
  score: number;
  death: GameState['death'];
  flapCount: number;
}

export function createSession({ seed, script, nextSeed }: SessionOptions): Session {
  return {
    phase: 'ready',
    seed,
    game: createGame(seed),
    flaps: [],
    gameId: null,
    events: [],
    pendingPresses: [],
    script: script ? new Set(script) : null,
    nextSeed: nextSeed ?? mixSeed,
  };
}

export function handle(session: Session, action: SessionAction): Session {
  switch (action.type) {
    case 'restart':
      return restart(session);
    case 'pause':
      // Pausing drops pending presses; they were never applied, so they are never recorded.
      if (session.phase === 'playing') {
        return { ...record(session, { step: session.game.step, type: 'pause' }), phase: 'paused', pendingPresses: [] };
      }
      if (session.phase === 'paused') {
        return { ...record(session, { step: session.game.step, type: 'resume' }), phase: 'playing' };
      }
      return session;
    case 'flap':
      if (session.phase === 'over') return restart(session);
      if (session.script) return session;
      if (session.phase === 'ready') {
        const started = record(session, { step: 0, type: 'start' });
        return { ...started, phase: 'playing', pendingPresses: [action.source] };
      }
      if (session.phase === 'playing') {
        return { ...session, pendingPresses: [...session.pendingPresses, action.source] };
      }
      return session;
  }
}

/** Runs one engine step while playing. A scripted session also starts itself from ready. */
export function tick(session: Session): Session {
  let s = session;
  if (s.phase === 'ready' && s.script) s = { ...record(s, { step: 0, type: 'start' }), phase: 'playing' };
  if (s.phase !== 'playing') return s;

  // Presses are stamped with the step they are applied on; the engine gets one flap for them all.
  const at = s.game.step;
  const presses: RecordedFlapSource[] = s.script ? (s.script.has(at) ? ['script'] : []) : s.pendingPresses;
  for (const source of presses) s = record(s, { step: at, type: 'flap', source });

  const flap = presses.length > 0;
  const game = step(s.game, { flap });
  s = {
    ...s,
    game,
    flaps: flap ? [...s.flaps, at] : s.flaps,
    pendingPresses: [],
    phase: game.death === null ? 'playing' : 'over',
  };
  if (game.death !== null) {
    s = record(s, { step: game.death.step, type: 'death', cause: game.death.cause, score: game.score });
  }
  return s;
}

/** Gives a server game to a session that has not started yet; otherwise returns it unchanged. */
export function assignGame(session: Session, { gameId, seed }: { gameId: string; seed: number }): Session {
  if (session.phase !== 'ready' || session.events.length > 0) return session;
  return { ...session, gameId, seed, game: createGame(seed) };
}

export function snapshot(session: Session): Snapshot {
  return {
    phase: session.phase,
    seed: session.seed,
    step: session.game.step,
    score: session.game.score,
    death: session.game.death,
    flapCount: session.flaps.length,
  };
}

function restart(session: Session): Session {
  // A scripted run keeps its seed, since its flap list only fits that seed.
  const seed = session.script ? session.seed : session.nextSeed(session.seed);
  return {
    ...session,
    phase: 'ready',
    seed,
    game: createGame(seed),
    flaps: [],
    gameId: null,
    events: [],
    pendingPresses: [],
  };
}

/** Appends an event with the next seq. */
function record(session: Session, event: NewEvent): Session {
  const seq = session.events.length;
  return { ...session, events: [...session.events, { ...event, seq } as GameEvent] };
}

/** Deterministic uint32 mix, used only when no nextSeed is given. */
function mixSeed(seed: number): number {
  return (Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) + 1) >>> 0;
}
