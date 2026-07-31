---
name: resume-from-ledger
description: Determine the next incomplete program phase from ledger.md and resume without redoing finished work.
---

# Skill: resume-from-ledger

## When to use

`/continue-program` or any mid-session return to an in-flight program.

## Procedure

```bash
node scripts/skailr/ledger-status.mjs --json
```

Map `next` to `/build-program` phase (A–E). Do not reset channels. Re-run script gates before advancing.

If `.claude/program/mode.md` is `yolo`, resume with YOLO auto-decide rules for `@human` / `contract-change` (do not halt the whole run). Never archive an incomplete ledger on resume.

When `next` is `B_workstreams` and `nextFeature` is set:

- `artifactRoot` is `.claude/program/workstreams/<ws>/features/<slug>`
- Follow skill `run-feature-queue` for that workstream (serial features; respect plan.md `Depends-on`)
- Resume the nested feature with `node scripts/skailr/feature-status.mjs --progress <artifactRoot>/progress.md --json` and skill `run-ticket-board` with `--root <artifactRoot>` when build is in progress

## Mid-slice / ticket handoffs (engineering features)

When Phase B has an engineering feature mid-build, check `<artifactRoot>/handoff/*.md` (ticket id or legacy slice). If a handoff exists, re-dispatch that engineer with the handoff path as primary context (plus ticket + spec under the same root) — same continue-from-handoff rules as skill `write-handoff-and-yield` and feature resume. Cap consecutive yields per ticket/slice at **5**, then surface to the human. Delete the handoff file when the ticket/slice completes.

Do **not** look for a flat `.claude/program/workstreams/<ws>/board.md` — boards live under each feature's artifact root.
