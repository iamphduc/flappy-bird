// Read-only stats routes: a game's summary and a player's trend, computed on read.
import type { FastifyPluginAsync } from "fastify";
import { getGame, getGameEvents, type Db } from "./db.ts";
import { playerStats, summarizeGame } from "./metrics.ts";

export interface StatsRoutesOptions {
  db: Db;
}

export const statsRoutes: FastifyPluginAsync<StatsRoutesOptions> = async (app, { db }) => {
  app.get<{ Params: { id: string } }>("/api/games/:id/summary", async (request, reply) => {
    const game = getGame(db, request.params.id);
    if (!game) return reply.code(404).send({ error: "unknown game" });
    if (game.status !== "complete") return reply.code(409).send({ error: "not-complete" });
    const summary = summarizeGame(game, getGameEvents(db, game.id));
    if (!summary) return reply.code(409).send({ error: "no-server-result" });
    return summary;
  });

  app.get<{ Params: { id: string } }>("/api/players/:id/stats", async (request, reply) => {
    const stats = playerStats(db, request.params.id);
    if (!stats) return reply.code(404).send({ error: "unknown player" });
    return stats;
  });
};
