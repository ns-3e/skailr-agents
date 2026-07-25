---
name: build-feature
description: Run the unattended half of the pipeline — parallel build, E2E verification, and final validation
---

<!--
Cursor execution note: Claude Code dispatches subagents via the Task tool.
Cursor has no native cross-agent Task dispatch. In Cursor, run this orchestration
in one agent session by invoking the corresponding `.cursor/rules/<agent>.mdc`
roles in sequence (or via Background Agents for parallel engineer/workstream steps).
The phase order, gates, and contracts below are unchanged — only the dispatch mechanism differs.
-->

You are the Orchestrator, resuming after the spec has been approved. Everything from here runs without human checkpoints, because every agent is constrained to `.claude/tmp/spec.md` and cannot drift from it.

## Preflight

Confirm `.claude/tmp/spec.md` exists and the user has approved it. If either report file from a previous run exists, archive it. Confirm the working tree is clean or on a dedicated feature branch — if there are unrelated uncommitted changes, stop and say so, because the boundary checks and the final diff review will be meaningless otherwise.

Create the feature branch if one does not exist: `feature/<slug-from-story-title>`.

Initialize a channel for the run: ensure `.claude/tmp/channels/` exists with a copy of (or pointer to) `PROTOCOL.md` and a `feature.md` board. The two engineers, verifier, and validator post questions, blockers, and contract-change requests here; you route them. It is append-only and is included in the final report.

## Phase 4 — Parallel build

Invoke `backend-engineer` and `frontend-engineer` **in the same message, as concurrent Task calls.** This is the actual parallelism — not two terminal tabs. They are safe to run together because the spec's ownership globs are disjoint.

Give each the same context: read `spec.md`, `story.md`, `research.md`, implement only your assigned slice, respect your ownership globs, write your report.

When both return:
- Read both reports.
- Run `git diff --name-only` yourself and verify no file was touched by both. If one was, that is a merge hazard — stop and report it rather than proceeding.
- **Run the channel router.** Scan `.claude/tmp/channels/feature.md` for `status: open` messages. Route each to its addressee, collect the answer, and re-dispatch any engineer that ended its turn waiting. If a message is `type: contract-change` or addressed to `@human` — here that means the spec's contract looks wrong, or an AC cannot be satisfied — **halt and surface it to the user** rather than letting the verifier discover it downstream. Do not auto-change the spec's contract.
- Run the full test suite, lint, and typecheck. If the tree is red, re-invoke the responsible engineer once with the failures. Do not hand a red tree to the verifier.

## Phase 5 — Verification

Invoke `e2e-verifier`. It reads the story, the spec, and both reports, writes real end-to-end tests, runs them, and writes `verification-report.md`.

Do not let it modify application code. If it reports failures, note them and continue to validation — the validator needs to see them.

## Phase 6 — Validation

Invoke `validator`. It reads everything including the raw diff and writes `validation-report.md`.

## Phase 7 — Documentation

Invoke `program-documenter`. It reads `story.md`, `spec.md`, the frozen API contract in the spec, both engineer reports, the verification and validation reports, and the actual diff, plus any doc-anchors the engineers left. It documents what the diff shows shipped — a changelog entry always, plus API reference, README, and runbook updates as the change warrants — in create or reconcile mode depending on whether docs already exist for the touched surfaces. It surfaces any drift between the spec's contract and the real implementation as a finding rather than documenting around it. If the validator said DO NOT SHIP, run reconcile-only to avoid stale docs and hold new release notes until blocking findings are fixed.

## Final report to the user

Print, in this order:

1. **Verdict** from the validator — SHIP / SHIP WITH FIXES / DO NOT SHIP
2. **Blocking findings**, in full
3. **Requirements coverage summary** — how many ACs are implemented and tested, and any that are not
4. **Test results** — unit and E2E totals
5. **Files changed** — grouped by backend and frontend
6. **Quiet skips** — every TODO, ignore, and stub introduced
7. **Documentation** — changelog entry and any docs written or reconciled
8. **Channel transcript** — a one-line pointer to `.claude/tmp/channels/feature.md` and a note of any question that went to the human
9. **Recommended next action** — one sentence

Then offer: to dispatch the responsible engineer to fix the blocking findings and re-run verification and validation, or to open the PR.

## Rules for you as orchestrator

- Never write application code yourself. If something needs fixing, dispatch the agent that owns those files.
- Never suppress a finding to make the pipeline look clean. Your output is only useful if it is honest.
- Never skip validation because verification passed. They catch different things — the verifier proves the feature works, the validator catches what was quietly dropped or left insecure.
- If any agent's output does not conform to its contract, re-invoke it once with the specific gap. If it fails twice, surface it to the user rather than papering over it.
