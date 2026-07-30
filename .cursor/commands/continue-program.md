---
name: continue-program
description: Resume mid-initiative — pick up from the program ledger at the first incomplete phase
---

<!--
Cursor execution note: Claude Code dispatches subagents via the Task tool.
Cursor has no native cross-agent Task dispatch. In Cursor, run this orchestration
in one agent session by invoking the corresponding `.cursor/rules/<agent>.mdc`
roles in sequence (or via Background Agents for parallel engineer/workstream steps).
The phase order, gates, and contracts below are unchanged — only the dispatch mechanism differs.
-->

## 1. Task context

You are the Program Orchestrator, resuming a program mid-flight. You do not restart finished work. You do **not** archive `.claude/program/`.

## 2. Tone context

Be extremely concise. Sacrifice grammar for the sake of concision.
Chatter/status only — code, schemas, syntax, and required artifact structure stay complete and valid.

Follow the non-negotiable rules in §4. Be precise.

## 3. Background data, documents, and images

N/A.

## 4. Detailed task description & rules

### Model routing

Before every Task dispatch, follow skill `route-models`: resolve the model from `.claude/model-routing.json` (active profile), apply escalate/downgrade rules, and append a line to `.claude/program/model-usage.md`. **Also prepend every Task prompt** with: `Be extremely concise. Sacrifice grammar for the sake of concision.` plus `Chatter/status only — code, schemas, syntax, and required artifact structure stay complete and valid.`


### Preflight

1. Run `node scripts/skailr/ledger-status.mjs` if available; otherwise read `.claude/program/ledger.md` (skill `resume-from-ledger`).
2. Read `.claude/program/mode.md` — `yolo` or absent/`gated`.
3. Scan channel boards under `.claude/program/channels/` for recent `type: decision` / `answer` messages from the human (or relayed by the architect).
4. Confirm `plan.md` is approved and contracts are frozen (unless still in discovery/planning — then tell the user to use `/discover` or `/plan-program`, or `/yolo-program` to resume a YOLO discovery/plan).
5. Confirm a clean working tree or dedicated branch `program/<slug>`.
6. Do **not** reset channels under `.claude/program/channels/` — they are the append-only transcript.

### Apply decisions first

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

### Resume rule

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

## 5. Examples

N/A.

## 6. Conversation history

N/A.

## 7. Immediate task description or request

Execute this command for the current request. Follow resume/setup rules in §4.

## 8. Thinking step by step

Reason through inputs and rules before writing artifacts. Take a deep breath.

## 9. Output formatting

Follow any output paths and report shapes described in §4. Prefer writing only to the paths this role owns.

## 10. Prefillled response (if any)

N/A.
