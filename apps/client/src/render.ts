import {
  BIRD_SIZE,
  BIRD_X,
  GROUND_HEIGHT,
  GROUND_Y,
  PIPE_GAP,
  PIPE_SPEED,
  PIPE_WIDTH,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type GameState,
} from '@flappy/engine';
import { causeText } from './format.ts';
import type { Phase } from './session.ts';
import { PALETTE, PIXEL_FONT } from './theme.ts';

// "Dusk Cabinet" canvas (direction: header of styles/theme.css). The game world is drawn at dusk,
// like the cabinet around it: a banded violet-to-peach sky with a scrolling city skyline, pipe-green
// pipes, a bird-yellow bird and arcade panels for the overlays. Pixel art from fillRect calls only,
// on a 2 px (bird) / 4 px (everything else) grid. Every size comes from the engine constants, and
// everything moves only with game state (no clock, no randomness), so drawing never changes a game.

/** Canvas-only colors: shades the page palette does not need. PALETTE values are reused where they fit. */
export const SCENE = {
  /** Sky bands from the top of the screen down to the horizon. */
  sky: [PALETTE.surface, '#32276e', '#3e2a7e', '#56308c', '#7c3a98', '#a8469c', '#d4589a', '#f27a8c'],
  starBright: PALETTE.text,
  starDim: PALETTE.textMuted,
  skyline: '#241a50',
  window: PALETTE.highlight,
  pipe: PALETTE.accent,
  pipeLight: '#a4ec7a',
  pipeShade: '#3a8f24',
  pipeOutline: PALETTE.accentText,
  grass: '#4fae33',
  groundStripe: '#8ee05c',
  grassShade: '#2f7a22',
  dirt: '#d9a066',
  dirtSpeck: '#b27848',
  bird: PALETTE.highlight,
  birdBelly: '#fff1a8',
  wing: '#fff6e0',
  eye: '#ffffff',
  beak: '#ff8a3d',
  beakShade: '#c8501e',
  /** Hard outlines: pixel edges, the ground's top line, the bird's edge, the score outline. */
  outline: PALETTE.shadow,
  /** Overlay panel fill and its border, hard shadow and the dim layer behind it. */
  panel: PALETTE.surface,
  panelBorder: PALETTE.border,
  panelShadow: PALETTE.shadow,
  scrim: PALETTE.scrim,
  title: PALETTE.highlight,
  line: PALETTE.text,
  /** The last overlay line: what to press next. */
  action: PALETTE.chartLine,
  scoreFill: PALETTE.highlight,
} as const;

/** Ground stripes repeat every STRIPE_PERIOD px and move PIPE_SPEED px per step, with the pipes. */
export const STRIPE_PERIOD = 24;

const GRID = 4;
const PIPE_CAP_HEIGHT = 24;
/** Where each sky band starts; the last band runs down to the ground. */
const SKY_BAND_TOPS = [0, 112, 176, 224, 264, 296, 324, 348];
/** Skyline buildings as [x, width, height], side by side, repeated every SKYLINE_PERIOD px. */
const SKYLINE: ReadonlyArray<readonly [number, number, number]> = [
  [0, 20, 44],
  [20, 28, 72],
  [48, 16, 36],
  [64, 24, 96],
  [88, 16, 52],
  [104, 24, 64],
  [128, 16, 32],
];
const SKYLINE_PERIOD = 144;
/** Stars as [x, y, bright]. Fixed, so they never twinkle. */
const STARS: ReadonlyArray<readonly [number, number, boolean]> = [
  [20, 24, true],
  [64, 56, false],
  [108, 16, false],
  [148, 40, true],
  [196, 12, false],
  [236, 64, true],
  [268, 28, false],
  [40, 96, false],
  [172, 88, false],
  [252, 124, false],
  [92, 132, true],
];

// Canvas text does not wait for web fonts; ask for the pixel font now so the next frames use it
// (render runs every animation frame, so the first frames after it loads pick it up).
if (typeof document !== 'undefined' && document.fonts) {
  void document.fonts.load(`400 20px ${PIXEL_FONT}`).catch(() => undefined);
}

/** Draws one frame: world, score and the overlay for the current phase. */
export function render(ctx: CanvasRenderingContext2D, game: GameState, phase: Phase): void {
  drawSky(ctx, game.step);
  for (const pipe of game.pipes) drawPipe(ctx, pipe.x, pipe.gapY);
  drawGround(ctx, game.step);
  drawBird(ctx, game.bird.y, game.bird.vy);

  if (phase !== 'ready') drawScore(ctx, String(game.score));

  if (phase === 'ready') {
    overlay(ctx, ['Flappy Bird', 'Press Space / click / tap', 'P or Esc to pause'], false);
  } else if (phase === 'paused') {
    overlay(ctx, ['Paused', 'P or Esc to resume'], true);
  } else if (phase === 'over') {
    const cause = game.death ? causeText(game.death.cause) : '';
    // Not dimmed, so the bird is still seen where it hit.
    overlay(ctx, ['Game over', `Score: ${game.score}`, cause, 'Flap to restart'], false);
  }
}

