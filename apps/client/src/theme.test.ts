// The design-token contract: theme.ts (colors, fonts, contrast) and its CSS mirror in styles/theme.css.
import { describe, expect, it } from 'vitest';
import indexHtml from '../index.html?raw';
import themeCss from './styles/theme.css?raw';
import { BODY_FONT, CONTRAST_PAIRS, PALETTE, PIXEL_FONT, contrastRatio } from './theme.ts';

const REQUIRED_KEYS = [
  'bg',
  'surface',
  'surfaceAlt',
  'text',
  'textMuted',
  'accent',
  'accentText',
  'highlight',
  'danger',
  'focus',
  'border',
  'chartLine',
] as const;

const HEX = /^#[0-9a-f]{6}$/i;
const RGBA = /^rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*(0|1|0?\.\d+)\s*\)$/;
const GENERIC = /,\s*(monospace|sans-serif|serif)\s*$/;

const kebab = (key: string) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** Every src/styles/*.css file, as text. */
const styleFiles = import.meta.glob<string>('./styles/*.css', { query: '?raw', import: 'default', eager: true });

describe('theme', () => {
  it('theme exports the token contract', () => {
    for (const key of REQUIRED_KEYS) expect(PALETTE, key).toHaveProperty(key);
    for (const [key, value] of Object.entries(PALETTE)) {
      const ok = HEX.test(value) || RGBA.test(value);
      expect(ok, `${key}: ${value}`).toBe(true);
    }
    // Only see-through shades may be rgba; every required role is a solid color.
    for (const key of REQUIRED_KEYS) expect(PALETTE[key], key).toMatch(HEX);
    expect(PIXEL_FONT).toMatch(GENERIC);
    expect(BODY_FONT).toMatch(GENERIC);
  });

  it('palette pairs meet the contrast minimums', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 2);
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 2);
    expect(contrastRatio('#3a7bd5', '#3a7bd5')).toBe(1);

    const pairs = CONTRAST_PAIRS.map(([fg, bg, min]) => `${fg}/${bg}@${min}`);
    for (const pair of [
      'text/bg@4.5',
      'text/surface@4.5',
      'textMuted/surface@4.5',
      'accentText/accent@4.5',
      'danger/surface@4.5',
      'highlight/surface@4.5',
      'focus/bg@3',
      'focus/surface@3',
      'chartLine/surface@3',
    ]) {
      expect(pairs, pair).toContain(pair);
    }
    for (const [fg, bg, min] of CONTRAST_PAIRS) {
      const ratio = contrastRatio(PALETTE[fg], PALETTE[bg]);
      expect(ratio, `${fg} on ${bg}`).toBeGreaterThanOrEqual(min);
    }
  });

  it('theme.css mirrors theme.ts', () => {
    for (const [key, value] of Object.entries(PALETTE)) {
      const name = `--color-${kebab(key)}`;
      const match = themeCss.match(new RegExp(`${name}\\s*:\\s*([^;]+);`));
      expect(match, name).not.toBeNull();
      expect(match![1]!.trim().toLowerCase(), name).toBe(value.toLowerCase());
    }
    const pixel = themeCss.match(/--font-pixel\s*:\s*([^;]+);/);
    const body = themeCss.match(/--font-body\s*:\s*([^;]+);/);
    expect(pixel?.[1]?.trim()).toBe(PIXEL_FONT);
    expect(body?.[1]?.trim()).toBe(BODY_FONT);
  });

  it('fonts are self-hosted', () => {
    expect(themeCss).toMatch(/@import\s+['"]@fontsource\/[^'"]+['"]/);
    const files = { 'index.html': indexHtml, ...styleFiles };
    expect(Object.keys(styleFiles).length).toBeGreaterThanOrEqual(3);
    for (const [name, text] of Object.entries(files)) {
      expect(text, name).not.toMatch(/https?:\/\//);
      expect(text, name).not.toMatch(/fonts\.googleapis|fonts\.gstatic/);
    }
  });

  it('styles live in src/styles', () => {
    expect(indexHtml).not.toMatch(/<style[\s>]/i);
  });

  it('base rules cover focus and reduced motion', () => {
    expect(themeCss).toMatch(/:focus-visible\s*[,{]/);
    expect(themeCss).toMatch(/@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)\s*\{/);
  });
});
