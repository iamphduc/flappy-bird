import {
  BIRD_SIZE,
  BIRD_X,
  GROUND_HEIGHT,
  GROUND_Y,
  PIPE_GAP,
  PIPE_WIDTH,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type DeathCause,
  type GameState,
} from '@flappy/engine';
import type { Phase } from './session.ts';

const COLORS = {
  sky: '#70c5ce',
  pipe: '#5ec639',
  pipeEdge: '#3d8a22',
  ground: '#ded895',
  grass: '#8bd24a',
  bird: '#f8d64e',
  birdEdge: '#b8860b',
  eye: '#fff',
  pupil: '#222',
  beak: '#f07c28',
  text: '#fff',
  textEdge: '#333',
  shade: 'rgba(0, 0, 0, 0.35)',
};

const CAUSE_TEXT: Record<DeathCause, string> = {
  ground: 'Hit the ground',
  'pipe-top': 'Hit the top pipe',
  'pipe-bottom': 'Hit the bottom pipe',
};

/** Draws one frame: world, score and the overlay for the current phase. */
export function render(ctx: CanvasRenderingContext2D, game: GameState, phase: Phase): void {
  ctx.fillStyle = COLORS.sky;
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

  for (const pipe of game.pipes) drawPipe(ctx, pipe.x, pipe.gapY);
  drawGround(ctx, game.step);
  drawBird(ctx, game.bird.y, game.bird.vy);

  if (phase !== 'ready') outlinedText(ctx, String(game.score), WORLD_WIDTH / 2, 60, 40);

  if (phase === 'ready') {
    overlay(ctx, ['Flappy Bird', 'Press Space / click / tap', 'P or Esc to pause']);
  } else if (phase === 'paused') {
    overlay(ctx, ['Paused', 'P or Esc to resume']);
  } else if (phase === 'over') {
    const cause = game.death ? CAUSE_TEXT[game.death.cause] : '';
    overlay(ctx, ['Game over', `Score: ${game.score}`, cause, 'Flap to restart']);
  }
}

function drawPipe(ctx: CanvasRenderingContext2D, x: number, gapY: number): void {
  const topEnd = gapY - PIPE_GAP / 2;
  const bottomStart = gapY + PIPE_GAP / 2;
  ctx.fillStyle = COLORS.pipe;
  ctx.strokeStyle = COLORS.pipeEdge;
  ctx.lineWidth = 2;
  ctx.fillRect(x, 0, PIPE_WIDTH, topEnd);
  ctx.strokeRect(x, -2, PIPE_WIDTH, topEnd + 2);
  ctx.fillRect(x, bottomStart, PIPE_WIDTH, GROUND_Y - bottomStart);
  ctx.strokeRect(x, bottomStart, PIPE_WIDTH, GROUND_Y - bottomStart);
}

function drawGround(ctx: CanvasRenderingContext2D, stepNo: number): void {
  ctx.fillStyle = COLORS.ground;
  ctx.fillRect(0, GROUND_Y, WORLD_WIDTH, GROUND_HEIGHT);
  ctx.fillStyle = COLORS.grass;
  ctx.fillRect(0, GROUND_Y, WORLD_WIDTH, 12);
  // Stripes scroll with the pipes (2 px per step) so the ground looks like it moves.
  ctx.fillStyle = COLORS.pipeEdge;
  const offset = (stepNo * 2) % 24;
  for (let x = -offset; x < WORLD_WIDTH; x += 24) ctx.fillRect(x, GROUND_Y + 12, 12, 3);
}

function drawBird(ctx: CanvasRenderingContext2D, y: number, vy: number): void {
  const half = BIRD_SIZE / 2;
  ctx.save();
  ctx.translate(BIRD_X + half, y + half);
  ctx.rotate(Math.max(-0.5, Math.min(1.2, vy * 0.09)));
  ctx.fillStyle = COLORS.bird;
  ctx.strokeStyle = COLORS.birdEdge;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, half, half - 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = COLORS.eye;
  ctx.beginPath();
  ctx.arc(5, -4, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COLORS.pupil;
  ctx.beginPath();
  ctx.arc(6, -4, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COLORS.beak;
  ctx.fillRect(half - 4, 0, 8, 5);
  ctx.restore();
}

function overlay(ctx: CanvasRenderingContext2D, lines: string[]): void {
  const lineHeight = 30;
  const top = WORLD_HEIGHT / 2 - 40 - (lines.length * lineHeight) / 2;
  ctx.fillStyle = COLORS.shade;
  ctx.fillRect(16, top - 8, WORLD_WIDTH - 32, lines.length * lineHeight + 16);
  lines.forEach((line, i) => {
    outlinedText(ctx, line, WORLD_WIDTH / 2, top + i * lineHeight + lineHeight / 2, i === 0 ? 26 : 16);
  });
}

function outlinedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number): void {
  ctx.font = `bold ${size}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 4;
  ctx.strokeStyle = COLORS.textEdge;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = COLORS.text;
  ctx.fillText(text, x, y);
}
