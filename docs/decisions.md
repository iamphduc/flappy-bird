# Decisions

> Stub — authoritative architectural decisions for your project. One entry per decision; agents link here from `handoff-queue.md` Resolution lines.

<!-- ## YYYY-MM-DD — <title>
Context: <why this came up>
Decision: <what was decided>
Consequences: <trade-offs, follow-ups> -->

## 2026-09-24 — Stack: TypeScript monorepo, Vite canvas client, Fastify + SQLite server
Context: empty repo; plan `flappy-efficiency-mvp` needs a browser game plus a backend that replays games.
Decision: pnpm workspaces with `packages/engine` (shared), `apps/client` (Vite + plain canvas, no game engine), `apps/server` (Node + Fastify, SQLite). TypeScript everywhere.
Consequences: one language and shared types for events; no Docker. SQLite limits hosting to a single instance with a persistent disk, which is fine for now.

## 2026-09-24 — Deterministic shared engine; server is the source of truth
Context: efficiency stats must be fair across devices and not fakeable.
Decision: fixed 60 steps/s physics and a server-issued seed for pipes, in one engine package used by client and server. The server replays inputs to get score, death and per-flap state; client-reported results are never used for metrics.
Consequences: the engine must stay free of DOM/Node APIs and wall-clock time. Needs a client-vs-server replay test. Makes the later ideal-path analysis possible.

## 2026-09-24 — Live WebSocket recording with buffer/resend
Context: every flap should reach the backend.
Decision: stream events over WebSocket with step number + sequence number. The game never waits for the network; the client resends after a reconnect, and the server dedupes. Games with gaps are marked incomplete and left out of the stats.
Consequences: more complex than one upload per game; reconnect cases need tests.

## 2026-09-24 — Nickname-only players; record game inputs only
Context: trends need identity; privacy and scope.
Decision: players pick a nickname, and a player ID is kept in the browser, with no auth. Only flap inputs (Space/click/tap) and game events are recorded, never other keys.
Consequences: names can be reused by anyone (accepted). Real accounts are a later plan.
