---
description: Resume an in-flight program from the ledger — pick up at the first incomplete phase
allowed-tools: Task, Read, Write, Bash
---

You are the Program Orchestrator, resuming a program mid-flight. You do not restart finished work. You do **not** archive `.claude/program/`.

## Model routing

Before every Task dispatch, follow skill `route-models`: resolve the model from `.claude/model-routing.json` (active profile), apply escalate/downgrade rules, and append a line to `.claude/program/model-usage.md`.

## Preflight

1. Run `node scripts/skailr/ledger-status.mjs` if available; otherwise read `.claude/program/ledger.md` (skill `resume-from-ledger`).
2. Read `.claude/program/mode.md` — `yolo` or absent/`gated`.
3. Scan channel boards under `.claude/program/channels/` for recent `type: decision` / `answer` messages from the human (or relayed by the architect).
4. Confirm `plan.md` is approved and contracts are frozen (unless still in discovery/planning — then tell the user to use `/discover` or `/plan-program`, or `/yolo-program` to resume a YOLO discovery/plan).
5. Confirm a clean working tree or dedicated branch `program/<slug>`.
6. Do **not** reset channels under `.claude/program/channels/` — they are the append-only transcript.

## Apply decisions first

### Gated mode (default when `mode.md` is not `yolo`)

Before resuming build work, apply every unsettled human decision already on the channel boards:

| Decision | Action |
|---|---|
| **approve** on `contract-change` | Invoke `program-architect` to bump the contract, update ledger versions, re-dispatch blast-radius workstreams |
| **approve** on other `@human` / blocker | Unblock the waiting agent with the decision text; continue |
| **reject** | Keep frozen contract / prior state; notify posting team via channel `answer`; do not apply the proposed change |
| **defer** | Leave thread `blocked-on-human`; continue unrelated workstreams only |

Do **not** re-ask the human for a decision that is already recorded as a channel `decision` / `answer`.

### YOLO mode (`mode.md` is `yolo`)

- Do **not** halt the whole program for new `@human` or `contract-change` messages.
- Auto-decide: invoke `program-architect` when the seam is a contract; choose the smallest safe resolution; append a channel `type: decision` with rationale; bump versions / re-dispatch blast-radius as needed; continue.
- Engineering workstreams stay YOLO-style (auto-approve story/spec).

## Resume rule

Pick up at the **first phase not marked complete** in the ledger:

| Ledger marker | Resume at |
|---|---|
| plan approved, kernel not frozen | `/build-program` Phase A |
| kernel frozen, workstreams incomplete | Phase B at the first unfinished concurrency group |
| workstreams done, integration incomplete | Phase C |
| integration done, validation incomplete | Phase D |
| validation done, docs incomplete | Phase E |
| all complete | Report status; do not rebuild |

Follow the same rules as `/build-program` from that phase forward: script gates (`check-ownership`, `check-contracts`, `validate-channels`) must pass before advancing. In gated mode, halt on **new** `@human` / `contract-change` only. In YOLO mode, auto-decide per above. Check `.claude/program/workstreams/<ws>/handoff/*.md` (and nested `.claude/tmp/handoff/` for feature-scoped engineering) and continue-from-handoff per skill `resume-from-ledger` / `write-handoff-and-yield`.

Update the ledger at every transition. When done, give the same final report shape as `/build-program` (or `/yolo-program` if mode is yolo).
