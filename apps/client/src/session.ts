import type { Action } from './input.ts';
import type { GameState } from '@flappy/engine';

export type Phase = 'ready' | 'playing' | 'paused' | 'over';
export type SessionAction = Action | { type: 'restart' };
export interface Session {
  phase: Phase;
  seed: number;
  game: GameState;
  flaps: number[];
}
export interface Snapshot {
  phase: Phase;
  seed: number;
  step: number;
  score: number;
  death: GameState['death'];
  flapCount: number;
}
export function createSession(_o: { seed: number; script?: number[]; nextSeed?: () => number }): Session {
  throw new Error('not implemented');
}
export function handle(_s: Session, _a: SessionAction): Session {
  throw new Error('not implemented');
}
export function tick(_s: Session): Session {
  throw new Error('not implemented');
}
export function snapshot(_s: Session): Snapshot {
  throw new Error('not implemented');
}
