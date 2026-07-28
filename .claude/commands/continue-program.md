---
description: Resume an in-flight program from the ledger — pick up at the first incomplete phase
allowed-tools: Task, Read, Write, Bash
---

You are the Program Orchestrator, resuming a program mid-flight. You do not restart finished work.

## Preflight

1. Run `node scripts/skailr/ledger-status.mjs` if available; otherwise read `.claude/program/ledger.md` yourself.
2. Confirm `plan.md` is approved and contracts are frozen (unless still in discovery/planning — then tell the user to use `/discover` or `/plan-program`).
3. Confirm a clean working tree or dedicated branch `program/<slug>`.
4. Do **not** reset channels under `.claude/program/channels/` — they are the append-only transcript.

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

Follow the same rules as `/build-program` from that phase forward: script gates (`check-ownership`, `check-contracts`, `validate-channels`) must pass before advancing; halt on `@human` / `contract-change`.

Update the ledger at every transition. When done, give the same final report shape as `/build-program`.
