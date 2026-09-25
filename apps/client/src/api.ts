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

function sendJson(fetchFn: FetchFn, method: 'POST' | 'PATCH', url: string, body: unknown): Promise<Response> {
  return fetchFn(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function postJson(fetchFn: FetchFn, url: string, body: unknown): Promise<Response> {
  return sendJson(fetchFn, 'POST', url, body);
}

/** `{}` when there is no nickname (the server then picks a funny name), else `{ nickname }`. */
function nicknameBody(nickname: string | undefined): { nickname?: string } {
  return nickname === undefined ? {} : { nickname };
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

export type RenameResult =
  | { ok: true; player: Player }
  | { ok: false; reason: 'invalid' | 'unknown-player' | 'error' };

/**
 * Registers a player. With no nickname the server picks a funny name.
 * Returns null on any network or HTTP error (never throws).
 */
export async function registerPlayer(fetchFn: FetchFn, nickname?: string): Promise<Player | null> {
  try {
    const res = await postJson(fetchFn, '/api/players', nicknameBody(nickname));
    return res.ok ? asPlayer(await res.json()) : null;
  } catch {
    return null;
  }
}

/**
 * Renames a player; with no nickname the server picks a new funny name (the "reroll").
 * 400 → 'invalid', 404 → 'unknown-player', anything else that is not a player → 'error'. Never throws.
 */
export async function renamePlayer(fetchFn: FetchFn, id: string, nickname?: string): Promise<RenameResult> {
  try {
    const res = await sendJson(fetchFn, 'PATCH', `/api/players/${encodeURIComponent(id)}`, nicknameBody(nickname));
    if (res.status === 400) return { ok: false, reason: 'invalid' };
    if (res.status === 404) return { ok: false, reason: 'unknown-player' };
    if (!res.ok) return { ok: false, reason: 'error' };
    const player = asPlayer(await res.json());
    return player ? { ok: true, player } : { ok: false, reason: 'error' };
  } catch {
    return { ok: false, reason: 'error' };
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
