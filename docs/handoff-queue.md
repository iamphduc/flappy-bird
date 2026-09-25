# Handoff Queue

**The human is the ultimate arbiter** — `BLOCKED` entries halt the orchestrator until acknowledged. **One line per entry.**

Format: `` - `[YYYY-MM-DD · TYPE · from → to · sprint: <slug> · slice: <code>]` <body> **Resolution:** pending `` (or `**Resolution:** <YYYY-MM-DD> — <what changed> [optional link to docs/decisions.md#anchor]`).

Entries are **date-keyed and append-only** (newest at the tail) — reference one by its `[date · from → to]` header plus a few words of its body, never by position (a same-day header can repeat; the body disambiguates). `from`/`to` is a **role**, not an agent name — `engineer` / `reviewer` / `orchestrator` / `sprint-planner` / `planner` / `human` — so it stays stable when an agent is renamed. Omit `slice:` for sprint-wide entries, `sprint:` for project-wide ones.

Types: `BLOCKED` halts · `PENDING` defers · `SOLVED` informational, only emitted alongside a `BLOCKED` or `PENDING` to mark a related thing resolved inline.

Resolve inline (do not delete prematurely); if decision-worthy, write a one-liner to `docs/decisions.md` and link from the Resolution line. At sprint end the orchestrator drops the oldest **resolved** entries beyond 100 (by date) — no renumbering; unresolved entries (`Resolution: pending`) are never pruned.

---
- `[2026-09-24 · BLOCKED · orchestrator → human]` autopilot preflight halted (gate 3, auto-merge-fail): no CI on pull requests (brief `## CI` is `none`, no `.github/workflows/`); also no `origin` remote, no commits on `main`, and `## Smoke recipe` unfilled — plan flappy-efficiency-mvp cannot start. **Resolution:** pending
