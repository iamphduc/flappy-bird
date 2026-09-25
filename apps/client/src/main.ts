import { STEPS_PER_SECOND, replay, type ServerMessage } from '@flappy/engine';
import {
  checkPlayer,
  clearPlayer,
  loadPlayer,
  registerPlayer,
  reserveGame,
  savePlayer,
  type Player,
  type ReservedGame,
  type StorageLike,
} from './api.ts';
import { parseDevParams } from './devParams.ts';
import { actionFromKey, actionFromPointer } from './input.ts';
import { createStepper } from './loop.ts';
import { createRecorder, type Recorder } from './recorder.ts';
import { render } from './render.ts';
import { assignGame, createSession, handle, snapshot, tick, type Session, type SessionAction } from './session.ts';

type ResultMessage = Extract<ServerMessage, { type: 'result' }>;

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const ctx = canvas.getContext('2d')!;
const playerForm = document.querySelector<HTMLFormElement>('#player-form')!;
const nicknameInput = document.querySelector<HTMLInputElement>('#nickname')!;
const playerError = document.querySelector<HTMLSpanElement>('#player-error')!;
const recordingLine = document.querySelector<HTMLParagraphElement>('#recording')!;

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
  playerForm.hidden = true;
  recorder = createRecorder({
    connect: () => {
      const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
      return new WebSocket(`${scheme}://${window.location.host}/api/ws`);
    },
    playerId: next.id,
    onResult: (message) => {
      lastResult = message;
    },
    onStatus: (status) => {
      online = status === 'online';
      // Back online: a failed reservation can be tried again.
      if (online) reserveNext();
    },
  });
  reserveNext();
}

function showPlayerForm(): void {
  playerForm.hidden = false;
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
  // Reserve while in ready, and reserve the following game as soon as one starts.
  if (session.phase === 'ready' || (before.phase === 'ready' && session.phase === 'playing')) reserveNext();

  forwardEvents();
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
  if (!player) return 'Enter a nickname to record your games';
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

async function loadStoredPlayer(): Promise<void> {
  const stored = loadPlayer(storage);
  if (stored) {
    try {
      const known = await checkPlayer(fetchFn, stored.id);
      if (known) {
        setPlayer(known);
      } else {
        clearPlayer(storage);
        showPlayerForm();
      }
    } catch {
      // The server cannot answer right now: keep the stored player; the recorder retries.
      setPlayer(stored);
    }
    return;
  }
  if (session.script) {
    // A scripted dev run registers itself so it can be recorded without typing.
    const smoke = await registerPlayer(fetchFn, 'smoke');
    if (smoke) {
      saveQuietly(smoke);
      setPlayer(smoke);
      return;
    }
  }
  showPlayerForm();
}

function saveQuietly(p: Player): void {
  try {
    savePlayer(storage, p);
  } catch {
    // Storage full or blocked: the player only lasts for this page.
  }
}

playerForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const nickname = nicknameInput.value.trim();
  if (nickname.length === 0 || nickname.length > 20) {
    playerError.textContent = 'Use 1 to 20 characters.';
    return;
  }
  playerError.textContent = '';
  void registerPlayer(fetchFn, nickname).then((registered) => {
    if (!registered) {
      playerError.textContent = 'Could not save the nickname. Try again.';
      return;
    }
    saveQuietly(registered);
    setPlayer(registered);
  });
});

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
  // Typing in the nickname form is not game input.
  if (event.target instanceof HTMLInputElement) return;
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
    disconnectFor(ms: number) { recorder?.disconnectFor(ms); },
    replay,
  };
  Object.defineProperty(window, '__flappy', { value: Object.freeze(hook) });
}

requestAnimationFrame(frame);
void loadStoredPlayer();

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
