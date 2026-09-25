import {
  BIRD_SIZE,
  BIRD_X,
  GROUND_HEIGHT,
  GROUND_Y,
  PIPE_GAP,
  PIPE_WIDTH,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  createGame,
  type GameState,
} from '@flappy/engine';
import { describe, expect, it } from 'vitest';
import { render, SCENE, STRIPE_PERIOD } from './render.ts';
import type { Phase } from './session.ts';
import { PALETTE, PIXEL_FONT, contrastRatio } from './theme.ts';

/** One recorded canvas call, with the style that was active when it ran. */
interface Call {
  name: string;
  args: unknown[];
  fillStyle: unknown;
  strokeStyle: unknown;
  font: unknown;
  /** Depth of save() nesting when the call ran. */
  depth: number;
}

interface Fake {
  ctx: CanvasRenderingContext2D;
  calls: Call[];
  /** Every value assigned to fillStyle / strokeStyle / font, in order. */
  sets: { prop: string; value: unknown }[];
}

const RECORDED = [
  'fillRect',
  'strokeRect',
  'clearRect',
  'fillText',
  'strokeText',
  'translate',
  'rotate',
  'scale',
  'setTransform',
  'save',
  'restore',
  'beginPath',
  'closePath',
  'moveTo',
  'lineTo',
  'rect',
  'arc',
  'ellipse',
  'fill',
  'stroke',
  'drawImage',
];

