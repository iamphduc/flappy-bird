// Player rules for the page: get a player without asking for a name, rename it, and check a typed
// name. DOM-free; `storage` and `fetchFn` are passed in (the page passes `localStorage` and `fetch`).

import {
  checkPlayer,
  clearPlayer,
  loadPlayer,
  registerPlayer,
  renamePlayer,
  savePlayer,
  type FetchFn,
  type Player,
  type RenameResult,
  type StorageLike,
} from './api.ts';

const MAX_NICKNAME = 20;
const NICKNAME_ERROR = 'Use 1 to 20 characters.';

/** Runs a storage write; a blocked storage only means the player lasts for this page. */
function tryStorage(write: () => void): void {
  try {
    write();
  } catch {
    // ignored on purpose
  }
}

async function registerNew(storage: StorageLike, fetchFn: FetchFn): Promise<Player | null> {
  const player = await registerPlayer(fetchFn);
  if (player) tryStorage(() => savePlayer(storage, player));
  return player;
}

/**
 * The player for this page. A stored player the server knows is kept (with the server's current
 * nickname); one the server doesn't know (404) is replaced by a new funny-named player; if the server
 * can't answer, the stored player is kept as is. With nothing stored a funny-named player is registered.
 * Null when there is no stored player and registering fails.
 */
export async function ensurePlayer(storage: StorageLike, fetchFn: FetchFn): Promise<Player | null> {
  const stored = loadPlayer(storage);
  if (!stored) return registerNew(storage, fetchFn);

  let known: Player | null;
  try {
    known = await checkPlayer(fetchFn, stored.id);
  } catch {
    return stored;
  }
  if (known) {
    tryStorage(() => savePlayer(storage, known));
    return known;
  }
  tryStorage(() => clearPlayer(storage));
  return registerNew(storage, fetchFn);
}

/** Renames `player` (a random name when `nickname` is undefined); saves the new player on success only. */
export async function changeName(
  storage: StorageLike,
  fetchFn: FetchFn,
  player: Player,
  nickname?: string,
): Promise<RenameResult> {
  const result = await renamePlayer(fetchFn, player.id, nickname);
  if (result.ok) tryStorage(() => savePlayer(storage, result.player));
  return result;
}

/** The message to show for a typed nickname, or null when it is fine (1 to 20 characters once trimmed). */
export function nicknameError(text: string): string | null {
  const length = text.trim().length;
  return length === 0 || length > MAX_NICKNAME ? NICKNAME_ERROR : null;
}
