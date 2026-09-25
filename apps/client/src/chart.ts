import { PALETTE } from './theme.ts';

export interface TrendChartOptions {
  width: number;
  height: number;
  title: string;
  /** Formats the min/max labels on the y axis (default `String`). */
  format?: (value: number) => string;
  /** Text shown when there are no values (default `No complete games yet`). */
  emptyText?: string;
}

// Room around the plot: title on top, y labels on the left. Sized for the pixel font
// (about 0.6 em per digit), on the 4 px grid.
const PAD_TOP = 36;
const PAD_BOTTOM = 12;
const PAD_LEFT = 52;
const PAD_RIGHT = 12;
const INSET = 8;
const LABEL_GAP = 8;
const LINE = PALETTE.chartLine;

/**
 * A small line chart as an inline `<svg>` string: one point per value, left to
 * right (oldest first), with min/max labels on the y axis. No DOM needed.
 */
export function trendChartSvg(values: number[], options: TrendChartOptions): string {
  const { width, height, title } = options;
  const format = options.format ?? String;
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(title)}">`,
    `<text class="chart-title" x="${width / 2}" y="20" text-anchor="middle" font-size="20" font-weight="bold" fill="currentColor">${escapeXml(title)}</text>`,
  ];

  const plotW = width - PAD_LEFT - PAD_RIGHT;
  const plotH = height - PAD_TOP - PAD_BOTTOM;
  const top = PAD_TOP;
  const bottom = PAD_TOP + plotH;

  // Axis lines.
  parts.push(
    `<line class="chart-axis" x1="${PAD_LEFT}" y1="${top}" x2="${PAD_LEFT}" y2="${bottom}" stroke="currentColor" stroke-width="2" shape-rendering="crispEdges"/>`,
    `<line class="chart-axis" x1="${PAD_LEFT}" y1="${bottom}" x2="${width - PAD_RIGHT}" y2="${bottom}" stroke="currentColor" stroke-width="2" shape-rendering="crispEdges"/>`,
  );

  if (values.length === 0) {
    parts.push(
      `<text x="${PAD_LEFT + plotW / 2}" y="${top + plotH / 2}" text-anchor="middle" dominant-baseline="middle" font-size="18" fill="currentColor">${escapeXml(options.emptyText ?? 'No complete games yet')}</text>`,
      '</svg>',
    );
    return parts.join('');
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  // Points keep INSET px off the axis lines so dots are not cut by them.
  const left = PAD_LEFT + INSET;
  const spanW = plotW - 2 * INSET;
  const yTop = top + INSET;
  const spanH = plotH - 2 * INSET;
  const xAt = (i: number) => (values.length === 1 ? left + spanW / 2 : left + (i * spanW) / (values.length - 1));
  // All-equal values sit on a flat line in the middle.
  const yAt = (v: number) => (range === 0 ? yTop + spanH / 2 : yTop + ((max - v) / range) * spanH);
  const pts = values.map((v, i) => [round(xAt(i)), round(yAt(v))] as const);

  const label = (v: number, y: number) =>
    `<text class="chart-label" x="${PAD_LEFT - LABEL_GAP}" y="${round(y)}" text-anchor="end" dominant-baseline="middle" font-size="18" fill="currentColor">${escapeXml(format(v))}</text>`;
  // All-equal values would put both labels on the middle line: draw just one.
  parts.push(label(max, yAt(max)));
  if (range !== 0) parts.push(label(min, yAt(min)));

  parts.push(
    `<polyline points="${pts.map(([x, y]) => `${x},${y}`).join(' ')}" fill="none" stroke="${LINE}" stroke-width="3" stroke-linejoin="miter" stroke-linecap="square"/>`,
  );
  for (const [x, y] of pts) parts.push(`<circle cx="${x}" cy="${y}" r="4" fill="${LINE}"/>`);
  parts.push('</svg>');
  return parts.join('');
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
