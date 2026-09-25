// The "My stats" part of the side panel: headline, two trend charts and the games table.
import { trendChartSvg } from './chart.ts';
import { formatRatio } from './format.ts';
import type { StatsView } from './stats.ts';

const CHART_WIDTH = 320;
const CHART_HEIGHT = 180;
const CHART_EMPTY_TEXT = 'No games with flaps yet';
const TABLE_HEADINGS = ['Played', 'Score', 'Flaps', 'Score per flap', 'Wasted', 'Time between flaps', 'Died'];

function paragraph(text: string): HTMLParagraphElement {
  const p = document.createElement('p');
  p.textContent = text;
  return p;
}

function chart(values: number[], title: string, format?: (v: number) => string): HTMLElement {
  const figure = document.createElement('figure');
  figure.className = 'chart';
  // trendChartSvg escapes all its text, so the string is safe to insert.
  figure.innerHTML = trendChartSvg(values, {
    width: CHART_WIDTH,
    height: CHART_HEIGHT,
    title,
    format,
    emptyText: CHART_EMPTY_TEXT,
  });
  return figure;
}

function table(rows: string[][]): HTMLTableElement {
  const el = document.createElement('table');
  const headRow = el.createTHead().insertRow();
  for (const text of TABLE_HEADINGS) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = text;
    headRow.append(th);
  }
  const body = el.createTBody();
  for (const row of rows) {
    const tr = body.insertRow();
    for (const cell of row) tr.insertCell().textContent = cell;
  }
  return el;
}

/** Replaces `root`'s content with one line of text. */
export function renderStatsMessage(root: HTMLElement, text: string): void {
  root.replaceChildren(paragraph(text));
}

/** Replaces `root`'s content with the stats view. */
export function renderStats(root: HTMLElement, view: StatsView): void {
  const headline = document.createElement('ul');
  headline.className = 'headline';
  for (const line of view.headline) {
    const li = document.createElement('li');
    li.textContent = line;
    headline.append(li);
  }
  const parts: HTMLElement[] = [headline];
  if (view.rows.length > 0) {
    const charts = document.createElement('div');
    charts.className = 'charts';
    charts.append(
      chart(view.scorePerFlap, 'Score per flap', formatRatio),
      chart(view.wastedPercent, 'Wasted flaps (%)', (v) => String(Math.round(v))),
    );
    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    wrap.append(table(view.rows));
    parts.push(charts, wrap);
  }
  root.replaceChildren(...parts);
}
