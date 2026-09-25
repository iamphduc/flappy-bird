// The page's element contract (ids main.ts queries) and the one-page build.
import { describe, expect, it } from 'vitest';
import indexHtml from '../index.html?raw';

const IDS = [
  'layout',
  'play',
  'player-bar',
  'player-name',
  'change-name',
  'rename-form',
  'new-name',
  'reroll-name',
  'cancel-rename',
  'rename-error',
  'game',
  'recording',
  'status',
  'panel',
  'last-game',
  'my-stats',
];

describe('page', () => {
  it('index.html has the one-page layout', () => {
    for (const id of IDS) expect(indexHtml, `id="${id}"`).toContain(`id="${id}"`);
    expect(indexHtml).toMatch(/<canvas\b[^>]*\bwidth="288"[^>]*\bheight="512"/);
    expect(indexHtml).not.toContain('stats.html');
    expect(indexHtml).not.toContain('player-form');
    for (const id of ['last-game-body', 'my-stats-body']) expect(indexHtml).toContain(`id="${id}"`);
    // Name bar, rename form, canvas and the two status lines stay inside #play, in this order.
    const play = indexHtml.slice(indexHtml.indexOf('id="play"'), indexHtml.indexOf('id="panel"'));
    const order = ['player-bar', 'rename-form', 'game', 'recording', 'status'].map((id) =>
      play.indexOf(`id="${id}"`),
    );
    expect(order.every((at) => at > 0), 'all inside #play').toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('controls stay accessible', () => {
    expect(indexHtml).toMatch(/<meta\s+name="viewport"\s+content="width=device-width/);
    expect(indexHtml.match(/<h1/g) ?? []).toHaveLength(1);
    expect(indexHtml).toMatch(/<label[^>]*for="new-name"/);
    const buttons = indexHtml.match(/<button[^>]*>/g) ?? [];
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) expect(button, button).toMatch(/type="(button|submit)"/);
  });

  it('there is only one page', () => {
    const pages = Object.keys(import.meta.glob('../*.html', { query: '?raw' }));
    expect(pages).toEqual(['../index.html']);
  });
});
