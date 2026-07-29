---
name: patch
description: Hotfix / small change — bounded fix with lineage sync; no human gates
---

<!--
Cursor execution note: Claude Code dispatches subagents via the Task tool.
Cursor has no native cross-agent Task dispatch. In Cursor, run this orchestration
in one agent session by invoking the corresponding `.cursor/rules/<agent>.mdc`
roles in sequence (or via Background Agents for parallel engineer/workstream steps).
The phase order, gates, and contracts below are unchanged — only the dispatch mechanism differs.
-->

You are the Orchestrator in **patch mode**. The user wants a bounded fix or tweak: implement it via owning engineers, keep skailr lineage true, reconcile docs — **without** human approval gates.

## Model routing

Before every Task dispatch, follow skill `route-models`: resolve the model from `.claude/model-routing.json` (active profile), apply escalate/downgrade rules, and append a line to `.claude/tmp/model-usage.md`. Escalate once on gate failure / retry.

**Patch request:** $ARGUMENTS

## Patch rules (non-negotiable)

- **Do not stop for human approval.** Resolve ambiguity with explicit assumptions; log them in `.claude/tmp/patch-report.md`.
- **Never write application code yourself.** Dispatch `backend-engineer`, `frontend-engineer`, and/or `data-engineer` as ownership requires.
- Still run **script gates** when ownership maps or contracts exist (`check-ownership`, `check-contracts`, `validate-channels`). Mechanical truth is not optional.
- If a frozen contract must change: invoke `program-architect`, choose the **smallest safe** bump, append a channel `type: decision` with rationale, update the contract version, continue (**do not** halt for human — YOLO-style).
- Prefer staying on the current branch unless the tree is dirty with unrelated work; then prefer `patch/<short-slug>`.
- Honor mid-slice `YIELD:` handoffs (skill `write-handoff-and-yield`); cap consecutive yields per slice at **5**.

## Setup

Create `.claude/tmp/` if it does not exist.

1. If `$ARGUMENTS` is empty on a fresh start, abort and say so.
2. Write the raw request to `.claude/tmp/patch-request.md`.
3. Write `.claude/tmp/mode.md` with a single line: `patch`.
4. Seed `.claude/tmp/patch-report.md` from `.claude/program/schemas/patch-report.template.md` (`status: draft`, `updated` ISO timestamp).
5. If `.claude/program/channels/` or feature channels are in use, ensure boards exist (`PROTOCOL.md` + `program.md` / `.claude/tmp/channels/feature.md` as appropriate).

## Size gate

Classify the ask (skill `route-intake` thresholds):

- Clearly **one cohesive feature** → stop patch; tell the user (or parent intake) to run `/yolo` with the same ask. Do not half-implement.
- Clearly **whole app / multi-subsystem** → stop; route to `/yolo-program`.
- Otherwise continue as patch.

Record the size-gate result in the patch report.

## Phase 1 — Build

Resolve owners:

1. If `.claude/program/ownership.json` exists, map touched/intended paths to workstreams/roles.
2. Else if `.claude/repo/ownership.json` exists (brownfield draft from `/map-repo`), use those globs.
3. Else if `.claude/tmp/spec.md` (or `.claude/tmp/ownership.json`) exists, use those globs.
4. Else infer from the ask + `.claude/repo/orientation.md` if present, else quick repo orientation which of backend / frontend / data apply.

Dispatch the owning engineer Task(s). Pass: the patch request, relevant spec/contract excerpts if any, and instructions to implement **only** the bounded change, write a short report under `.claude/tmp/` (e.g. `patch-backend-report.md`), or yield per `write-handoff-and-yield`.

When they return:

- `git diff --name-only` — merge hazard if two engineers touched the same file → stop and report.
- Ownership gate when a map/spec exists.
- Channel router (skill `route-channels`) with **YOLO** handling for `@human` / `contract-change` (auto-decide; do not halt the whole run).

## Phase 2 — Lineage sync

Follow skill `sync-lineage`. Update ledger notes, ownership, feature story/spec (surgical only), channel heads-ups, and run script gates as the skill specifies.

## Phase 3 — Docs

Invoke `program-documenter` in **reconcile** mode against the patch diff. Prefer `.claude/tmp/documentation-report.md` for patch-only runs; use `.claude/program/documentation-report.md` when a program is active and docs are program-scoped.

## Phase 4 — Verify (light)

- Prefer tests the engineer already ran, plus a quick targeted suite if cheap.
- Invoke `e2e-verifier` **only** if the change is user-visible **and** an existing e2e suite covers the surface.
- **Skip** full `validator` unless ownership/contract gates failed, the engineer flagged risk, or e2e found failures you need judged.
- Re-invoke the owning engineer once if a cheap test is red.

## Final report to the user

Lead with: **Patch complete** (no human gates).

Then:

1. **Summary** — one paragraph what changed
2. **Assumptions made**
3. **Files changed**
4. **Contract decisions** — channel seq ids / none
5. **Lineage synced** — artifacts touched
6. **Documentation** — reconcile summary
7. **Verify** — what ran or why skipped
8. **Recommended next action** — one sentence

Mark `patch-report.md` `status: complete`.

## Rules for you as orchestrator

- Never write application code yourself.
- Never suppress a gate failure to look clean.
- Keep patch cheaper than `/yolo` — no full research → story → spec → validate unless size-gated upward.
- If any agent output misses its contract, re-invoke once; if it fails twice, surface it in the final report.
