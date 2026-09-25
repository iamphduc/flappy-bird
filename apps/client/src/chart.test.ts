import { describe, expect, it } from 'vitest';
import { trendChartSvg } from './chart.ts';
import { formatRatio } from './format.ts';
import { PALETTE } from './theme.ts';

const W = 300;
const H = 150;

function points(svg: string): Array<[number, number]> {
  const m = svg.match(/<polyline[^>]*\spoints="([^"]*)"/);
  if (!m) return [];
  return m[1]!
    .trim()
    .split(/\s+/)
    .map((p) => p.split(',').map(Number) as [number, number]);
}

function circles(svg: string): Array<[number, number]> {
  return [...svg.matchAll(/<circle[^>]*\scx="([^"]*)"[^>]*\scy="([^"]*)"/g)].map((m) => [Number(m[1]), Number(m[2])]);
}

describe('trendChartSvg', () => {
  it('plots one point per value in order', () => {
    const svg = trendChartSvg([1, 3, 2], { width: W, height: H, title: 'Score per flap' });
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('Score per flap');
    expect(svg.match(/<polyline/g)).toHaveLength(1);
    const pts = points(svg);
    expect(pts).toHaveLength(3);
    expect(circles(svg)).toEqual(pts);
    expect(pts[0]![0]).toBeLessThan(pts[1]![0]);
    expect(pts[1]![0]).toBeLessThan(pts[2]![0]);
    const ys = pts.map((p) => p[1]);
    expect(Math.min(...ys)).toBe(pts[1]![1]);
    for (const [x, y] of pts) {
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(W);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(H);
    }
  });

  it('empty chart says there are no games', () => {
    const svg = trendChartSvg([], { width: W, height: H, title: 'Wasted flaps (%)' });
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('No complete games yet');
    expect(svg).not.toContain('<polyline');
    expect(svg).not.toContain('<circle');
  });

  it('flat or single-point data does not break', () => {
    for (const values of [[5], [2, 2, 2]]) {
      const svg = trendChartSvg(values, { width: W, height: H, title: 't' });
      expect(svg).not.toContain('NaN');
      const pts = points(svg);
      expect(pts).toHaveLength(values.length);
      for (const [x, y] of pts) {
        expect(Number.isFinite(x)).toBe(true);
        expect(Number.isFinite(y)).toBe(true);
        expect(x).toBeGreaterThan(0);
        expect(x).toBeLessThan(W);
        expect(y).toBeGreaterThan(0);
        expect(y).toBeLessThan(H);
      }
    }
    // Several equal values draw a flat line in the middle.
    const flat = points(trendChartSvg([2, 2, 2], { width: W, height: H, title: 't' }));
    for (const [, y] of flat) expect(y).toBeCloseTo(flat[0]![1]);
  });

  it('empty chart text can be set', () => {
    const svg = trendChartSvg([], { width: W, height: H, title: 't', emptyText: 'No games with flaps yet' });
    expect(svg).toContain('No games with flaps yet');
    expect(svg).not.toContain('No complete games yet');
    expect(trendChartSvg([], { width: W, height: H, title: 't' })).toContain('No complete games yet');
    expect(trendChartSvg([], { width: W, height: H, title: 't', emptyText: '<x>' })).toContain('&lt;x&gt;');
  });

  it('equal values get one y label', () => {
    const yLabels = (svg: string) => svg.match(/<text[^>]*text-anchor="end"[^>]*>[^<]*<\/text>/g) ?? [];
    for (const values of [[5], [2, 2, 2]]) {
      const labels = yLabels(trendChartSvg(values, { width: W, height: H, title: 't' }));
      expect(labels).toHaveLength(1);
      expect(labels[0]).toContain(`>${values[0]}<`);
    }
    expect(yLabels(trendChartSvg([3, 7], { width: W, height: H, title: 't' }))).toHaveLength(2);
  });

  it('escapes text', () => {
    const svg = trendChartSvg([1, 2], { width: W, height: H, title: '<b>&' });
    expect(svg).toContain('&lt;b&gt;&amp;');
    expect(svg).not.toContain('<b>');
    const empty = trendChartSvg([], { width: W, height: H, title: '<b>&' });
    expect(empty).toContain('&lt;b&gt;&amp;');
  });

  it('labels use the format function', () => {
    const svg = trendChartSvg([0.25, 0.5, 0.125], {
      width: W,
      height: H,
      title: 't',
      format: (v) => `<${v.toFixed(2)}>`,
    });
    expect(svg).toContain('&lt;0.50&gt;');
    expect(svg).toContain('&lt;0.13&gt;');
    const plain = trendChartSvg([3, 7], { width: W, height: H, title: 't' });
    expect(plain).toMatch(/>7</);
    expect(plain).toMatch(/>3</);
  });

  it('line and dots use the palette', () => {
    const svg = trendChartSvg([1, 3, 2], { width: W, height: H, title: 't' });
    const strokes = [...svg.matchAll(/<polyline[^>]*\sstroke="([^"]*)"/g)].map((m) => m[1]);
    expect(strokes).toEqual([PALETTE.chartLine]);
    const fills = [...svg.matchAll(/<circle[^>]*\sfill="([^"]*)"/g)].map((m) => m[1]);
    expect(fills).toHaveLength(3);
    for (const fill of fills) expect(fill).toBe(PALETTE.chartLine);
    expect(svg.toLowerCase()).not.toContain('#2a7fb8');
  });

  it('labels and points fit the panel chart', () => {
    // The size statsPanel.ts uses; values like score per flap, labelled with formatRatio.
    const width = 320;
    const height = 180;
    const values = [0, 0.29, 1, 0.5, 0.125, 0.75, 0.2857, 0.9, 0.33, 0.6];
    const svg = trendChartSvg(values, { width, height, title: 'Score per flap', format: formatRatio });
    const labels = [...svg.matchAll(/<text[^>]*\sx="([^"]*)"[^>]*\sy="([^"]*)"[^>]*text-anchor="end"[^>]*>([^<]*)<\/text>/g)].map(
      (m) => ({ x: Number(m[1]), y: Number(m[2]), text: m[3]! }),
    );
    expect(labels.map((l) => l.text)).toEqual([formatRatio(1), formatRatio(0)]);
    // Pixel font digits are about 0.6 em wide (up to 16 px text): a label's left edge stays inside.
    const labelRight = Math.max(...labels.map((l) => l.x));
    for (const l of labels) {
      expect(l.x - l.text.length * 16 * 0.6).toBeGreaterThanOrEqual(0);
      expect(l.x).toBeLessThanOrEqual(width);
      expect(l.y).toBeGreaterThan(0);
      expect(l.y).toBeLessThan(height);
    }
    const pts = points(svg);
    expect(pts).toHaveLength(10);
    for (const [x, y] of pts) {
      // Dots (radius up to 4) clear the label column and stay in the viewBox.
      expect(x - 4).toBeGreaterThan(labelRight);
      expect(x + 4).toBeLessThanOrEqual(width);
      expect(y - 4).toBeGreaterThanOrEqual(0);
      expect(y + 4).toBeLessThanOrEqual(height);
    }
  });
});
