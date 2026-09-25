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
  });

  it('there is only one page', () => {
    const pages = Object.keys(import.meta.glob('../*.html', { query: '?raw' }));
    expect(pages).toEqual(['../index.html']);
  });
});
