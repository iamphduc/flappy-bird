import { describe, expect, it, vi } from 'vitest';
import type { FetchFn, StorageLike } from './api.ts';
import { changeName, ensurePlayer, nicknameError } from './player.ts';

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => (key in data ? data[key]! : null),
    setItem: (key, value) => {
      data[key] = value;
    },
    removeItem: (key) => {
      delete data[key];
    },
  };
}

function stored(id: string, nickname: string): Record<string, string> {
  return { 'flappy.player': JSON.stringify({ id, nickname }) };
}

type Route = (init?: RequestInit) => Response | Promise<Response>;

/** A fake server: `routes` maps 'METHOD /path' to a handler; anything else is a 500. */
function fakeServer(routes: Record<string, Route>): FetchFn {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const route = routes[`${init?.method ?? 'GET'} ${url}`];
    return route ? route(init) : new Response(null, { status: 500 });
  });
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

function calls(fetchFn: FetchFn): string[] {
  return vi.mocked(fetchFn).mock.calls.map(([url, init]) => `${init?.method ?? 'GET'} ${url}`);
}

const offline: FetchFn = vi.fn(async () => Promise.reject(new Error('offline')));

describe('player', () => {
  it('ensurePlayer creates a funny-named player on first visit', async () => {
    const storage = memoryStorage();
    const fetchFn = fakeServer({ 'POST /api/players': () => json(201, { id: 'p1', nickname: 'Wobbly Otter 42' }) });
    expect(await ensurePlayer(storage, fetchFn)).toEqual({ id: 'p1', nickname: 'Wobbly Otter 42' });
    expect(calls(fetchFn)).toEqual(['POST /api/players']);
    expect(JSON.parse(String(vi.mocked(fetchFn).mock.calls[0]![1]?.body))).toEqual({});
    expect(JSON.parse(storage.data['flappy.player']!)).toEqual({ id: 'p1', nickname: 'Wobbly Otter 42' });
  });

  it('ensurePlayer keeps a known stored player', async () => {
    const storage = memoryStorage(stored('p1', 'Old'));
    const fetchFn = fakeServer({ 'GET /api/players/p1': () => json(200, { id: 'p1', nickname: 'New' }) });
    expect(await ensurePlayer(storage, fetchFn)).toEqual({ id: 'p1', nickname: 'New' });
    expect(calls(fetchFn)).toEqual(['GET /api/players/p1']);
    expect(JSON.parse(storage.data['flappy.player']!)).toEqual({ id: 'p1', nickname: 'New' });
  });

  it('ensurePlayer replaces an unknown stored player', async () => {
    const storage = memoryStorage(stored('gone', 'Ann'));
    const fetchFn = fakeServer({
      'GET /api/players/gone': () => json(404, { error: 'unknown player' }),
      'POST /api/players': () => json(201, { id: 'p2', nickname: 'Sleepy Llama 7' }),
    });
    expect(await ensurePlayer(storage, fetchFn)).toEqual({ id: 'p2', nickname: 'Sleepy Llama 7' });
    expect(calls(fetchFn)).toEqual(['GET /api/players/gone', 'POST /api/players']);
    expect(JSON.parse(String(vi.mocked(fetchFn).mock.calls[1]![1]?.body))).toEqual({});
    expect(JSON.parse(storage.data['flappy.player']!)).toEqual({ id: 'p2', nickname: 'Sleepy Llama 7' });

    // The unknown player is cleared even when a new one can't be registered.
    const noRegister = memoryStorage(stored('gone', 'Ann'));
    const down = fakeServer({ 'GET /api/players/gone': () => json(404, { error: 'unknown player' }) });
    expect(await ensurePlayer(noRegister, down)).toBeNull();
    expect(noRegister.data['flappy.player']).toBeUndefined();
  });

  it('ensurePlayer works offline', async () => {
    const raw = JSON.stringify({ id: 'p1', nickname: 'Ann' });
    const storage = memoryStorage({ 'flappy.player': raw });
    expect(await ensurePlayer(storage, offline)).toEqual({ id: 'p1', nickname: 'Ann' });
    expect(storage.data).toEqual({ 'flappy.player': raw });

    // A server error (not a 404) also keeps the stored player.
    const serverError = memoryStorage({ 'flappy.player': raw });
    expect(await ensurePlayer(serverError, fakeServer({}))).toEqual({ id: 'p1', nickname: 'Ann' });
    expect(serverError.data).toEqual({ 'flappy.player': raw });

    const fresh = memoryStorage();
    expect(await ensurePlayer(fresh, offline)).toBeNull();
    expect(fresh.data).toEqual({});
  });

  it('ensurePlayer survives blocked storage', async () => {
    const blocked: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    const fetchFn = fakeServer({ 'POST /api/players': () => json(201, { id: 'p1', nickname: 'Wobbly Otter 42' }) });
    expect(await ensurePlayer(blocked, fetchFn)).toEqual({ id: 'p1', nickname: 'Wobbly Otter 42' });

    // Known stored player, but saving the server's copy throws.
    const readOnly: StorageLike = { ...blocked, getItem: () => JSON.stringify({ id: 'p1', nickname: 'Old' }) };
    const known = fakeServer({ 'GET /api/players/p1': () => json(200, { id: 'p1', nickname: 'New' }) });
    expect(await ensurePlayer(readOnly, known)).toEqual({ id: 'p1', nickname: 'New' });

    // Unknown stored player, and clearing it throws.
    const unknown = fakeServer({
      'GET /api/players/p1': () => json(404, { error: 'unknown player' }),
      'POST /api/players': () => json(201, { id: 'p2', nickname: 'Sleepy Llama 7' }),
    });
    expect(await ensurePlayer(readOnly, unknown)).toEqual({ id: 'p2', nickname: 'Sleepy Llama 7' });
  });

  it('changeName saves only a successful rename', async () => {
    const player = { id: 'p1', nickname: 'Ann' };
    const raw = JSON.stringify(player);

    const storage = memoryStorage({ 'flappy.player': raw });
    const typed = fakeServer({ 'PATCH /api/players/p1': () => json(200, { id: 'p1', nickname: 'Zed' }) });
    expect(await changeName(storage, typed, player, 'Zed')).toEqual({ ok: true, player: { id: 'p1', nickname: 'Zed' } });
    expect(JSON.parse(String(vi.mocked(typed).mock.calls[0]![1]?.body))).toEqual({ nickname: 'Zed' });
    expect(JSON.parse(storage.data['flappy.player']!)).toEqual({ id: 'p1', nickname: 'Zed' });

    const rerolled = memoryStorage({ 'flappy.player': raw });
    const reroll = fakeServer({ 'PATCH /api/players/p1': () => json(200, { id: 'p1', nickname: 'Sleepy Llama 7' }) });
    expect(await changeName(rerolled, reroll, player)).toEqual({
      ok: true,
      player: { id: 'p1', nickname: 'Sleepy Llama 7' },
    });
    expect(JSON.parse(String(vi.mocked(reroll).mock.calls[0]![1]?.body))).toEqual({});
    expect(JSON.parse(rerolled.data['flappy.player']!)).toEqual({ id: 'p1', nickname: 'Sleepy Llama 7' });

    const invalid = memoryStorage({ 'flappy.player': raw });
    const bad = fakeServer({ 'PATCH /api/players/p1': () => json(400, { error: 'nickname must be 1-20 characters' }) });
    expect(await changeName(invalid, bad, player, ' ')).toEqual({ ok: false, reason: 'invalid' });
    expect(invalid.data).toEqual({ 'flappy.player': raw });

    const failed = memoryStorage({ 'flappy.player': raw });
    expect(await changeName(failed, offline, player, 'Zed')).toEqual({ ok: false, reason: 'error' });
    expect(failed.data).toEqual({ 'flappy.player': raw });

    // A successful rename still comes back when saving it throws.
    const blocked: StorageLike = {
      getItem: () => raw,
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {},
    };
    expect(await changeName(blocked, typed, player, 'Zed')).toEqual({ ok: true, player: { id: 'p1', nickname: 'Zed' } });
  });

  it('nicknameError checks the length', () => {
    const message = 'Use 1 to 20 characters.';
    expect(nicknameError('')).toBe(message);
    expect(nicknameError('   ')).toBe(message);
    expect(nicknameError('a'.repeat(21))).toBe(message);
    expect(nicknameError('Ann')).toBeNull();
    expect(nicknameError('a'.repeat(20))).toBeNull();
    expect(nicknameError('  Ann  ')).toBeNull();
  });
});