function drawSky(ctx: CanvasRenderingContext2D, stepNo: number): void {
  SKY_BAND_TOPS.forEach((top, i) => {
    const bottom = SKY_BAND_TOPS[i + 1] ?? GROUND_Y;
    ctx.fillStyle = SCENE.sky[i]!;
    ctx.fillRect(0, top, WORLD_WIDTH, bottom - top);
    // A checkered row of the next band's color softens each edge, the pixel-art way.
    const next = SCENE.sky[i + 1];
    if (next) {
      ctx.fillStyle = next;
      for (let x = 0; x < WORLD_WIDTH; x += GRID * 2) ctx.fillRect(x, bottom - GRID, GRID, GRID);
    }
  });

  for (const [x, y, bright] of STARS) {
    ctx.fillStyle = bright ? SCENE.starBright : SCENE.starDim;
    ctx.fillRect(x, y, 2, 2);
  }

  // Far away, so it moves at a quarter of the pipe speed, snapped to 2 px steps.
  const offset = (Math.floor((stepNo * PIPE_SPEED) / 8) * 2) % SKYLINE_PERIOD;
  for (let base = -offset; base < WORLD_WIDTH; base += SKYLINE_PERIOD) {
    SKYLINE.forEach(([bx, w, h], b) => {
      const x = base + bx;
      if (x + w <= 0 || x >= WORLD_WIDTH) return;
      ctx.fillStyle = SCENE.skyline;
      ctx.fillRect(x, GROUND_Y - h, w, h);
      // A fixed pattern of lit windows per building.
      ctx.fillStyle = SCENE.window;
      for (let wy = GROUND_Y - h + 8; wy < GROUND_Y - 8; wy += 12) {
        for (let wx = x + 4; wx + GRID <= x + w - 4; wx += 8) {
          if ((b * 5 + wy + (wx - x)) % 3 === 0) ctx.fillRect(wx, wy, GRID, GRID);
        }
      }
    });
  }
}

/** One pipe piece (body or cap) from y to y + h, inset by `inset` from the pipe's hitbox columns. */
function pipePiece(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, inset: number): void {
  if (h <= 0) return;
  const left = x + inset;
  const width = PIPE_WIDTH - inset * 2;
  ctx.fillStyle = SCENE.pipeOutline;
  ctx.fillRect(left, y, width, h);
  const innerTop = inset === 0 ? y + 2 : y;
  const innerH = inset === 0 ? h - 4 : h;
  ctx.fillStyle = SCENE.pipe;
  ctx.fillRect(left + 2, innerTop, width - 4, innerH);
  ctx.fillStyle = SCENE.pipeLight;
  ctx.fillRect(left + 6, innerTop, GRID, innerH);
  ctx.fillStyle = SCENE.pipeShade;
  ctx.fillRect(left + width - 12, innerTop, 8, innerH);
}

function drawPipe(ctx: CanvasRenderingContext2D, x: number, gapY: number): void {
  const topEnd = gapY - PIPE_GAP / 2;
  const bottomStart = gapY + PIPE_GAP / 2;
  // Top pipe: body from the top of the screen, cap ending exactly at the gap.
  pipePiece(ctx, x, 0, topEnd - PIPE_CAP_HEIGHT, GRID);
  pipePiece(ctx, x, topEnd - PIPE_CAP_HEIGHT, PIPE_CAP_HEIGHT, 0);
  // Bottom pipe: cap starting exactly at the gap, body down to the ground.
  pipePiece(ctx, x, bottomStart, PIPE_CAP_HEIGHT, 0);
  pipePiece(ctx, x, bottomStart + PIPE_CAP_HEIGHT, GROUND_Y - bottomStart - PIPE_CAP_HEIGHT, GRID);
}

function drawGround(ctx: CanvasRenderingContext2D, stepNo: number): void {
  ctx.fillStyle = SCENE.dirt;
  ctx.fillRect(0, GROUND_Y, WORLD_WIDTH, GROUND_HEIGHT);
  ctx.fillStyle = SCENE.outline;
  ctx.fillRect(0, GROUND_Y, WORLD_WIDTH, GRID);
  ctx.fillStyle = SCENE.grass;
  ctx.fillRect(0, GROUND_Y + GRID, WORLD_WIDTH, GRID * 3);
  ctx.fillStyle = SCENE.grassShade;
  ctx.fillRect(0, GROUND_Y + GRID * 4, WORLD_WIDTH, GRID);

  // Slanted grass stripes and dirt specks scroll with the pipes (PIPE_SPEED px per step).
  const moved = stepNo * PIPE_SPEED;
  const offset = moved % STRIPE_PERIOD;
  ctx.fillStyle = SCENE.groundStripe;
  for (let x = -offset; x < WORLD_WIDTH; x += STRIPE_PERIOD) {
    for (let row = 0; row < 3; row++) ctx.fillRect(x + row * GRID, GROUND_Y + GRID * (row + 1), 12, GRID);
  }
  const speckPeriod = STRIPE_PERIOD * 2;
  ctx.fillStyle = SCENE.dirtSpeck;
  for (let x = -(moved % speckPeriod); x < WORLD_WIDTH; x += speckPeriod) {
    ctx.fillRect(x + 8, GROUND_Y + 36, GRID, GRID);
    ctx.fillRect(x + 32, GROUND_Y + 56, GRID, GRID);
    ctx.fillRect(x + 20, GROUND_Y + 80, GRID, GRID);
    ctx.fillRect(x + 40, GROUND_Y + 100, GRID, GRID);
  }
}

