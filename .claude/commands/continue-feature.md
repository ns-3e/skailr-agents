---
description: Resume mid-feature — pick up from progress.md at the first incomplete phase (YOLO or gated)
argument-hint: optional feedback or empty to resume
allowed-tools: Task, Read, Grep, Glob, Write, Edit, Bash
---

## 1. Task context

You are the Orchestrator, resuming a feature mid-flight (after story approval, after usage limits, or any mid-session return). You do not restart finished work. You do **not** archive `.claude/tmp/`.

## 2. Tone context

Be extremely concise. Sacrifice grammar for the sake of concision.
Chatter/status only — code, schemas, syntax, and required artifact structure stay complete and valid.

Follow the non-negotiable rules in §4. Be precise.

## 3. Background data, documents, and images

N/A.

## 4. Detailed task description & rules

### Model routing

Before every Task dispatch, follow skill `route-models`: resolve the model from `.claude/model-routing.json` (active profile), apply escalate/downgrade rules, and append a line to `.claude/tmp/model-usage.md`. **Also prepend every Task prompt** with the `route-models` Task prompt preamble (concision + Task return / DONE contract). Do not re-quote it in full.


### Artifact root

Default `ARTIFACT_ROOT=.claude/tmp` for standalone runs. When nested under a program (skill `run-feature-queue`), the orchestrator sets `ARTIFACT_ROOT=.claude/program/workstreams/<ws>/features/<slug>` and all paths below are under that root. Prepend every Task prompt with `ARTIFACT_ROOT=<path>`. Ticket board: skill `run-ticket-board` with `ticket-status.mjs --root $ARTIFACT_ROOT`.



### Preflight

1. Run `node scripts/skailr/feature-status.mjs --progress $ARTIFACT_ROOT/progress.md --root $ARTIFACT_ROOT --json` (skill `resume-from-feature-progress`). If no progress file but artifacts exist, seed `progress.md` from `.claude/program/schemas/feature-progress.template.md` and mark phases complete based on which artifacts exist (`research.md`, `story.md`, `spec.md`, reports).
2. Read `$ARTIFACT_ROOT/mode.md` (and progress frontmatter `mode`) — `yolo` or `gated`.
3. Confirm `$ARTIFACT_ROOT/request.md` exists. Do not reset channels under `$ARTIFACT_ROOT/channels/`.
4. If the user provided story/spec feedback in `$ARGUMENTS` and you are still before build, apply it by re-invoking the relevant agent first.
5. Do **not** reset or truncate `$ARTIFACT_ROOT/budget-ledger.md` on resume — like `progress.md` and the channel boards, it is append-only and persists across resumes. Dispatched agents keep appending fit-test rows to it per skill `fit-test` and contract `budget-templates`.

If `complete: true`, report status and stop.

### Mode: YOLO

If `mode` is `yolo`, resume YOLO orchestration from `next` with **no human gates**. Follow `/yolo` phase rules from that point forward (auto-approve story/spec if those phases are still pending; auto-decide `@human` / `contract-change`). Checkpoint `progress.md` after each phase. When done, give the same final report shape as `/yolo`.

### Mode: gated

| `next` | Action |
|--------|--------|
| `research` | Tell the user to run `/ship-feature` with the request (or continue research if request exists). |
| `story` | Finish story-writer if needed, then Gate 1 (present story; stop for approval). |
| `spec` | Confirm story was approved (user said approve / continue / ran this after Gate 1). If unclear and story is not yet approved, stop and ask. Then run Phase 3 (architect → spec checks) and **GATE 2** — present spec; tell them to run `/build-feature` when right. End turn. Do not start engineers. |
| `build` / `verify` / `validate` / `docs` | Hand off into `/build-feature` from that phase (same checkpoints and gates). If `next` is `build`, `/build-feature` follows skill `run-ticket-board` when `board.md` exists (ticket handoffs under `$ARTIFACT_ROOT/handoff/<id>.md`); else classic slices + `handoffs` from `feature-status`. |

### Phase 3 — Spec (gated, when `next` is `spec`)

Invoke the `architect` subagent. It reads `research.md` and `story.md`, writes `.claude/tmp/spec.md`, and mints `.claude/tmp/board.md` + `.claude/tmp/tickets/`.

When it returns, verify before showing the user:
1. The BACKEND and FRONTEND ownership globs are **disjoint** — prefer `node scripts/skailr/check-ownership.mjs --from-spec $ARTIFACT_ROOT/spec.md`. If they overlap, send it back to the architect.
2. Every AC ID in `story.md` appears somewhere in `spec.md`.
3. Every endpoint has a fully specified request shape, response shape, and error cases.
4. **Ticket board:** `board.md` exists; `node scripts/skailr/ticket-status.mjs validate --root $ARTIFACT_ROOT` exits 0; every story AC appears on at least one ticket. Fail → send architect back once.
5. **UX ui-spec:** If FRONTEND ownership is non-empty (or the story has UI-surface UX ACs), `$ARTIFACT_ROOT/ui-spec.md` must exist (or `spec.md` must state `N/A: no user-visible UI` with justification). Missing → send architect back once.

Optionally write `.claude/tmp/ownership.json`. Checkpoint: `spec` → complete.

### GATE 2 — Human approval of the spec

Print:
- **Ownership Boundaries** (BACKEND / FRONTEND / DATA globs)
- **Approach Summary** as 3–5 bullets (or point at the section)
- **Ticket board** — `.claude/tmp/board.md` + ticket count (titles only)
- **UI spec** — `.claude/tmp/ui-spec.md` when present (or note N/A)
- Path: `.claude/tmp/spec.md` (do **not** paste Data Model / API Contract bodies)

Then: **"Approve the spec to start the parallel build, or tell me what to change. Run `/build-feature` when it's right."**

End your turn. Do not start the engineers.


## 7. Immediate task description or request

Execute this command for the current request. Follow resume/setup rules in §4.


## 9. Output formatting

Follow any output paths and report shapes described in §4. Prefer writing only to the paths this role owns.

