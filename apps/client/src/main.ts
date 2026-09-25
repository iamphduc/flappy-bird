import { STEPS_PER_SECOND, replay, type PlayerStats, type ServerMessage } from '@flappy/engine';
import { reserveGame, type Player, type RenameResult, type ReservedGame, type StorageLike } from './api.ts';
import { parseDevParams } from './devParams.ts';
import { actionFromKey, actionFromPointer } from './input.ts';
import { createLastGame, lastGameView, type LastGameState } from './lastGame.ts';
import { createStepper } from './loop.ts';
import { changeName, ensurePlayer, nicknameError } from './player.ts';
import { createRecorder, type Recorder } from './recorder.ts';
import { render } from './render.ts';
import { assignGame, createSession, handle, snapshot, tick, type Session, type SessionAction } from './session.ts';
import { fetchStats, statsView } from './stats.ts';
import { renderStats, renderStatsMessage } from './statsPanel.ts';
import { fetchSummary } from './summary.ts';

type ResultMessage = Extract<ServerMessage, { type: 'result' }>;

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const ctx = canvas.getContext('2d')!;
const playerBar = document.querySelector<HTMLParagraphElement>('#player-bar')!;
const playerName = document.querySelector<HTMLElement>('#player-name')!;
const changeNameButton = document.querySelector<HTMLButtonElement>('#change-name')!;
const renameForm = document.querySelector<HTMLFormElement>('#rename-form')!;
const newNameInput = document.querySelector<HTMLInputElement>('#new-name')!;
const rerollButton = document.querySelector<HTMLButtonElement>('#reroll-name')!;
const cancelRenameButton = document.querySelector<HTMLButtonElement>('#cancel-rename')!;
const renameError = document.querySelector<HTMLSpanElement>('#rename-error')!;
const recordingLine = document.querySelector<HTMLParagraphElement>('#recording')!;
const lastGameBody = document.querySelector<HTMLElement>('#last-game-body')!;
const statsBody = document.querySelector<HTMLElement>('#my-stats-body')!;

/** Random uint32 seed. The client may use Math.random; the engine never does. */
function randomSeed(): number {
  return Math.floor(Math.random() * 0x1_0000_0000) >>> 0;
}

