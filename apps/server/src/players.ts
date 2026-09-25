import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { getPlayer, insertPlayer, type Db } from "./db.ts";

export const MAX_NICKNAME_LENGTH = 20;

/** Trimmed nickname of 1-20 chars, or null when the input is not one. */
export function cleanNickname(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const nickname = value.trim();
  if (nickname.length < 1 || nickname.length > MAX_NICKNAME_LENGTH) return null;
  return nickname;
}

export const playerRoutes: FastifyPluginAsync<{ db: Db }> = async (app, { db }) => {
  app.post("/api/players", async (request, reply) => {
    const body = request.body as { nickname?: unknown } | undefined;
    const nickname = cleanNickname(body?.nickname);
    if (nickname === null) {
      return reply.code(400).send({ error: `nickname must be 1-${MAX_NICKNAME_LENGTH} characters` });
    }
    const id = randomUUID();
    insertPlayer(db, { id, nickname, createdAt: Date.now() });
    return reply.code(201).send({ id, nickname });
  });

  app.get<{ Params: { id: string } }>("/api/players/:id", async (request, reply) => {
    const player = getPlayer(db, request.params.id);
    if (!player) return reply.code(404).send({ error: "unknown player" });
    return { id: player.id, nickname: player.nickname };
  });
};
