import Fastify from "fastify";
import { STEPS_PER_SECOND } from "@flappy/engine";
import { openDb, type Db } from "./db.ts";
import { gameRoutes } from "./gameRoutes.ts";
import { playerRoutes } from "./players.ts";
import { statsRoutes } from "./statsRoutes.ts";
import { registerWs } from "./ws.ts";

export interface BuildAppOptions {
  /** Defaults to a fresh in-memory database. */
  db?: Db;
  /** Accept client-chosen seeds on POST /api/games. Default false. */
  devSeeds?: boolean;
}

export function buildApp({ db = openDb(":memory:"), devSeeds = false }: BuildAppOptions = {}) {
  const app = Fastify({ logger: false });

  app.addHook("onClose", async () => {
    try {
      db.close();
    } catch {
      // already closed by the caller
    }
  });

  app.get("/api/health", async () => ({ ok: true, stepsPerSecond: STEPS_PER_SECOND }));
  app.register(playerRoutes, { db });
  app.register(gameRoutes, { db, devSeeds });
  app.register(statsRoutes, { db });
  registerWs(app, { db });

  return app;
}
