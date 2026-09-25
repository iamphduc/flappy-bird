import { MAX_BATCH, type ClientMessage, type GameEvent, type ServerMessage } from '@flappy/engine';

/** The parts of a WebSocket the recorder uses, so tests can pass a fake one. */
export interface SocketLike {
  send(data: string): void;
  close(): void;
  readyState: number;
  onopen: ((ev: never) => void) | null;
  /** Called with a message event; only its `data` is read. */
  onmessage: ((ev: never) => void) | null;
  onclose: ((ev: never) => void) | null;
  onerror: ((ev: never) => void) | null;
}

export type RecorderStatus = 'online' | 'offline';

export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface RecorderOptions {
  connect: () => SocketLike;
  playerId: string;
  onResult?: (message: Extract<ServerMessage, { type: 'result' }>) => void;
  onStatus?: (status: RecorderStatus) => void;
  timers?: Timers;
}

export interface Recorder {
  /** Buffers events and sends them if the socket is open. Never throws, never waits. */
  record(gameId: string, events: readonly GameEvent[]): void;
  /** Events not yet acked by the server, over all games. */
  pendingCount(): number;
  /** Closes the socket and holds off reconnecting for `ms`. */
  disconnectFor(ms: number): void;
}

const OPEN = 1;
const FIRST_DELAY_MS = 1000;
const MAX_DELAY_MS = 10_000;

const defaultTimers: Timers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * Streams game events over a socket. Every event stays buffered until the server acks it,
 * and all unacked events are resent after each reconnect (the server ignores duplicates).
 */
export function createRecorder({ connect, playerId, onResult, onStatus, timers = defaultTimers }: RecorderOptions): Recorder {
  /** Unacked events per game, sorted by seq. */
  const buffers = new Map<string, GameEvent[]>();
  /** Highest acked seq per game. */
  const acked = new Map<string, number>();
  let socket: SocketLike | null = null;
  let open = false;
  let delay = FIRST_DELAY_MS;
  let retry: unknown = null;
  let status: RecorderStatus | null = null;

  function setStatus(next: RecorderStatus): void {
    if (status === next) return;
    status = next;
    onStatus?.(next);
  }

  function send(message: ClientMessage): void {
    if (!socket || !open || socket.readyState !== OPEN) return;
    socket.send(JSON.stringify(message));
  }

  function sendEvents(gameId: string, events: readonly GameEvent[]): void {
    for (let i = 0; i < events.length; i += MAX_BATCH) {
      send({ type: 'events', gameId, events: events.slice(i, i + MAX_BATCH) });
    }
  }

  function scheduleConnect(ms: number): void {
    if (retry !== null) timers.clearTimeout(retry);
    retry = timers.setTimeout(() => {
      retry = null;
      start();
    }, ms);
  }

  /** Detaches and closes the current socket without triggering a reconnect. */
  function dropSocket(): void {
    const old = socket;
    socket = null;
    open = false;
    if (!old) return;
    old.onopen = old.onmessage = old.onclose = old.onerror = null;
    try {
      old.close();
    } catch {
      // Already closed.
    }
  }

  function onLost(): void {
    dropSocket();
    setStatus('offline');
    scheduleConnect(delay);
    delay = Math.min(delay * 2, MAX_DELAY_MS);
  }

  function onMessage(data: unknown): void {
    let message: unknown;
    try {
      message = JSON.parse(String(data));
    } catch {
      return;
    }
    if (typeof message !== 'object' || message === null) return;
    const msg = message as Partial<Record<string, unknown>>;
    if (msg.type === 'ack' && typeof msg.gameId === 'string' && typeof msg.upTo === 'number') {
      const upTo = Math.max(msg.upTo, acked.get(msg.gameId) ?? -1);
      acked.set(msg.gameId, upTo);
      const left = (buffers.get(msg.gameId) ?? []).filter((e) => e.seq > upTo);
      if (left.length > 0) buffers.set(msg.gameId, left);
      else buffers.delete(msg.gameId);
    } else if (msg.type === 'result' && typeof msg.gameId === 'string') {
      onResult?.(message as Extract<ServerMessage, { type: 'result' }>);
    }
  }

  function start(): void {
    let next: SocketLike;
    try {
      next = connect();
    } catch {
      onLost();
      return;
    }
    socket = next;
    next.onopen = () => {
      open = true;
      delay = FIRST_DELAY_MS;
      setStatus('online');
      try {
        send({ type: 'hello', playerId });
        for (const [gameId, events] of buffers) sendEvents(gameId, events);
      } catch {
        // Unsent events stay buffered for the next open.
      }
    };
    next.onmessage = (ev: { data: unknown }) => onMessage(ev.data);
    next.onclose = onLost;
    next.onerror = onLost;
  }

  start();

  return {
    record(gameId, events) {
      try {
        const buffer = buffers.get(gameId) ?? [];
        const done = acked.get(gameId) ?? -1;
        const known = new Set(buffer.map((e) => e.seq));
        const fresh = events.filter((e) => e.seq > done && !known.has(e.seq));
        if (fresh.length === 0) return;
        buffers.set(gameId, [...buffer, ...fresh].sort((a, b) => a.seq - b.seq));
        sendEvents(gameId, fresh);
      } catch {
        // Never throw into the game loop; the events stay buffered.
      }
    },
    pendingCount() {
      let count = 0;
      for (const events of buffers.values()) count += events.length;
      return count;
    },
    disconnectFor(ms) {
      dropSocket();
      setStatus('offline');
      scheduleConnect(ms);
    },
  };
}
