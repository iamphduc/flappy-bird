// Entry for stats.html: the current player's trend across counted games.
import { loadPlayer } from './api.ts';
import { trendChartSvg } from './chart.ts';
import { formatRatio } from './format.ts';
import { fetchStats, statsView } from './stats.ts';

const NO_PLAYER_TEXT = 'No player yet - play a game first';
const CHART_WIDTH = 320;
const CHART_HEIGHT = 180;
const TABLE_HEADINGS = ['Played', 'Score', 'Flaps', 'Score per flap', 'Wasted', 'Time between flaps', 'Died'];

const root = document.querySelector<HTMLElement>('#stats')!;

function paragraph(text: string): HTMLParagraphElement {
  const p = document.createElement('p');
  p.textContent = text;
  return p;
}

function showMessage(text: string): void {
  root.replaceChildren(paragraph(text));
}

function chart(values: number[], title: string, format?: (v: number) => string): HTMLElement {
  const figure = document.createElement('figure');
  figure.className = 'chart';
  // trendChartSvg escapes all its text, so the string is safe to insert.
  figure.innerHTML = trendChartSvg(values, { width: CHART_WIDTH, height: CHART_HEIGHT, title, format });
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

async function start(): Promise<void> {
  const player = loadPlayer(localStorage);
  if (!player) return showMessage(NO_PLAYER_TEXT);

  showMessage('Loading…');
  const result = await fetchStats(fetch, player.id);
  if (!result.ok) return showMessage(result.reason === 'unknown-player' ? NO_PLAYER_TEXT : 'Could not load your stats');

  const view = statsView(result.stats);
  const heading = document.createElement('h2');
  heading.textContent = result.stats.nickname;
  const headline = document.createElement('ul');
  headline.className = 'headline';
  for (const line of view.headline) {
    const li = document.createElement('li');
    li.textContent = line;
    headline.append(li);
  }
  const parts: HTMLElement[] = [heading, headline];
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

void start();
