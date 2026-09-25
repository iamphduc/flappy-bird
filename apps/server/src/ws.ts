// WebSocket game sessions: hello, then event batches that get acked (and a
// result once a game completes). Bad input never closes the socket.
import websocket from "@fastify/websocket";
import type { FastifyInstance } from "fastify";
import { parseClientMessage, type ServerMessage } from "@flappy/engine";
import { getPlayer, type Db } from "./db.ts";
import { ingestEvents } from "./ingest.ts";

/** Biggest frame accepted; a full MAX_BATCH message is well under this. */
const MAX_PAYLOAD_BYTES = 1024 * 1024;

export interface WsOptions {
  db: Db;
  /** Clock, injectable for tests. Default Date.now. */
  now?: () => number;
}

/** Registers @fastify/websocket and the GET /api/ws route on `app`. */
export function registerWs(app: FastifyInstance, { db, now = Date.now }: WsOptions): void {
  app.register(websocket, { options: { maxPayload: MAX_PAYLOAD_BYTES } });
  app.register(async (scope) => {
    scope.get("/api/ws", { websocket: true }, (socket) => {
      let playerId: string | null = null;
      const send = (message: ServerMessage) => socket.send(JSON.stringify(message));
      const fail = (code: string, message: string, gameId?: string) =>
        send(gameId === undefined ? { type: "error", code, message } : { type: "error", code, message, gameId });

      socket.on("message", (data) => {
        let gameId: string | undefined;
        try {
          let raw: unknown;
          try {
            raw = JSON.parse(data.toString());
          } catch {
            return fail("bad-message", "message is not JSON");
          }
          const message = parseClientMessage(raw);
          if (message === null) return fail("bad-message", "message is not a valid client message");

          if (message.type === "hello") {
            if (!getPlayer(db, message.playerId)) return fail("unknown-player", "no such player");
            playerId = message.playerId;
            return send({ type: "welcome" });
          }

          gameId = message.gameId;
          if (playerId === null) return fail("hello-first", "send hello before events", gameId);
          const outcome = ingestEvents(db, { playerId, gameId, events: message.events, now: now() });
          if ("error" in outcome) return send(outcome.error);
          send(outcome.ack);
          if (outcome.result) send(outcome.result);
        } catch (error) {
          app.log.error({ err: error }, "ws message failed");
          try {
            fail("server-error", "the server could not handle this message", gameId);
          } catch {
            // socket already gone
          }
        }
      });
    });
  });
}