/** localStorage, or a do-nothing store when the browser blocks it. */
function pageStorage(): StorageLike {
  try {
    return window.localStorage;
  } catch {
    return { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  }
}

const storage = pageStorage();
const fetchFn = (input: string, init?: RequestInit) => fetch(input, init);

const dev = import.meta.env.DEV ? parseDevParams(window.location.search) : {};
let session: Session = createSession({
  seed: dev.seed ?? randomSeed(),
  script: dev.flaps,
  nextSeed: randomSeed,
});

// --- Recording state ---------------------------------------------------------------------

/** How long a scripted dev run waits for its server game before it plays unrecorded. */
const SCRIPT_HOLD_MS = 3000;

let player: Player | null = null;
/** Before there is a player: the first lookup is still out, or it failed (retrying). */
let playerLookup: 'pending' | 'failed' = 'pending';
let recorder: Recorder | null = null;
let online = false;
/** A reserved server game waiting for the next game to start. */
let reserved: ReservedGame | null = null;
let reserving = false;
/** Highest seq forwarded to the recorder for `sentGameId`. */
let sentGameId: string | null = null;
let sentUpTo = -1;
let lastResult: ResultMessage | null = null;
/** A scripted run in ready does not start before this time unless its game is assigned. */
let scriptHoldUntil = performance.now() + SCRIPT_HOLD_MS;

function setPlayer(next: Player): void {
  player = next;
  showPlayerName();
  loadStats();
  recorder = createRecorder({
    connect: () => {
      const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
      return new WebSocket(`${scheme}://${window.location.host}/api/ws`);
    },
    playerId: next.id,
    onResult: (message) => {
      lastResult = message;
      lastGame.result(message.gameId);
    },
    onStatus: (status) => {
      online = status === 'online';
      // Back online: a failed reservation can be tried again.
      if (online && (needsReservation() || session.phase !== 'ready')) reserveNext();
    },
  });
  reserveNext();
}

/** True while the current game has not started and has no server game yet. */
function needsReservation(): boolean {
  return session.phase === 'ready' && session.gameId === null;
}

/** Asks the server for the next game, unless one is ready or on its way. */
function reserveNext(): void {
  if (!player || reserved || reserving) return;
  reserving = true;
  const playerId = player.id;
  // A scripted run keeps its seed across restarts, so its server game uses that seed (dev only).
  const seed = session.script ? session.seed : undefined;
  void reserveGame(fetchFn, playerId, seed).then((game) => {
    reserving = false;
    if (!game || player?.id !== playerId) return;
    reserved = game;
    setSession(session);
  });
}

/** Stores the new session, gives it a reserved game if it can take one, and forwards new events. */
function setSession(next: Session): void {
  const before = session;
  session = next;

  if (session.phase === 'ready' && session.gameId === null && reserved) {
    const assigned = assignGame(session, reserved);
    if (assigned !== session) {
      session = assigned;
      reserved = null;
    }
  }
  if (session.phase === 'ready' && before.phase !== 'ready') scriptHoldUntil = performance.now() + SCRIPT_HOLD_MS;
  // Reserve while in ready without a game, and reserve the following game as soon as one starts.
  if (needsReservation() || (before.phase === 'ready' && session.phase === 'playing')) reserveNext();

  forwardEvents();
  // The Last game card keeps the finished game on restart; only a new game over replaces it.
  if (before.phase !== 'over' && session.phase === 'over') lastGame.gameOver(session.gameId);
}

function forwardEvents(): void {
  const { gameId, events } = session;
  if (!recorder || gameId === null) return;
  if (gameId !== sentGameId) {
    sentGameId = gameId;
    sentUpTo = -1;
  }
  const last = events[events.length - 1];
  if (!last || last.seq <= sentUpTo) return;
  recorder.record(gameId, events.filter((e) => e.seq > sentUpTo));
  sentUpTo = last.seq;
}

function recordingText(): string {
  if (!player) return playerLookup === 'pending' ? 'Getting your player name…' : 'Offline - this game is not recorded';
  const { gameId, phase } = session;
  if (gameId === null) {
    if (phase === 'ready' && reserving) return `Recording as ${player.nickname}`;
    return 'Offline - this game is not recorded';
  }
  if (phase === 'over' && lastResult?.gameId === gameId) {
    const same = !lastResult.mismatch && lastResult.score === session.game.score;
    return `Server score ${lastResult.score} (${same ? 'matches' : 'differs'})`;
  }
  return online ? `Recording as ${player.nickname}` : `Recording as ${player.nickname} (reconnecting)`;
}

// --- Player: automatic funny name, name bar and rename form ------------------------------

/** How long to wait before asking for a player again when registering failed. */
const PLAYER_RETRY_MS = 5000;

async function findPlayer(): Promise<void> {
  const found = await ensurePlayer(storage, fetchFn);
  if (found) {
    setPlayer(found);
    return;
  }
  playerLookup = 'failed';
  if (statsFor === null) renderStatsMessage(statsBody, STATS_ERROR_TEXT);
  setTimeout(() => void findPlayer(), PLAYER_RETRY_MS);
}

function showPlayerName(): void {
  if (!player) return;
  playerName.textContent = player.nickname;
  playerBar.hidden = false;
}

let renaming = false;

function openRenameForm(): void {
  if (!player) return;
  newNameInput.value = player.nickname;
  renameError.textContent = '';
  renameForm.hidden = false;
  newNameInput.focus();
  newNameInput.select();
}

function closeRenameForm(): void {
  renameForm.hidden = true;
  renameError.textContent = '';
  // Give the keyboard back to the game, so Space flaps again.
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
}

/** Renames the player (a random name when `nickname` is undefined); `close` shuts the form on success. */
function rename(nickname: string | undefined, close: boolean): void {
  if (!player || renaming) return;
  renaming = true;
  renameError.textContent = '';
  void changeName(storage, fetchFn, player, nickname).then((result: RenameResult) => {
    renaming = false;
    if (!result.ok) {
      renameError.textContent =
        result.reason === 'invalid' ? 'Use 1 to 20 characters.' : 'Could not change the name. Try again.';
      return;
    }
    player = result.player;
    showPlayerName();
    if (close) closeRenameForm();
    else newNameInput.value = result.player.nickname;
  });
}

changeNameButton.addEventListener('click', openRenameForm);
cancelRenameButton.addEventListener('click', closeRenameForm);
rerollButton.addEventListener('click', () => rename(undefined, false));
renameForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const error = nicknameError(newNameInput.value);
  if (error) {
    renameError.textContent = error;
    return;
  }
  rename(newNameInput.value.trim(), true);
});

// --- Side panel: Last game card and My stats ---------------------------------------------

function paragraph(text: string): HTMLParagraphElement {
  const p = document.createElement('p');
  p.textContent = text;
  return p;
}

