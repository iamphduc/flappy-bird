import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type Db = DatabaseSync;

export type SeedSource = "server" | "dev";
export type GameStatus = "created" | "open" | "complete" | "incomplete";

export interface PlayerRecord {
  id: string;
  nickname: string;
  createdAt: number;
}

export interface GameRecord {
  id: string;
  playerId: string;
  seed: number;
  seedSource: SeedSource;
  status: GameStatus;
  createdAt: number;
  lastEventAt: number | null;
  score: number | null;
  deathStep: number | null;
  deathCause: string | null;
  flapCount: number | null;
  pressCount: number | null;
  clientScore: number | null;
  clientDeathStep: number | null;
  mismatch: boolean | null;
}

export interface StoredEvent {
  seq: number;
  step: number;
  type: string;
  source: string | null;
  cause: string | null;
  score: number | null;
  receivedAt: number;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  nickname TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id),
  seed INTEGER NOT NULL,
  seed_source TEXT NOT NULL CHECK (seed_source IN ('server', 'dev')),
  status TEXT NOT NULL CHECK (status IN ('created', 'open', 'complete', 'incomplete')),
  created_at INTEGER NOT NULL,
  last_event_at INTEGER,
  score INTEGER,
  death_step INTEGER,
  death_cause TEXT,
  flap_count INTEGER,
  press_count INTEGER,
  client_score INTEGER,
  client_death_step INTEGER,
  mismatch INTEGER
);
CREATE INDEX IF NOT EXISTS games_player_id ON games(player_id);
CREATE INDEX IF NOT EXISTS games_status_last_event ON games(status, last_event_at);
CREATE TABLE IF NOT EXISTS events (
  game_id TEXT NOT NULL REFERENCES games(id),
  seq INTEGER NOT NULL,
  step INTEGER NOT NULL,
  type TEXT NOT NULL,
  source TEXT,
  cause TEXT,
  score INTEGER,
  received_at INTEGER NOT NULL,
  PRIMARY KEY (game_id, seq)
);
`;

/** Opens (and creates if needed) the database. Use ':memory:' in tests. */
export function openDb(path: string): Db {
  const inMemory = path === ":memory:";
  if (!inMemory) mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON");
  if (!inMemory) db.exec("PRAGMA journal_mode = WAL");
  db.exec(SCHEMA);
  return db;
}

type Row = Record<string, unknown>;

const str = (v: unknown): string => v as string;
const num = (v: unknown): number => v as number;
const numOrNull = (v: unknown): number | null => (v === null ? null : (v as number));
const strOrNull = (v: unknown): string | null => (v === null ? null : (v as string));

export function insertPlayer(db: Db, player: PlayerRecord): void {
  db.prepare("INSERT INTO players (id, nickname, created_at) VALUES (?, ?, ?)").run(
    player.id,
    player.nickname,
    player.createdAt,
  );
}

export function getPlayer(db: Db, id: string): PlayerRecord | undefined {
  const row = db.prepare("SELECT id, nickname, created_at FROM players WHERE id = ?").get(id) as Row | undefined;
  if (!row) return undefined;
  return { id: str(row.id), nickname: str(row.nickname), createdAt: num(row.created_at) };
}

/** Changes a player's nickname. True when the player exists (a row changed). */
export function renamePlayer(db: Db, id: string, nickname: string): boolean {
  const result = db.prepare("UPDATE players SET nickname = ? WHERE id = ?").run(nickname, id);
  return Number(result.changes) > 0;
}

export interface NewGame {
  id: string;
  playerId: string;
  seed: number;
  seedSource: SeedSource;
  createdAt: number;
}

export function insertGame(db: Db, game: NewGame): void {
  db.prepare(
    "INSERT INTO games (id, player_id, seed, seed_source, status, created_at) VALUES (?, ?, ?, ?, 'created', ?)",
  ).run(game.id, game.playerId, game.seed, game.seedSource, game.createdAt);
}

export function getGame(db: Db, id: string): GameRecord | undefined {
  const row = db.prepare("SELECT * FROM games WHERE id = ?").get(id) as Row | undefined;
  if (!row) return undefined;
  return {
    id: str(row.id),
    playerId: str(row.player_id),
    seed: num(row.seed),
    seedSource: str(row.seed_source) as SeedSource,
    status: str(row.status) as GameStatus,
    createdAt: num(row.created_at),
    lastEventAt: numOrNull(row.last_event_at),
    score: numOrNull(row.score),
    deathStep: numOrNull(row.death_step),
    deathCause: strOrNull(row.death_cause),
    flapCount: numOrNull(row.flap_count),
    pressCount: numOrNull(row.press_count),
    clientScore: numOrNull(row.client_score),
    clientDeathStep: numOrNull(row.client_death_step),
    mismatch: row.mismatch === null ? null : row.mismatch !== 0,
  };
}

/** A game's events in seq order. */
export function getGameEvents(db: Db, gameId: string): StoredEvent[] {
  const rows = db
    .prepare(
      "SELECT seq, step, type, source, cause, score, received_at FROM events WHERE game_id = ? ORDER BY seq",
    )
    .all(gameId) as Row[];
  return rows.map((row) => ({
    seq: num(row.seq),
    step: num(row.step),
    type: str(row.type),
    source: strOrNull(row.source),
    cause: strOrNull(row.cause),
    score: numOrNull(row.score),
    receivedAt: num(row.received_at),
  }));
}
