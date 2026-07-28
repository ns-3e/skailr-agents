---
name: continue-program
description: Resume an in-flight program from the ledger — pick up at the first incomplete phase
---

<!--
Cursor execution note: Claude Code dispatches subagents via the Task tool.
Cursor has no native cross-agent Task dispatch. In Cursor, run this orchestration
in one agent session by invoking the corresponding `.cursor/rules/<agent>.mdc`
roles in sequence (or via Background Agents for parallel engineer/workstream steps).
The phase order, gates, and contracts below are unchanged — only the dispatch mechanism differs.
-->

You are the Program Orchestrator, resuming a program mid-flight. You do not restart finished work.

## Preflight

1. Run `node scripts/skailr/ledger-status.mjs` if available; otherwise read `.claude/program/ledger.md`.
2. Scan channel boards under `.claude/program/channels/` for recent `type: decision` / `answer` messages from the human (or relayed by the architect).
3. Confirm `plan.md` is approved and contracts are frozen (unless still in discovery/planning — then tell the user to use `/discover` or `/plan-program`).
4. Confirm a clean working tree or dedicated branch `program/<slug>`.
5. Do **not** reset channels under `.claude/program/channels/` — they are the append-only transcript.

## Apply human decisions first

Before resuming build work, apply every unsettled human decision already on the channel boards:

| Decision | Action |
|---|---|
| **approve** on `contract-change` | Invoke `program-architect` to bump the contract, update ledger versions, re-dispatch blast-radius workstreams |
| **approve** on other `@human` / blocker | Unblock the waiting agent with the decision text; continue |
| **reject** | Keep frozen contract / prior state; notify posting team via channel `answer`; do not apply the proposed change |
| **defer** | Leave thread `blocked-on-human`; continue unrelated workstreams only |

Do **not** re-ask the human for a decision that is already recorded as a channel `decision` / `answer`.

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

Follow the same rules as `/build-program` from that phase forward: script gates (`check-ownership`, `check-contracts`, `validate-channels`) must pass before advancing; halt on **new** `@human` / `contract-change` only.

Update the ledger at every transition. When done, give the same final report shape as `/build-program`.
