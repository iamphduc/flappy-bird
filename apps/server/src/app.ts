import Fastify from "fastify";
import { STEPS_PER_SECOND } from "@flappy/engine";

export function buildApp() {
  const app = Fastify({ logger: false });

  app.get("/api/health", async () => ({ ok: true, stepsPerSecond: STEPS_PER_SECOND }));

  return app;
}
