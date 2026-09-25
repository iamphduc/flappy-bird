import { MAX_BATCH, type GameEvent, type ServerMessage } from '@flappy/engine';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRecorder, type SocketLike } from './recorder.ts';

/** A WebSocket stand-in the test drives by hand. */
class FakeSocket implements SocketLike {
  readyState = 0;
  sent: unknown[] = [];
  sendThrows = false;
  closed = false;
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;

  send(data: string): void {
    if (this.sendThrows) throw new Error('send failed');
    this.sent.push(JSON.parse(data));
  }
  close(): void {
    this.closed = true;
    this.readyState = 3;
    // A real socket fires close after close(); the recorder must not treat that as a drop.
    this.onclose?.({});
  }
  open(): void {
    this.readyState = 1;
    this.onopen?.({});
  }
  drop(): void {
    this.readyState = 3;
    this.onerror?.({});
    this.onclose?.({});
  }
  receive(message: ServerMessage | string): void {
    this.onmessage?.({ data: typeof message === 'string' ? message : JSON.stringify(message) });
  }
}

function setup(options: { onResult?: (m: ServerMessage) => void; onStatus?: (s: 'online' | 'offline') => void } = {}) {
  const sockets: FakeSocket[] = [];
  const connect = vi.fn(() => {
    const socket = new FakeSocket();
    sockets.push(socket);
    return socket;
  });
  const recorder = createRecorder({ connect, playerId: 'p1', ...options });
  const last = () => sockets[sockets.length - 1]!;
  return { recorder, sockets, connect, last };
}

function events(from: number, to: number): GameEvent[] {
  const list: GameEvent[] = [];
  for (let seq = from; seq <= to; seq++) {
    list.push(seq === 0 ? { seq, step: 0, type: 'start' } : { seq, step: seq, type: 'flap', source: 'space' });
  }
  return list;
}

