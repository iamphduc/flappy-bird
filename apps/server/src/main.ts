import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp } from "./app.ts";
import { openDb } from "./db.ts";
import { startSweeper } from "./ingest.ts";

const port = Number(process.env.API_PORT ?? 3001);
// A relative DB_PATH resolves against apps/server, whatever the working directory.
const serverDir = fileURLToPath(new URL("..", import.meta.url));
const rawDbPath = process.env.DB_PATH ?? "data/flappy.db";
const dbPath = rawDbPath === ":memory:" ? rawDbPath : resolve(serverDir, rawDbPath);
const devSeeds = process.env.NODE_ENV !== "production";

const rawTimeout = Number(process.env.GAME_IDLE_TIMEOUT_MS ?? 300_000);
const idleTimeoutMs = Number.isFinite(rawTimeout) && rawTimeout > 0 ? rawTimeout : 300_000;

const db = openDb(dbPath);
const app = buildApp({ db, devSeeds });
const stopSweeper = startSweeper(db, { timeoutMs: idleTimeoutMs });
app.addHook("onClose", async () => stopSweeper());

app.listen({ port, host: "127.0.0.1" }).then(() => {
  console.log(`server listening on http://127.0.0.1:${port} (db: ${dbPath}, dev seeds: ${devSeeds}, idle timeout: ${idleTimeoutMs} ms)`);
});
