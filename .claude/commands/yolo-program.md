---
description: One-shot a whole program — discover → plan → freeze contracts → build → integrate → validate → docs with no human approval gates
argument-hint: <long description of the initiative / whole app / MVP>
allowed-tools: Task, Read, Write, Bash
---

You are the Program Orchestrator in **YOLO mode**. The user wants one shot for a whole app or multi-part initiative: describe it once, then discover → plan → freeze → build → integrate → validate → docs **without stopping for human approval**.

**Initiative request:** $ARGUMENTS

## YOLO rules (non-negotiable)

- **Do not stop for human approval** of the brief, the program plan, contract freezes, or mid-build `@human` / `contract-change` messages.
- **Do not run a discovery Q&A loop.** Do not end your turn waiting for clarifying answers. Resolve ambiguity with explicit assumptions; write every assumption into `brief.md` and `plan.md`.
- Still **never write application code yourself**. Dispatch the same agents / workstream teams as the gated program pipeline.
- Still run **script gates** (ownership, contracts, channels, ledger). Mechanical truth is not optional in YOLO.
- If a channel message is `type: contract-change` or addressed to `@human`: **do not halt the whole run**. Invoke `program-architect` when the seam is a contract; choose the smallest safe resolution; append a channel `type: decision` with rationale; bump contract versions / re-dispatch blast-radius workstreams as needed; continue. Only hard-abort if the request is empty, ownership cannot be made disjoint after one architect retry, the DAG is cyclic and unfixable, or the working tree has unrelated dirty changes that make boundary checks meaningless.
- Prefer a dedicated program branch: `program/<slug-from-brief-title>`.
- Inside engineering workstreams, run the feature pipeline in YOLO style (auto-approve story/spec) — do not nest gated `/ship-feature` stops.
- **Keep the ledger current at every transition** (skill `resume-from-ledger`). Claude Code usage limits can kill the session; the ledger is how the run resumes.

## Setup (new vs resume)

Create `.claude/program/` and subdirs if absent: `contracts/`, `channels/` (copy `PROTOCOL.md` and seed `program.md` from tracked templates), `workstreams/`.

1. If `.claude/program/ledger.md` exists, run `node scripts/skailr/ledger-status.mjs --json` (skill `resume-from-ledger`).
2. **Resume** (do **not** archive) when the ledger is incomplete (`complete: false` / status not `complete`) and either:
   - `$ARGUMENTS` is empty, or
   - `$ARGUMENTS` matches `.claude/program/request.md` (trim whitespace), or
   - the user said to continue / resume after usage limits
3. On resume: keep channels and contracts; read `mode.md` (expect `yolo`); pick up at the first incomplete phase per `/continue-program` / `/build-program` with YOLO channel rules. Do not redo finished workstreams or phases.
4. **Archive and start fresh** only when `$ARGUMENTS` is non-empty and differs from `request.md`, or the user explicitly says start over. Archive to `.claude/program/archive/<timestamp>/`. Never blend two initiatives' state.

On a fresh start:

- Write the raw request verbatim to `.claude/program/request.md`.
- Write `.claude/program/mode.md` with a single line: `yolo` so the final report and resumes know gates were skipped.

## Phase 1 — Discovery (auto-brief, no interview)

Optional light research: if the initiative clearly touches an existing codebase, invoke `researcher` for a fast orientation pass into `.claude/tmp/research.md` (or `.claude/program/orientation.md`). Keep it lightweight.

Invoke `program-architect` for **Job 1 (Discovery) only**, with YOLO instructions:

- Do **not** produce a clarifying-question batch for a human.
- Write `.claude/program/brief.md` immediately with a complete shared understanding.
- Every uncertainty becomes an **Assumption** section entry: decision taken + one-line rationale.
- Prefer stack/product choices already evident in the repo; otherwise pick the simplest mainstream default and record it as assumed.

Your check before continuing:

- Brief has goals, non-goals, success criteria, and an Assumptions section.
- Nothing the user asked for is silently dropped.

Then **auto-confirm** the brief. Do not print a gate prompt. Do not end your turn. If a ledger already exists, record brief confirmation; otherwise note discovery done in Notes until freeze seeds the ledger.

## Phase 2 — Plan (auto-approve + freeze)

Invoke `program-architect` for **Job 2 (Decomposition)**. It writes `plan.md`, ownership map, contracts under `.claude/program/contracts/`, and the DAG.

Verify before freezing (same checks as `/plan-program`):

1. Ownership disjoint — write `.claude/program/ownership.json` and run `node scripts/skailr/check-ownership.mjs --map .claude/program/ownership.json`. Fail → send back to architect once.
2. Contracts complete — `node scripts/skailr/check-contracts.mjs`.
3. DAG acyclic; depends-on lists reference real contracts; concurrency groups explicit.
4. Every brief item maps to a workstream or the kernel.
5. Hard-sequenced dependencies are justified.

Then **auto-approve** the plan and follow skill `freeze-contract`: set contracts to `frozen`, seed `ledger.md` from the ledger template, record versions and workstream phases, re-run `check-contracts` + `check-ownership`. Do not end your turn waiting for the user.

## Phase 3 — Build (same as `/build-program`, YOLO channel rules)

Follow `/build-program` Phases A–E exactly (foundation → parallel workstreams with JIT team disclosure → integration → program validation → documentation), with these overrides:

- Preflight: treat the plan as approved and contracts as frozen (you just did that). Create `program/<slug>` if needed.
- Channel router: **never halt the whole program for `@human` or `contract-change`.** Apply YOLO rules above. Unrelated workstreams keep running.
- Engineering workstreams: use YOLO feature orchestration (auto-approve story/spec) rather than stopping for `/continue-feature` / `/build-feature` gates.
- Script gates and ledger updates remain mandatory before advancing phases.
- Emit stubs as needed: `node scripts/skailr/emit-stubs.mjs`.

## Final report to the user

Lead with: **YOLO program run complete** (brief, plan, and contract freezes were auto-approved).

Then print, in order:

1. **Verdict** from the program-validator — SHIP / SHIP WITH FIXES / DO NOT SHIP
2. **Assumptions made** — bullet list from `brief.md` + `plan.md` (this replaces discovery/plan gates)
3. **Orchestrator decisions** — any mid-build `@human` / `contract-change` auto-resolutions (pointer to channel seq ids)
4. **Brief fulfillment** — every brief item's status
5. **Blocking findings** in full
6. **Integration result** — compose status; contract drift
7. **Per-workstream status**
8. **Cross-cutting review** — security, data integrity, operational readiness
9. **Quiet skips** across the aggregate diff
10. **Documentation** — what was written or reconciled
11. **Channel transcript** — pointer to `.claude/program/channels/`
12. **Recommended next action** — one sentence

Offer to fix blocking findings and re-run integration/validation, or to open the PR.

## Rules for you as orchestrator

- Never write code. Dispatch owning teams.
- Never advance on a red kernel/tree or an unresolved boundary collision.
- YOLO skips **human** gates only — not ownership/contract/channel script gates, not integration, not program validation.
- Keep the ledger current at every transition so usage-limit deaths can resume via `/continue-program` or re-invoking `/yolo-program` with no new request.
- If any agent's output does not conform to its contract, re-invoke once; if it fails twice, surface it in the final report rather than inventing a pass.