function sentSeqs(socket: FakeSocket, gameId: string): number[] {
  return socket.sent
    .filter((m): m is { type: 'events'; gameId: string; events: GameEvent[] } => {
      const msg = m as { type: string; gameId?: string };
      return msg.type === 'events' && msg.gameId === gameId;
    })
    .flatMap((m) => m.events.map((e) => e.seq));
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('recorder', () => {
  it('sends hello then buffered events on open', () => {
    const { recorder, last, connect } = setup();
    expect(connect).toHaveBeenCalledTimes(1);
    recorder.record('g1', events(0, 1));
    recorder.record('g2', events(0, 0));
    expect(last().sent).toEqual([]);

    last().open();
    expect(last().sent).toEqual([
      { type: 'hello', playerId: 'p1' },
      { type: 'events', gameId: 'g1', events: events(0, 1) },
      { type: 'events', gameId: 'g2', events: events(0, 0) },
    ]);

    // While open, new events go out at once.
    recorder.record('g1', events(2, 2));
    expect(last().sent[3]).toEqual({ type: 'events', gameId: 'g1', events: events(2, 2) });
  });

  it('resends in batches of at most MAX_BATCH', () => {
    const { recorder, last } = setup();
    recorder.record('g1', events(0, MAX_BATCH + 9));
    last().open();
    const batches = last().sent.slice(1) as { events: GameEvent[] }[];
    expect(batches.map((b) => b.events.length)).toEqual([MAX_BATCH, 10]);
    expect(sentSeqs(last(), 'g1')).toEqual(events(0, MAX_BATCH + 9).map((e) => e.seq));
  });

  it('buffers while offline and resends after reconnect', () => {
    const { recorder, last, sockets } = setup();
    last().open();
    recorder.record('g1', events(0, 1));
    last().drop();

    expect(() => recorder.record('g1', events(2, 3))).not.toThrow();
    expect(recorder.pendingCount()).toBe(4);

    vi.advanceTimersByTime(1000);
    expect(sockets).toHaveLength(2);
    last().open();
    expect(last().sent[0]).toEqual({ type: 'hello', playerId: 'p1' });
    expect(sentSeqs(last(), 'g1')).toEqual([0, 1, 2, 3]);
  });

  it('resends only unacked events after reconnect', () => {
    const { recorder, last } = setup();
    last().open();
    recorder.record('g1', events(0, 4));
    last().receive({ type: 'ack', gameId: 'g1', upTo: 2 });
    expect(recorder.pendingCount()).toBe(2);

    // Events already acked are not buffered again.
    recorder.record('g1', events(1, 1));
    expect(recorder.pendingCount()).toBe(2);

    last().drop();
    vi.advanceTimersByTime(1000);
    last().open();
    expect(sentSeqs(last(), 'g1')).toEqual([3, 4]);

    last().receive({ type: 'ack', gameId: 'g1', upTo: 4 });
    expect(recorder.pendingCount()).toBe(0);
  });

  it('reconnects with capped backoff', () => {
    const { last, connect } = setup();
    const delays = [1000, 2000, 4000, 8000, 10000, 10000];
    for (const [i, delay] of delays.entries()) {
      last().drop();
      vi.advanceTimersByTime(delay - 1);
      expect(connect).toHaveBeenCalledTimes(i + 1);
      vi.advanceTimersByTime(1);
      expect(connect).toHaveBeenCalledTimes(i + 2);
    }

    // A successful open resets the delay to 1 s.
    last().open();
    last().drop();
    vi.advanceTimersByTime(1000);
    expect(connect).toHaveBeenCalledTimes(delays.length + 2);
  });

  it('a connect that throws is retried', () => {
    let fail = true;
    const sockets: FakeSocket[] = [];
    const connect = vi.fn(() => {
      if (fail) throw new Error('bad url');
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    });
    const recorder = createRecorder({ connect, playerId: 'p1' });
    expect(() => recorder.record('g1', events(0, 0))).not.toThrow();
    fail = false;
    vi.advanceTimersByTime(1000);
    expect(sockets).toHaveLength(1);
    sockets[0]!.open();
    expect(sentSeqs(sockets[0]!, 'g1')).toEqual([0]);
  });

  it('record never throws', () => {
    const { recorder, last } = setup();
    last().open();
    last().sendThrows = true;
    expect(() => recorder.record('g1', events(0, 2))).not.toThrow();
    expect(recorder.pendingCount()).toBe(3);

    last().drop();
    vi.advanceTimersByTime(1000);
    last().open();
    expect(sentSeqs(last(), 'g1')).toEqual([0, 1, 2]);
  });

  it('ignores bad server messages', () => {
    const { recorder, last } = setup();
    last().open();
    recorder.record('g1', events(0, 1));
    expect(() => last().receive('not json')).not.toThrow();
    expect(() => last().receive({ type: 'ack', gameId: 'g1' } as unknown as ServerMessage)).not.toThrow();
    expect(recorder.pendingCount()).toBe(2);
  });

  it('result and status callbacks fire', () => {
    const onResult = vi.fn();
    const onStatus = vi.fn();
    const { last } = setup({ onResult, onStatus });
    last().open();
    expect(onStatus).toHaveBeenLastCalledWith('online');

    const result: ServerMessage = {
      type: 'result',
      gameId: 'g1',
      status: 'complete',
      score: 2,
      deathStep: 296,
      deathCause: 'ground',
      flapCount: 7,
      pressCount: 7,
      mismatch: false,
    };
    last().receive(result);
    expect(onResult).toHaveBeenCalledWith(result);

    last().drop();
    expect(onStatus).toHaveBeenLastCalledWith('offline');
    // onerror and onclose from one drop give a single offline status.
    expect(onStatus.mock.calls).toEqual([['online'], ['offline']]);
  });

  it('disconnectFor holds the connection down', () => {
    const onStatus = vi.fn();
    const { recorder, last, connect } = setup({ onStatus });
    last().open();
    const first = last();
    recorder.disconnectFor(5000);
    expect(first.closed).toBe(true);
    expect(onStatus).toHaveBeenLastCalledWith('offline');

    recorder.record('g1', events(0, 0));
    expect(first.sent).toEqual([{ type: 'hello', playerId: 'p1' }]);

    vi.advanceTimersByTime(4999);
    expect(connect).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(connect).toHaveBeenCalledTimes(2);
    last().open();
    expect(sentSeqs(last(), 'g1')).toEqual([0]);
  });
});

describe('SocketLike', () => {
  it('a browser WebSocket fits SocketLike', () => {
    // Compile-time check (pnpm typecheck): the page passes a real WebSocket to connect.
    const fits = (socket: WebSocket): SocketLike => socket;
    expect(typeof fits).toBe('function');
  });
});