function showLastGame(state: LastGameState): void {
  lastGameBody.replaceChildren(...lastGameView(state).map(paragraph));
}

const lastGame = createLastGame({
  fetchSummary: (gameId) => fetchSummary(fetchFn, gameId),
  setTimer: (fn, ms) => {
    const timer = setTimeout(fn, ms);
    return () => clearTimeout(timer);
  },
  onChange: (state) => {
    showLastGame(state);
    // The server has finished this game, so the stats now include it.
    if (state.kind === 'shown') loadStats();
  },
});

const STATS_ERROR_TEXT = 'Could not load your stats';
/** The last loaded stats (for the dev hook). */
let stats: PlayerStats | null = null;
/** The player whose stats are on screen, or null before the first load finished. */
let statsFor: string | null = null;
/** Bumped per request; an answer to an older request is ignored. */
let statsRequest = 0;

function loadStats(): void {
  if (!player) return;
  const playerId = player.id;
  const request = ++statsRequest;
  // The first load says so; later refreshes keep the old content until the new one arrives.
  if (statsFor === null) renderStatsMessage(statsBody, 'Loading…');
  void fetchStats(fetchFn, playerId).then((result) => {
    if (request !== statsRequest) return;
    if (!result.ok) {
      renderStatsMessage(statsBody, STATS_ERROR_TEXT);
      return;
    }
    stats = result.stats;
    statsFor = playerId;
    renderStats(statsBody, statsView(result.stats));
  });
}

showLastGame(lastGame.state());
renderStatsMessage(statsBody, 'Loading…');

// --- Game loop and input -----------------------------------------------------------------

const stepper = createStepper();
// Set when play starts or resumes; the next frame resets the stepper with its own timestamp,
// so time spent in ready, paused or a hidden tab never turns into steps.
let resetStepper = true;

function dispatch(action: SessionAction): void {
  const before = session.phase;
  setSession(handle(session, action));
  if (before !== 'playing' && session.phase === 'playing') resetStepper = true;
}

function frame(now: number): void {
  if (resetStepper || session.phase !== 'playing') {
    stepper.reset(now);
    resetStepper = false;
  }
  let steps: number;
  if (session.phase === 'ready' && session.script) {
    // A scripted session starts itself on its first tick, once its server game is in (or the wait is over).
    steps = session.gameId !== null || now >= scriptHoldUntil ? 1 : 0;
  } else {
    steps = stepper.advance(now);
  }
  if (steps > 0) {
    let next = session;
    for (let i = 0; i < steps; i++) next = tick(next);
    setSession(next);
  }
  render(ctx, session.game, session.phase);
  const text = recordingText();
  if (recordingLine.textContent !== text) recordingLine.textContent = text;
  requestAnimationFrame(frame);
}

window.addEventListener('keydown', (event) => {
  // Typing in the rename form, or a key on a focused button, is not game input.
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLButtonElement) return;
  // Stop Space from scrolling the page, including key repeats.
  if (event.code === 'Space') event.preventDefault();
  const action = actionFromKey(event);
  if (action) dispatch(action);
});

canvas.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  dispatch(actionFromPointer(event));
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && session.phase === 'playing') dispatch({ type: 'pause' });
});

if (import.meta.env.DEV) {
  const hook = {
    get phase() { return snapshot(session).phase; },
    get seed() { return snapshot(session).seed; },
    get step() { return snapshot(session).step; },
    get score() { return snapshot(session).score; },
    get death() { return snapshot(session).death; },
    get flapCount() { return snapshot(session).flapCount; },
    get gameId() { return session.gameId; },
    get online() { return online; },
    get pending() { return recorder?.pendingCount() ?? 0; },
    get lastResult() { return lastResult; },
    get summary() {
      const state = lastGame.state();
      return state.kind === 'shown' && state.gameId === session.gameId ? state.summary : null;
    },
    get stats() { return stats; },
    disconnectFor(ms: number) { recorder?.disconnectFor(ms); },
    replay,
  };
  Object.defineProperty(window, '__flappy', { value: Object.freeze(hook) });
}

requestAnimationFrame(frame);
void findPlayer();

const status = document.querySelector<HTMLParagraphElement>('#status')!;
fetch('/api/health')
  .then((res) => res.json())
  .then((body: { ok: boolean }) => {
    status.textContent = body.ok
      ? `Server OK · engine at ${STEPS_PER_SECOND} steps/s`
      : 'Server error';
  })
  .catch(() => {
    status.textContent = 'Server unreachable';
  });
