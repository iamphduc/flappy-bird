import { randomInt, randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { getGame, getGameEvents, getPlayer, insertGame, type Db } from "./db.ts";

const UINT32_LIMIT = 2 ** 32;

function isUint32(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < UINT32_LIMIT;
}

export interface GameRoutesOptions {
  db: Db;
  /** Accept a client-chosen seed (dev and scripted runs only). */
  devSeeds: boolean;
}

export const gameRoutes: FastifyPluginAsync<GameRoutesOptions> = async (app, { db, devSeeds }) => {
  app.post("/api/games", async (request, reply) => {
    const body = request.body as { playerId?: unknown; seed?: unknown } | undefined;
    const playerId = body?.playerId;
    if (typeof playerId !== "string" || playerId.length === 0) {
      return reply.code(400).send({ error: "playerId is required" });
    }
    const hasSeed = body?.seed !== undefined;
    if (hasSeed && !devSeeds) return reply.code(400).send({ error: "client seeds are not accepted" });
    if (hasSeed && !isUint32(body?.seed)) return reply.code(400).send({ error: "seed must be a uint32" });
    if (!getPlayer(db, playerId)) return reply.code(404).send({ error: "unknown player" });

    const gameId = randomUUID();
    const seed = hasSeed ? (body?.seed as number) : randomInt(0, UINT32_LIMIT);
    insertGame(db, { id: gameId, playerId, seed, seedSource: hasSeed ? "dev" : "server", createdAt: Date.now() });
    return reply.code(201).send({ gameId, seed });
  });

  app.get<{ Params: { id: string } }>("/api/games/:id", async (request, reply) => {
    const game = getGame(db, request.params.id);
    if (!game) return reply.code(404).send({ error: "unknown game" });
    return { ...game, events: getGameEvents(db, game.id) };
  });
};
