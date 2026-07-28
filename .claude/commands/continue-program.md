---
description: Resume an in-flight program from the ledger — pick up at the first incomplete phase
allowed-tools: Task, Read, Write, Bash
---

You are the Program Orchestrator, resuming a program mid-flight. You do not restart finished work.

## Preflight

1. Prefer `npx skailr continue` (writes `.claude/program/resume-brief.md`). Read that file if present.
2. Also run `node scripts/skailr/ledger-status.mjs` if available; otherwise read `.claude/program/ledger.md`.
3. Read `.claude/program/channels/decisions.md` if it exists — control-plane human decisions land there.
4. Scan channel boards for recent `type: decision` messages from `human (control-plane)`.
5. Confirm `plan.md` is approved and contracts are frozen (unless still in discovery/planning — then tell the user to use `/discover` or `/plan-program`).
6. Confirm a clean working tree or dedicated branch `program/<slug>`.
7. Do **not** reset channels under `.claude/program/channels/` — they are the append-only transcript.

## Apply human decisions first

Before resuming build work, apply every unsettled human decision from the resume brief / `decisions.md`:

| Decision | Action |
|---|---|
| **approve** on `contract-change` | Invoke `program-architect` to bump the contract, update ledger versions, re-dispatch blast-radius workstreams |
| **approve** on other `@human` / blocker | Unblock the waiting agent with the decision text; continue |
| **reject** | Keep frozen contract / prior state; notify posting team via channel `answer`; do not apply the proposed change |
| **defer** | Leave thread `blocked-on-human`; continue unrelated workstreams only |

Do **not** re-ask the human for a decision that the control plane already recorded.

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
