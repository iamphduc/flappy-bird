import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { getPlayer, insertPlayer, renamePlayer, type Db } from "./db.ts";
import { funnyName } from "./names.ts";

export const MAX_NICKNAME_LENGTH = 20;

/** Trimmed nickname of 1-20 chars, or null when the input is not one. */
export function cleanNickname(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const nickname = value.trim();
  if (nickname.length < 1 || nickname.length > MAX_NICKNAME_LENGTH) return null;
  return nickname;
}

const INVALID_NICKNAME = `nickname must be 1-${MAX_NICKNAME_LENGTH} characters`;

/** The body's `nickname` value; undefined when there is no body or no such key. */
function givenNickname(body: unknown): unknown {
  if (body === null || typeof body !== "object") return undefined;
  return (body as { nickname?: unknown }).nickname;
}

/** A funny name when no nickname is given, the cleaned nickname, or null when it is invalid. */
function chooseNickname(body: unknown): string | null {
  const given = givenNickname(body);
  return given === undefined ? funnyName() : cleanNickname(given);
}

export const playerRoutes: FastifyPluginAsync<{ db: Db }> = async (app, { db }) => {
  app.post("/api/players", async (request, reply) => {
    const nickname = chooseNickname(request.body);
    if (nickname === null) return reply.code(400).send({ error: INVALID_NICKNAME });
    const id = randomUUID();
    insertPlayer(db, { id, nickname, createdAt: Date.now() });
    return reply.code(201).send({ id, nickname });
  });

  app.get<{ Params: { id: string } }>("/api/players/:id", async (request, reply) => {
    const player = getPlayer(db, request.params.id);
    if (!player) return reply.code(404).send({ error: "unknown player" });
    return { id: player.id, nickname: player.nickname };
  });

  app.patch<{ Params: { id: string } }>("/api/players/:id", async (request, reply) => {
    const { id } = request.params;
    if (!getPlayer(db, id)) return reply.code(404).send({ error: "unknown player" });
    const nickname = chooseNickname(request.body);
    if (nickname === null) return reply.code(400).send({ error: INVALID_NICKNAME });
    renamePlayer(db, id, nickname);
    return { id, nickname };
  });
};
