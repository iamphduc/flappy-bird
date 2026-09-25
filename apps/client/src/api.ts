// Player storage and the HTTP calls around recording. `storage` and `fetchFn` are passed in,
// so tests need no DOM (the page passes `localStorage` and `fetch`).

export interface Player {
  id: string;
  nickname: string;
}

export interface ReservedGame {
  gameId: string;
  seed: number;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

const PLAYER_KEY = 'flappy.player';

function asPlayer(value: unknown): Player | null {
  if (typeof value !== 'object' || value === null) return null;
  const { id, nickname } = value as Record<string, unknown>;
  return typeof id === 'string' && typeof nickname === 'string' ? { id, nickname } : null;
}

function postJson(fetchFn: FetchFn, url: string, body: unknown): Promise<Response> {
  return fetchFn(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** The stored player, or null if none is stored or the stored value is unreadable. */
export function loadPlayer(storage: StorageLike): Player | null {
  try {
    const raw = storage.getItem(PLAYER_KEY);
    return raw === null ? null : asPlayer(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function savePlayer(storage: StorageLike, player: Player): void {
  storage.setItem(PLAYER_KEY, JSON.stringify({ id: player.id, nickname: player.nickname }));
}

export function clearPlayer(storage: StorageLike): void {
  storage.removeItem(PLAYER_KEY);
}

/** Registers a nickname. Returns null on any network or HTTP error (never throws). */
export async function registerPlayer(fetchFn: FetchFn, nickname: string): Promise<Player | null> {
  try {
    const res = await postJson(fetchFn, '/api/players', { nickname });
    return res.ok ? asPlayer(await res.json()) : null;
  } catch {
    return null;
  }
}

/**
 * Looks up a stored player: the player, or null when the server does not know it (404).
 * Throws when the server cannot answer (offline, 5xx), so a stored player is not dropped for that.
 */
export async function checkPlayer(fetchFn: FetchFn, id: string): Promise<Player | null> {
  const res = await fetchFn(`/api/players/${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`checkPlayer failed: HTTP ${res.status}`);
  const player = asPlayer(await res.json());
  if (!player) throw new Error('checkPlayer failed: bad response');
  return player;
}

/** Reserves the next game. Returns null on any network or HTTP error (never throws). */
export async function reserveGame(fetchFn: FetchFn, playerId: string, seed?: number): Promise<ReservedGame | null> {
  try {
    const res = await postJson(fetchFn, '/api/games', seed === undefined ? { playerId } : { playerId, seed });
    if (!res.ok) return null;
    const body = (await res.json()) as Record<string, unknown> | null;
    const gameId = body?.gameId;
    const gameSeed = body?.seed;
    return typeof gameId === 'string' && typeof gameSeed === 'number' ? { gameId, seed: gameSeed } : null;
  } catch {
    return null;
  }
}
