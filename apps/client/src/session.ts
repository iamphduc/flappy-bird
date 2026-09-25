import { createGame, step, type GameState } from '@flappy/engine';
import type { Action } from './input.ts';

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
  /** A player flap waiting for the next tick. */
  pendingFlap: boolean;
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
    pendingFlap: false,
    script: script ? new Set(script) : null,
    nextSeed: nextSeed ?? mixSeed,
  };
}

export function handle(session: Session, action: SessionAction): Session {
  switch (action.type) {
    case 'restart':
      return restart(session);
    case 'pause':
      if (session.phase === 'playing') return { ...session, phase: 'paused', pendingFlap: false };
      if (session.phase === 'paused') return { ...session, phase: 'playing' };
      return session;
    case 'flap':
      if (session.phase === 'over') return restart(session);
      if (session.script) return session;
      if (session.phase === 'ready') return { ...session, phase: 'playing', pendingFlap: true };
      if (session.phase === 'playing') return { ...session, pendingFlap: true };
      return session;
  }
}

/** Runs one engine step while playing. A scripted session also starts itself from ready. */
export function tick(session: Session): Session {
  let s = session;
  if (s.phase === 'ready' && s.script) s = { ...s, phase: 'playing' };
  if (s.phase !== 'playing') return s;

  const flap = s.script ? s.script.has(s.game.step) : s.pendingFlap;
  const game = step(s.game, { flap });
  return {
    ...s,
    game,
    flaps: flap ? [...s.flaps, s.game.step] : s.flaps,
    pendingFlap: false,
    phase: game.death === null ? 'playing' : 'over',
  };
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
    pendingFlap: false,
  };
}

/** Deterministic uint32 mix, used only when no nextSeed is given. */
function mixSeed(seed: number): number {
  return (Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) + 1) >>> 0;
}