/** A small fake 2D context: records calls and style sets; node has no canvas. */
function fakeContext(): Fake {
  const calls: Call[] = [];
  const sets: { prop: string; value: unknown }[] = [];
  const state: Record<string, unknown> = { fillStyle: '#000000', strokeStyle: '#000000', font: '10px sans-serif' };
  let depth = 0;
  const target: Record<string, unknown> = {};
  for (const name of RECORDED) {
    target[name] = (...args: unknown[]) => {
      if (name === 'restore') depth--;
      calls.push({ name, args, fillStyle: state.fillStyle, strokeStyle: state.strokeStyle, font: state.font, depth });
      if (name === 'save') depth++;
    };
  }
  const ctx = new Proxy(target, {
    get(t, prop: string) {
      if (prop in t) return t[prop];
      return state[prop];
    },
    set(_t, prop: string, value) {
      if (prop === 'fillStyle' || prop === 'strokeStyle' || prop === 'font') sets.push({ prop, value });
      state[prop] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls, sets };
}

function draw(game: GameState, phase: Phase): Fake {
  const fake = fakeContext();
  render(fake.ctx, game, phase);
  return fake;
}

function stateWith(patch: Partial<GameState>): GameState {
  return { ...createGame(42), ...patch };
}

type Rect = { x: number; y: number; w: number; h: number; color: unknown };

/** fillRect calls at depth 0 (world coordinates) as normalized rects. */
function worldRects(calls: Call[]): Rect[] {
  return calls
    .filter((c) => c.name === 'fillRect' && c.depth === 0)
    .map((c) => {
      const [x, y, w, h] = c.args as number[];
      return { x: x!, y: y!, w: w!, h: h!, color: c.fillStyle };
    });
}

/** Every color a pipe is drawn with (read lazily so a missing SCENE fails per test). */
const pipeColors = () => new Set<unknown>([SCENE?.pipe, SCENE?.pipeLight, SCENE?.pipeShade, SCENE?.pipeOutline]);

function flatValues(obj: Record<string, unknown>): unknown[] {
  return Object.values(obj).flatMap((v) => (Array.isArray(v) ? v : [v]));
}

describe('render', () => {
  it('pipes are drawn on their hitbox', () => {
    const x = 100;
    const gapY = 200;
    const { calls } = draw(stateWith({ pipes: [{ x, gapY, scored: false }] }), 'playing');
    const PIPE_COLORS = pipeColors();
    const pipeRects = worldRects(calls).filter((r) => PIPE_COLORS.has(r.color));
    expect(pipeRects.length).toBeGreaterThan(0);
    for (const r of pipeRects) {
      expect(r.x).toBeGreaterThanOrEqual(x);
      expect(r.x + r.w).toBeLessThanOrEqual(x + PIPE_WIDTH);
      expect(r.w).toBeGreaterThan(0);
      expect(r.h).toBeGreaterThan(0);
    }
    const topEnd = gapY - PIPE_GAP / 2;
    const bottomStart = gapY + PIPE_GAP / 2;
    const top = pipeRects.filter((r) => r.y < topEnd);
    const bottom = pipeRects.filter((r) => r.y >= bottomStart);
    // Every pipe rect is in one of the two pipes: nothing pipe-colored inside the gap.
    expect(top.length + bottom.length).toBe(pipeRects.length);
    for (const r of top) expect(r.y + r.h).toBeLessThanOrEqual(topEnd);
    for (const r of bottom) expect(r.y + r.h).toBeLessThanOrEqual(GROUND_Y);
    expect(Math.max(...top.map((r) => r.y + r.h))).toBe(topEnd);
    expect(Math.min(...top.map((r) => r.y))).toBeLessThanOrEqual(0);
    expect(Math.min(...bottom.map((r) => r.y))).toBe(bottomStart);
    expect(Math.max(...bottom.map((r) => r.y + r.h))).toBe(GROUND_Y);
    // Strokes would spill outside the hitbox, so pipes use none.
    expect(calls.some((c) => c.name === 'strokeRect' && PIPE_COLORS.has(c.strokeStyle))).toBe(false);
  });

  it('bird is drawn on its hitbox', () => {
    const y = 180;
    for (const vy of [-6.5, 0, 5]) {
      const { calls } = draw(stateWith({ bird: { y, vy }, pipes: [] }), 'playing');
      const half = BIRD_SIZE / 2;
      const tIndex = calls.findIndex((c) => c.name === 'translate' && c.depth === 1);
      expect(calls[tIndex]!.args).toEqual([BIRD_X + half, y + half]);
      const bird = calls.slice(tIndex).filter((c) => c.depth === 1 && c.name === 'fillRect');
      expect(bird.length).toBeGreaterThan(0);
      const beak = new Set<unknown>([SCENE.beak, SCENE.beakShade]);
      for (const c of bird) {
        const [rx, ry, rw, rh] = c.args as number[];
        expect(rx!).toBeGreaterThanOrEqual(-half);
        expect(ry!).toBeGreaterThanOrEqual(-half);
        expect(ry! + rh!).toBeLessThanOrEqual(half);
        if (beak.has(c.fillStyle)) expect(rx! + rw!).toBeLessThanOrEqual(half + 4);
        else expect(rx! + rw!).toBeLessThanOrEqual(half);
      }
      // No paths (arcs/ellipses) that could escape the square unchecked.
      expect(calls.some((c) => ['arc', 'ellipse', 'stroke', 'strokeRect'].includes(c.name) && c.depth === 1)).toBe(
        false,
      );
    }
  });

  it('ground sits at GROUND_Y and scrolls with the step', () => {
    const at = (step: number) => worldRects(draw(stateWith({ step, pipes: [] }), 'playing').calls);
    const step0 = at(0);
    expect(
      step0.some((r) => r.x <= 0 && r.y === GROUND_Y && r.x + r.w >= WORLD_WIDTH && r.h === GROUND_HEIGHT),
    ).toBe(true);
    expect(GROUND_Y + GROUND_HEIGHT).toBe(WORLD_HEIGHT);
    const stripes = (rects: Rect[]) =>
      rects
        .filter((r) => r.color === SCENE.groundStripe)
        .map((r) => `${(((r.x % STRIPE_PERIOD) + STRIPE_PERIOD) % STRIPE_PERIOD)},${r.y},${r.w},${r.h}`)
        .sort();
    const s0 = step0.filter((r) => r.color === SCENE.groundStripe);
    expect(s0.length).toBeGreaterThan(0);
    for (const r of s0) expect(r.y).toBeGreaterThanOrEqual(GROUND_Y);
    const shifted = s0
      .map((r) => ({ ...r, x: r.x - 10 }))
      .map((r) => `${(((r.x % STRIPE_PERIOD) + STRIPE_PERIOD) % STRIPE_PERIOD)},${r.y},${r.w},${r.h}`)
      .sort();
    expect([...new Set(stripes(at(5)))]).toEqual([...new Set(shifted)]);
    // Stripes cover the whole width at any step.
    const s5 = at(5).filter((r) => r.color === SCENE.groundStripe);
    expect(Math.min(...s5.map((r) => r.x))).toBeLessThanOrEqual(0);
    expect(Math.max(...s5.map((r) => r.x + r.w))).toBeGreaterThanOrEqual(WORLD_WIDTH - STRIPE_PERIOD / 2);
  });

  it('overlays and score per phase', () => {
    const texts = (game: GameState, phase: Phase) =>
      draw(game, phase)
        .calls.filter((c) => c.name === 'fillText')
        .map((c) => String(c.args[0]).toLowerCase());
    const base = stateWith({ score: 2 });

    const ready = texts(base, 'ready');
    expect(ready).toEqual(expect.arrayContaining(['flappy bird', 'press space / click / tap', 'p or esc to pause']));
    expect(ready).not.toContain('2');

    expect(texts(base, 'paused')).toEqual(expect.arrayContaining(['paused', 'p or esc to resume']));

    const over = texts({ ...base, death: { step: 296, cause: 'ground' } }, 'over');
    expect(over).toEqual(expect.arrayContaining(['game over', 'score: 2', 'hit the ground', 'flap to restart']));

    expect(texts(base, 'playing')).toContain('2');
  });

  it('draws only with theme colors and the pixel font', () => {
    const allowed = new Set<unknown>([...Object.values(PALETTE), ...flatValues(SCENE)]);
    const game = stateWith({ score: 2, step: 77, bird: { y: 150, vy: -3 }, death: { step: 77, cause: 'pipe-top' } });
    for (const phase of ['ready', 'playing', 'paused', 'over'] as Phase[]) {
      const { calls, sets } = draw(game, phase);
      for (const s of sets) {
        if (s.prop === 'font') expect(String(s.value)).toContain(PIXEL_FONT);
        else expect(allowed.has(s.value), `${s.prop} ${String(s.value)}`).toBe(true);
      }
      expect(sets.some((s) => s.prop === 'font')).toBe(true);
      expect(calls.some((c) => c.name === 'drawImage')).toBe(false);
    }
  });

  it('drawing depends only on game state', () => {
    const game = stateWith({ score: 1, step: 123, bird: { y: 222, vy: 2 } });
    const a = draw(game, 'paused');
    const b = draw(game, 'paused');
    expect(b.calls).toEqual(a.calls);
    expect(b.sets).toEqual(a.sets);
  });

  it('overlay text is readable', () => {
    const { calls } = draw(stateWith({ score: 2, death: { step: 296, cause: 'ground' } }), 'over');
    const texts = calls.filter((c) => c.name === 'fillText');
    const overlayTexts = texts.filter((c) => String(c.args[0]) !== '2');
    expect(overlayTexts.length).toBeGreaterThan(0);
    for (const c of overlayTexts) {
      expect(contrastRatio(c.fillStyle as string, SCENE.panel)).toBeGreaterThanOrEqual(4.5);
    }
    // The panel behind those lines is SCENE.panel.
    expect(worldRects(calls).some((r) => r.color === SCENE.panel && r.w > WORLD_WIDTH / 2)).toBe(true);
    expect(contrastRatio(SCENE.scoreFill, SCENE.outline)).toBeGreaterThanOrEqual(4.5);
    const score = texts.find((c) => String(c.args[0]) === '2')!;
    expect(score.fillStyle).toBe(SCENE.scoreFill);
    const outline = calls.find((c) => c.name === 'strokeText' && String(c.args[0]) === '2')!;
    expect(outline.strokeStyle).toBe(SCENE.outline);
  });
});