type LocalRect = readonly [number, number, number, number];

function fillRects(ctx: CanvasRenderingContext2D, color: string, rects: readonly LocalRect[]): void {
  ctx.fillStyle = color;
  for (const [x, y, w, h] of rects) ctx.fillRect(x, y, w, h);
}

function drawBird(ctx: CanvasRenderingContext2D, y: number, vy: number): void {
  const half = BIRD_SIZE / 2;
  // Local shapes are laid out for a 24 px bird on a 2 px grid; `u` scales them to BIRD_SIZE.
  const u = BIRD_SIZE / 24;
  const r = (x: number, yy: number, w: number, h: number): LocalRect => [x * u, yy * u, w * u, h * u];
  ctx.save();
  ctx.translate(BIRD_X + half, y + half);
  ctx.rotate(Math.max(-0.5, Math.min(1.2, vy * 0.09)));
  // Rounded pixel body: three overlapping rects for the outline, the same inset by 2 for the fill.
  fillRects(ctx, SCENE.outline, [r(-10, -10, 20, 20), r(-12, -6, 24, 12), r(-6, -12, 12, 24)]);
  fillRects(ctx, SCENE.bird, [r(-8, -8, 16, 16), r(-10, -4, 20, 8), r(-4, -10, 8, 20)]);
  fillRects(ctx, SCENE.birdBelly, [r(-6, 4, 10, 4), r(-4, 8, 6, 2)]);
  fillRects(ctx, SCENE.eye, [r(0, -8, 8, 8)]);
  fillRects(ctx, SCENE.outline, [r(4, -6, 2, 4)]);
  // The wing is up while the bird rises (just flapped) and down while it falls.
  const wingY = vy < 0 ? -6 : -2;
  fillRects(ctx, SCENE.outline, [r(-12, wingY, 12, 8)]);
  fillRects(ctx, SCENE.wing, [r(-10, wingY + 2, 8, 4)]);
  // The beak is the only part allowed past the hitbox (4 px, as before).
  fillRects(ctx, SCENE.beakShade, [r(4, 0, 12, 8)]);
  fillRects(ctx, SCENE.beak, [r(4, 0, 10, 4), r(6, 4, 6, 2)]);
  ctx.restore();
}

function setFont(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.font = `400 ${size}px ${PIXEL_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
}

function drawScore(ctx: CanvasRenderingContext2D, text: string): void {
  const x = WORLD_WIDTH / 2;
  const y = 60;
  setFont(ctx, 40);
  ctx.lineJoin = 'miter';
  ctx.miterLimit = 2;
  ctx.lineWidth = 6;
  ctx.strokeStyle = SCENE.outline;
  // Hard drop shadow, then the outline, then the fill.
  ctx.strokeText(text, x, y + GRID);
  ctx.strokeText(text, x, y);
  ctx.fillStyle = SCENE.scoreFill;
  ctx.fillText(text, x, y);
}

function overlay(ctx: CanvasRenderingContext2D, lines: string[], dim: boolean): void {
  if (dim) {
    ctx.fillStyle = SCENE.scrim;
    ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  }
  const titleHeight = 44;
  const lineHeight = 28;
  const pad = GRID * 3;
  const height = pad * 2 + titleHeight + lineHeight * (lines.length - 1);
  // Centered below the bird start height so the ready overlay does not hide the bird.
  const top = Math.round((WORLD_HEIGHT / 2 + 40 - height / 2) / GRID) * GRID;
  const left = GRID * 4;
  const width = WORLD_WIDTH - left * 2;

  ctx.fillStyle = SCENE.panelShadow;
  ctx.fillRect(left + GRID, top + GRID, width, height);
  ctx.fillStyle = SCENE.panelBorder;
  ctx.fillRect(left, top, width, height);
  ctx.fillStyle = SCENE.panel;
  ctx.fillRect(left + GRID, top + GRID, width - GRID * 2, height - GRID * 2);

  const cx = WORLD_WIDTH / 2;
  const maxWidth = width - GRID * 6;
  setFont(ctx, 28);
  ctx.fillStyle = SCENE.title;
  ctx.fillText(lines[0]!, cx, top + pad + titleHeight / 2, maxWidth);
  setFont(ctx, 20);
  lines.slice(1).forEach((line, i) => {
    ctx.fillStyle = i === lines.length - 2 ? SCENE.action : SCENE.line;
    ctx.fillText(line, cx, top + pad + titleHeight + i * lineHeight + lineHeight / 2, maxWidth);
  });
}
