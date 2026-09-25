import { describe, expect, it } from 'vitest';
import { trendChartSvg } from './chart.ts';

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
});
