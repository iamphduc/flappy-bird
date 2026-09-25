import type { FastifyPluginAsync } from "fastify";
import type { Db } from "./db.ts";

export interface StatsRoutesOptions {
  db: Db;
}

export const statsRoutes: FastifyPluginAsync<StatsRoutesOptions> = async () => {};
