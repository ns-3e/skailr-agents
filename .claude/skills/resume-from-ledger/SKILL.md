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

## Mid-slice handoffs (engineering workstreams)

When Phase B has an engineering workstream mid-build, check `.claude/program/workstreams/<ws>/handoff/*.md`. If a handoff exists for a slice (`backend`, `frontend`, `data`), re-dispatch that engineer with the handoff path as primary context (plus consumed contracts / spec artifacts for that workstream) — same continue-from-handoff rules as skill `write-handoff-and-yield` and feature resume. Cap consecutive yields per slice at **5**, then surface to the human. Delete the handoff file when the slice completes.
