# Handoff Queue

**The human is the ultimate arbiter** — `BLOCKED` entries halt the orchestrator until acknowledged. **One line per entry.**

Format: `` - `[YYYY-MM-DD · TYPE · from → to · sprint: <slug> · slice: <code>]` <body> **Resolution:** pending `` (or `**Resolution:** <YYYY-MM-DD> — <what changed> [optional link to docs/decisions.md#anchor]`).

Entries are **date-keyed and append-only** (newest at the tail) — reference one by its `[date · from → to]` header plus a few words of its body, never by position (a same-day header can repeat; the body disambiguates). `from`/`to` is a **role**, not an agent name — `engineer` / `reviewer` / `orchestrator` / `sprint-planner` / `planner` / `human` — so it stays stable when an agent is renamed. Omit `slice:` for sprint-wide entries, `sprint:` for project-wide ones.

Types: `BLOCKED` halts · `PENDING` defers · `SOLVED` informational, only emitted alongside a `BLOCKED` or `PENDING` to mark a related thing resolved inline.

Resolve inline (do not delete prematurely); if decision-worthy, write a one-liner to `docs/decisions.md` and link from the Resolution line. At sprint end the orchestrator drops the oldest **resolved** entries beyond 100 (by date) — no renumbering; unresolved entries (`Resolution: pending`) are never pruned.

---
- `[2026-09-24 · BLOCKED · orchestrator → human]` autopilot preflight halted (gate 3, auto-merge-fail): no CI on pull requests (brief `## CI` is `none`, no `.github/workflows/`); also no `origin` remote, no commits on `main`, and `## Smoke recipe` unfilled — plan flappy-efficiency-mvp cannot start. **Resolution:** 2026-09-24 — GitHub remote added, bootstrap PR #1 merged (skeleton, smoke recipe, pod-ci on pull_request); autopilot resumed
- `[2026-09-24 · PENDING · engineer → human · sprint: game-core · slice: C1]` `actionFromPointer` maps unknown `pointerType` (e.g. `''`) to `click` rather than `null`; covered by its own test. **Resolution:** pending
- `[2026-09-24 · PENDING · engineer → human · sprint: game-core · slice: C1]` browser check limited to `wait "Server OK"` — chrome-devtools MCP `new_page` locked ("browser already running"), axi `snapshot` fails with pageId error; no DOM/console/network check. **Resolution:** pending
- `[2026-09-24 · PENDING · engineer → human · sprint: game-core · slice: E1]` regression flap list locked after engine existed (test-only commit `4b6e968` before impl): seed 42, flaps `[13,52,90,128,166,199,237]` → score 2, death step 296, cause `ground`; C2 uses it for its scripted browser check. Tuning constants will change these values. **Resolution:** pending
- `[2026-09-24 · PENDING · engineer → human · sprint: game-core · slice: E1]` engine defaults chosen: `y` = top of square hitbox; flap at step n applies n→n+1 and replaces gravity that step; pipe check before ground check; pipe passed when `x + PIPE_WIDTH < BIRD_X`; `flapCount` counts only flaps before death. **Resolution:** pending
- `[2026-09-24 · PENDING · engineer → human · sprint: game-core · slice: C2]` scripted session: a flap in `over` restarts with the SAME seed (flap list only fits that seed); unscripted restarts use a new random seed. Scripted runs ignore player flaps in ready/playing, but a flap in `over` still restarts and pause still works. **Resolution:** pending
- `[2026-09-24 · PENDING · engineer → human · sprint: game-core · slice: C2]` several player flaps in one frame collapse into one pending flap for the next step; pausing clears it — revisit if the recording sprint needs every raw press. **Resolution:** pending
- `[2026-09-24 · PENDING · engineer → human · sprint: game-core · slice: C2]` `/favicon.ico` 404 is the only console error (pre-existing); touch and 30 Hz were emulated via CDP, not tested on real hardware. **Resolution:** pending
