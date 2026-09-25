// Pure game logic: one fixed step at a time, no DOM, Node or clock APIs.
import {
  BIRD_SIZE,
  BIRD_START_Y,
  BIRD_X,
  FIRST_PIPE_X,
  FLAP_VELOCITY,
  GAP_CENTER_MAX,
  GAP_CENTER_MIN,
  GRAVITY,
  GROUND_Y,
  MAX_FALL_SPEED,
  PIPE_GAP,
  PIPE_SPACING,
  PIPE_SPEED,
  PIPE_WIDTH,
  WORLD_WIDTH,
} from "./constants.ts";
import { nextFloat, seedRng } from "./rng.ts";

export type DeathCause = "ground" | "pipe-top" | "pipe-bottom";

export interface Pipe {
  /** Left edge. */
  x: number;
  /** Center of the gap between the top and bottom pipe. */
  gapY: number;
  /** True once the bird has passed this pipe and got its point. */
  scored: boolean;
}

export interface Bird {
  /** Top edge of the hitbox. */
  y: number;
  /** Vertical speed in pixels per step (negative is up). */
  vy: number;
}

/** Whole game state. Plain data, safe to JSON round-trip. */
export interface GameState {
  step: number;
  bird: Bird;
  pipes: Pipe[];
  score: number;
  /** PRNG state (uint32). */
  rng: number;
  death: null | { step: number; cause: DeathCause };
}

export interface StepInput {
  flap: boolean;
}

/** Returns the step-0 state for a seed. */
export function createGame(seed: number): GameState {
  const first = newPipe(FIRST_PIPE_X, seedRng(seed));
  return {
    step: 0,
    bird: { y: BIRD_START_Y, vy: 0 },
    pipes: [first.pipe],
    score: 0,
    rng: first.rng,
    death: null,
  };
}

/** Advances the game by one step. Never mutates `state`. */
export function step(state: GameState, input: StepInput): GameState {
  if (state.death !== null) return state;
  const stepNo = state.step + 1;

  // Bird.
  let vy = input.flap ? FLAP_VELOCITY : Math.min(state.bird.vy + GRAVITY, MAX_FALL_SPEED);
  let y = state.bird.y + vy;
  if (y < 0) {
    y = 0;
    vy = 0;
  }

  // Pipes: move, drop off-screen ones, score passed ones, spawn new ones.
  let score = state.score;
  const pipes: Pipe[] = [];
  for (const p of state.pipes) {
    const x = p.x - PIPE_SPEED;
    if (x + PIPE_WIDTH < 0) continue;
    const passed = x + PIPE_WIDTH < BIRD_X;
    if (passed && !p.scored) score += 1;
    pipes.push({ x, gapY: p.gapY, scored: p.scored || passed });
  }
  let rng = state.rng;
  for (;;) {
    const last = pipes[pipes.length - 1];
    const nextX = last ? last.x + PIPE_SPACING : FIRST_PIPE_X;
    if (last && nextX > WORLD_WIDTH + PIPE_WIDTH) break;
    const made = newPipe(nextX, rng);
    pipes.push(made.pipe);
    rng = made.rng;
  }

  const cause = collision(y, pipes);
  return {
    step: stepNo,
    bird: { y, vy },
    pipes,
    score,
    rng,
    death: cause === null ? null : { step: stepNo, cause },
  };
}

function newPipe(x: number, rng: number): { pipe: Pipe; rng: number } {
  const r = nextFloat(rng);
  const gapY = GAP_CENTER_MIN + Math.floor(r.value * (GAP_CENTER_MAX - GAP_CENTER_MIN + 1));
  return { pipe: { x, gapY, scored: false }, rng: r.state };
}

function collision(y: number, pipes: Pipe[]): DeathCause | null {
  for (const p of pipes) {
    const overlapsX = BIRD_X < p.x + PIPE_WIDTH && BIRD_X + BIRD_SIZE > p.x;
    if (!overlapsX) continue;
    if (y < p.gapY - PIPE_GAP / 2) return "pipe-top";
    if (y + BIRD_SIZE > p.gapY + PIPE_GAP / 2) return "pipe-bottom";
  }
  if (y + BIRD_SIZE >= GROUND_Y) return "ground";
  return null;
}
