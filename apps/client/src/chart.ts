export interface TrendChartOptions {
  width: number;
  height: number;
  title: string;
  /** Formats the min/max labels on the y axis (default `String`). */
  format?: (value: number) => string;
}

// Room around the plot: title on top, y labels on the left.
const PAD_TOP = 28;
const PAD_BOTTOM = 12;
const PAD_LEFT = 44;
const PAD_RIGHT = 12;

/**
 * A small line chart as an inline `<svg>` string: one point per value, left to
 * right (oldest first), with min/max labels on the y axis. No DOM needed.
 */
export function trendChartSvg(values: number[], options: TrendChartOptions): string {
  const { width, height, title } = options;
  const format = options.format ?? String;
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(title)}">`,
    `<text x="${width / 2}" y="18" text-anchor="middle" font-size="14" font-weight="bold" fill="currentColor">${escapeXml(title)}</text>`,
  ];

  const plotW = width - PAD_LEFT - PAD_RIGHT;
  const plotH = height - PAD_TOP - PAD_BOTTOM;
  const top = PAD_TOP;
  const bottom = PAD_TOP + plotH;

  // Axis lines.
  parts.push(
    `<line x1="${PAD_LEFT}" y1="${top}" x2="${PAD_LEFT}" y2="${bottom}" stroke="currentColor" stroke-opacity="0.4"/>`,
    `<line x1="${PAD_LEFT}" y1="${bottom}" x2="${width - PAD_RIGHT}" y2="${bottom}" stroke="currentColor" stroke-opacity="0.4"/>`,
  );

  if (values.length === 0) {
    parts.push(
      `<text x="${PAD_LEFT + plotW / 2}" y="${top + plotH / 2}" text-anchor="middle" dominant-baseline="middle" font-size="12" fill="currentColor">No complete games yet</text>`,
      '</svg>',
    );
    return parts.join('');
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const xAt = (i: number) =>
    values.length === 1 ? PAD_LEFT + plotW / 2 : PAD_LEFT + (i * plotW) / (values.length - 1);
  // All-equal values sit on a flat line in the middle.
  const yAt = (v: number) => (range === 0 ? top + plotH / 2 : top + ((max - v) / range) * plotH);
  const pts = values.map((v, i) => [round(xAt(i)), round(yAt(v))] as const);

  const label = (v: number, y: number) =>
    `<text x="${PAD_LEFT - 6}" y="${round(y)}" text-anchor="end" dominant-baseline="middle" font-size="11" fill="currentColor">${escapeXml(format(v))}</text>`;
  // With all-equal values both labels land on the middle line and read the same.
  parts.push(label(max, yAt(max)), label(min, yAt(min)));

  parts.push(
    `<polyline points="${pts.map(([x, y]) => `${x},${y}`).join(' ')}" fill="none" stroke="#2a7fb8" stroke-width="2"/>`,
  );
  for (const [x, y] of pts) parts.push(`<circle cx="${x}" cy="${y}" r="3" fill="#2a7fb8"/>`);
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
