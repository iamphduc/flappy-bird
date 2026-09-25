import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp } from "./app.ts";
import { openDb } from "./db.ts";

const port = Number(process.env.API_PORT ?? 3001);
// A relative DB_PATH resolves against apps/server, whatever the working directory.
const serverDir = fileURLToPath(new URL("..", import.meta.url));
const rawDbPath = process.env.DB_PATH ?? "data/flappy.db";
const dbPath = rawDbPath === ":memory:" ? rawDbPath : resolve(serverDir, rawDbPath);
const devSeeds = process.env.NODE_ENV !== "production";

const app = buildApp({ db: openDb(dbPath), devSeeds });

app.listen({ port, host: "127.0.0.1" }).then(() => {
  console.log(`server listening on http://127.0.0.1:${port} (db: ${dbPath}, dev seeds: ${devSeeds})`);
});
