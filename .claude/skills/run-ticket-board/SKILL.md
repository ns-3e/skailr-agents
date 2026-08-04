---
name: run-ticket-board
description: Mint-validate, claim, dispatch, and resolve feature tickets on the local markdown board. Use during feature Phase 4 (and after architect mint) instead of one monolithic backend/frontend Task each.
---

# Skill: run-ticket-board

## When to use

Orchestrators (`/yolo`, `/build-feature`, `/ship-feature`, `/continue-feature`, nested eng features via `run-feature-queue`) when `$ARTIFACT_ROOT/board.md` exists after the architect mint. Also after architect returns, to validate the mint before build.

## Paths

| Scope | Board | Tickets | Handoffs |
|-------|-------|---------|----------|
| Any feature run | `$ARTIFACT_ROOT/board.md` | `$ARTIFACT_ROOT/tickets/` | `$ARTIFACT_ROOT/handoff/` |

`ARTIFACT_ROOT` is `.claude/tmp` (standalone `/yolo` / `/ship-feature`) **or** `.claude/program/workstreams/<ws>/features/<slug>` (nested under a program). Do **not** mint or run a flat `workstreams/<ws>/board.md`.

Templates: `.claude/program/schemas/board.template.md`, `ticket.template.md`.

Script: `node scripts/skailr/ticket-status.mjs` (`--root` defaults to `.claude/tmp`; always pass the active `ARTIFACT_ROOT`).

## Narration

Refer to tickets by **title** (wrap the link), never bare `T-001` alone.

## Mint validation (after architect)

1. Confirm `board.md` and at least one ticket file exist under `$ARTIFACT_ROOT`.
2. Run `node scripts/skailr/ticket-status.mjs validate --root <ARTIFACT_ROOT> --json`.
3. Non-zero / `ok: false` → send architect back once with the errors.
4. Optionally write `$ARTIFACT_ROOT/ownership.json` with one owner unit per ticket id (globs from ticket frontmatter) for later `check-ownership`.

## Research fan-out (optional early)

For each frontier ticket with `role: research`, claim then Task `researcher` with ticket path + board path and `ARTIFACT_ROOT=<root>`. On `DONE:`, resolve with a one-line gist (script or manual). May run before/beside build tickets.

## Decide tickets (HITL)

For each frontier `role: decide` ticket: claim, post `type: blocker` (or question) to `@human` on the feature channel under `$ARTIFACT_ROOT/channels/` when present, else the workstream channel `ws-<name>.md`, citing the ticket **title**, leave dependents blocked until the human answers, then fill Resolution and resolve. Do not open decide tickets that span multiple features.

## Build loop (Phase 4)

1. Load **board only** (low-res). Do not preload every ticket body.
2. `node scripts/skailr/ticket-status.mjs --root <ARTIFACT_ROOT> --json` — use `parallel` (greedy frontier with disjoint same-role ownership).
3. For each id in `parallel`: `node scripts/skailr/ticket-status.mjs claim --id <id> --root <ARTIFACT_ROOT>` **before** any Task.
4. Dispatch claimed tickets **in one message as concurrent Tasks**, mapping role → agent:

| role | Agent |
|------|-------|
| backend | `backend-engineer` |
| frontend | `frontend-engineer` |
| data | `data-engineer` |
| research | `researcher` |
| decide | (channel `@human` — no build agent) |

5. **Task context (paths only):** `ARTIFACT_ROOT=<root>` + ticket path + `spec.md` + board path. Story/research on demand. If a handoff exists at `handoff/<id>.md`, pass it as primary + ticket + spec.
6. Prepend `route-models` Task prompt preamble. Instruct: implement only this ticket’s ACs + ownership globs; report to `$ARTIFACT_ROOT/tickets/<id>-report.md`; yield to `$ARTIFACT_ROOT/handoff/<id>.md` per `write-handoff-and-yield` (ticket id as slice key). Nested dispatch — also follow skill `emit-telemetry`: capture a `span-start` handle immediately before each worker Task and pass it verbatim to `span-end` after it resolves, with `--parent-span-id` = this board's own `span_id`, `--trace-id`/`--emitter-id` read from the run's `telemetry.json`, and `--agent-role`/`--agent-name` naming the worker (not the board). Derive `--status` from this step's own DONE/YIELD/failure/blocked handling.
7. On `YIELD:` — keep ticket `claimed`, re-dispatch same role with handoff + ticket + spec. Cap **5** consecutive yields per ticket, then surface to human.
8. On `DONE:` — read report; run:

```bash
node scripts/skailr/ticket-status.mjs resolve --id <id> --gist "<one-line gist>" --root <ARTIFACT_ROOT>
```

Delete `handoff/<id>.md` if present. Workers already ran `cleanup-scoped.mjs purge` on their `DONE:` (own agent worktree caches only; no-op on shared checkout). Do **not** purge sibling worktrees or the main repo `target/`. Update progress **Tickets** table / Notes under `$ARTIFACT_ROOT/progress.md`.
9. Recompute frontier. Graduate fog from board **Not yet specified** into new ticket files when a resolution made a question sharp (create file, then wire `blocked_by`, refresh board Tickets table). Rule mis-scoped tickets `out-of-scope` (update frontmatter + board **Out of scope**; do not add to **Done**). Ticket `blocked_by` may only reference tickets on **this** board — never feature IDs or other roots.
10. Repeat until `ticket-status` reports `complete: true`.

## Integration & budget discipline

- **Integration ownership.** The board owner integrates and verifies each ticket's work from its completion report (`$ARTIFACT_ROOT/tickets/<id>-report.md`) plus script/gate output — never by raw-ingesting a worker's diff, full file bodies, or transcript.
- **Single-writer enforcement.** Exactly one ticket owns write access to any given file (ticket ownership globs stay disjoint); tickets claimed and dispatched together (Build loop step 4) never share a write target.
- **80% budget escalation.** If a dispatched worker's handoff shows `trigger: budget-80pct` with its **Budget checkpoint (80%)** section filled (per `.claude/program/schemas/handoff.template.md`), paired with a `Status: partial` completion report, treat it like a yield but re-dispatch the ticket's remainder to a **fresh** agent seeded by that checkpoint/handoff, per skill `write-handoff-and-yield` — do not keep running the same agent past its budget.
- **Budget ledger.** Immediately after each dispatched ticket agent's fit test, append one line to `.claude/program/budget-ledger.md` (program runs) or `$ARTIFACT_ROOT/budget-ledger.md` (feature runs) — `role | budget assigned | fit-test estimate | decision | outcome | approx actuals`, per `.claude/program/schemas/budget-ledger.template.md`.

## Phase complete gates

Same as today’s build end: ownership script (feature `ownership.json` / spec, constrained by program WS globs when nested), channel router, test/lint/typecheck. Mark build slice aggregates complete when no open/claimed tickets remain for that role (`partialRoles` empty for that role).

## Fallback (no board)

If `board.md` is missing after spec (legacy / mint failure), keep the classic one `backend-engineer` + one `frontend-engineer` whole-slice dispatch.
