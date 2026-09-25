import { describe, expect, it, vi } from 'vitest';
import {
  checkPlayer,
  clearPlayer,
  loadPlayer,
  registerPlayer,
  reserveGame,
  savePlayer,
  type FetchFn,
  type StorageLike,
} from './api.ts';

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

function reply(status: number, body?: unknown): FetchFn {
  return vi.fn(async () => new Response(body === undefined ? null : JSON.stringify(body), { status }));
}

function sentBody(fetchFn: FetchFn): unknown {
  const init = vi.mocked(fetchFn).mock.calls[0]![1];
  return JSON.parse(String(init?.body));
}

describe('api', () => {
  it('stores and loads the player', () => {
    const storage = memoryStorage();
    expect(loadPlayer(storage)).toBeNull();
    savePlayer(storage, { id: 'p1', nickname: 'Ann' });
    expect(JSON.parse(storage.data['flappy.player']!)).toEqual({ id: 'p1', nickname: 'Ann' });
    expect(loadPlayer(storage)).toEqual({ id: 'p1', nickname: 'Ann' });
    clearPlayer(storage);
    expect(loadPlayer(storage)).toBeNull();

    expect(loadPlayer(memoryStorage({ 'flappy.player': '{not json' }))).toBeNull();
    expect(loadPlayer(memoryStorage({ 'flappy.player': '{"id":5}' }))).toBeNull();
    const broken: StorageLike = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {},
      removeItem: () => {},
    };
    expect(loadPlayer(broken)).toBeNull();
  });

  it('registerPlayer posts the nickname', async () => {
    const fetchFn = reply(201, { id: 'p1', nickname: 'Ann' });
    expect(await registerPlayer(fetchFn, 'Ann')).toEqual({ id: 'p1', nickname: 'Ann' });
    const [url, init] = vi.mocked(fetchFn).mock.calls[0]!;
    expect(url).toBe('/api/players');
    expect(init?.method).toBe('POST');
    expect(sentBody(fetchFn)).toEqual({ nickname: 'Ann' });
  });

  it('registerPlayer returns null on failure', async () => {
    expect(await registerPlayer(reply(400, { error: 'bad' }), '')).toBeNull();
    expect(await registerPlayer(vi.fn(async () => Promise.reject(new Error('offline'))), 'Ann')).toBeNull();
  });

  it('unknown stored player is null', async () => {
    const fetchFn = reply(404, { error: 'not found' });
    expect(await checkPlayer(fetchFn, 'p/1')).toBeNull();
    expect(vi.mocked(fetchFn).mock.calls[0]![0]).toBe('/api/players/p%2F1');
    expect(await checkPlayer(reply(200, { id: 'p1', nickname: 'Ann' }), 'p1')).toEqual({ id: 'p1', nickname: 'Ann' });
  });

  it('checkPlayer throws when the server cannot answer', async () => {
    // Offline or a server error must not look like "unknown player", or the stored player would be cleared.
    await expect(checkPlayer(vi.fn(async () => Promise.reject(new Error('offline'))), 'p1')).rejects.toThrow();
    await expect(checkPlayer(reply(500), 'p1')).rejects.toThrow();
  });

  it('reserveGame returns null when offline', async () => {
    const ok = reply(201, { gameId: 'g1', seed: 1234 });
    expect(await reserveGame(ok, 'p1')).toEqual({ gameId: 'g1', seed: 1234 });
    expect(vi.mocked(ok).mock.calls[0]![0]).toBe('/api/games');
    expect(vi.mocked(ok).mock.calls[0]![1]?.method).toBe('POST');
    expect(sentBody(ok)).toEqual({ playerId: 'p1' });

    const withSeed = reply(201, { gameId: 'g2', seed: 42 });
    expect(await reserveGame(withSeed, 'p1', 42)).toEqual({ gameId: 'g2', seed: 42 });
    expect(sentBody(withSeed)).toEqual({ playerId: 'p1', seed: 42 });

    expect(await reserveGame(vi.fn(async () => Promise.reject(new Error('offline'))), 'p1')).toBeNull();
    expect(await reserveGame(reply(404, { error: 'unknown player' }), 'p1')).toBeNull();
    expect(await reserveGame(reply(201, { gameId: 7 }), 'p1')).toBeNull();
  });
});
