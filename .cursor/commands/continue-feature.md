---
name: continue-feature
description: Resume an in-flight feature from progress.md — pick up at the first incomplete phase (YOLO or gated)
---

<!--
Cursor execution note: Claude Code dispatches subagents via the Task tool.
Cursor has no native cross-agent Task dispatch. In Cursor, run this orchestration
in one agent session by invoking the corresponding `.cursor/rules/<agent>.mdc`
roles in sequence (or via Background Agents for parallel engineer/workstream steps).
The phase order, gates, and contracts below are unchanged — only the dispatch mechanism differs.
-->

You are the Orchestrator, resuming a feature mid-flight (after story approval, after usage limits, or any mid-session return). You do not restart finished work. You do **not** archive `.claude/tmp/`.

## Model routing

Before every Task dispatch, follow skill `route-models`: resolve the model from `.claude/model-routing.json` (active profile), apply escalate/downgrade rules, and append a line to `.claude/tmp/model-usage.md`.

## Preflight

1. Run `node scripts/skailr/feature-status.mjs --json` (skill `resume-from-feature-progress`). If no progress file but artifacts exist, seed `progress.md` from `.claude/program/schemas/feature-progress.template.md` and mark phases complete based on which artifacts exist (`research.md`, `story.md`, `spec.md`, reports).
2. Read `.claude/tmp/mode.md` (and progress frontmatter `mode`) — `yolo` or `gated`.
3. Confirm `.claude/tmp/request.md` exists. Do not reset channels under `.claude/tmp/channels/`.
4. If the user provided story/spec feedback in `$ARGUMENTS` and you are still before build, apply it by re-invoking the relevant agent first.

If `complete: true`, report status and stop.

## Mode: YOLO

If `mode` is `yolo`, resume YOLO orchestration from `next` with **no human gates**. Follow `/yolo` phase rules from that point forward (auto-approve story/spec if those phases are still pending; auto-decide `@human` / `contract-change`). Checkpoint `progress.md` after each phase. When done, give the same final report shape as `/yolo`.

## Mode: gated

| `next` | Action |
|--------|--------|
| `research` | Tell the user to run `/ship-feature` with the request (or continue research if request exists). |
| `story` | Finish story-writer if needed, then Gate 1 (present story; stop for approval). |
| `spec` | Confirm story was approved (user said approve / continue / ran this after Gate 1). If unclear and story is not yet approved, stop and ask. Then run Phase 3 (architect → spec checks) and **GATE 2** — present spec; tell them to run `/build-feature` when right. End turn. Do not start engineers. |
| `build` / `verify` / `validate` / `docs` | Hand off into `/build-feature` from that phase (same checkpoints and gates). If `next` is `build` and `handoffs` is set, `/build-feature` must pass those paths into the engineer Tasks (skill `resume-from-feature-progress`). |

### Phase 3 — Spec (gated, when `next` is `spec`)

Invoke the `architect` subagent. It reads `research.md` and `story.md` and writes `.claude/tmp/spec.md`.

When it returns, verify three things yourself before showing the user:
1. The BACKEND and FRONTEND ownership globs are **disjoint** — prefer `node scripts/skailr/check-ownership.mjs --from-spec .claude/tmp/spec.md`. If they overlap, send it back to the architect.
2. Every AC ID in `story.md` appears somewhere in `spec.md`.
3. Every endpoint has a fully specified request shape, response shape, and error cases.

Optionally write `.claude/tmp/ownership.json`. Checkpoint: `spec` → complete.

### GATE 2 — Human approval of the spec

Print the spec's Approach Summary, Design Decisions, Data Model, API Contract, and Ownership Boundaries. Then:

**"Approve the spec to start the parallel build, or tell me what to change. Run `/build-feature` when it's right."**

End your turn. Do not start the engineers.

## Rules

- Never archive an incomplete feature run when resuming.
- Never write application code yourself.
- Keep `progress.md` current at every transition.
- Mid-slice handoffs (`.claude/tmp/handoff/<slice>.md`) are continue-from-handoff, not failures — follow skill `write-handoff-and-yield` / `resume-from-feature-progress`.
