---
name: resume-from-ledger
description: Determine the next incomplete program phase from ledger.md and resume without redoing finished work.
---

# Skill: resume-from-ledger

## When to use

`/continue-program` or any mid-session return to an in-flight program.

## Procedure

If `.claude/skailr.db` exists, query it directly — it's the source of truth `ledger.md` is only rendered from, so this skips a parse-the-markdown-back-out round-trip and returns less text for the same information:

```bash
node scripts/skailr/db.mjs program get --id <program-slug> --json
```

Otherwise (no DB yet — older artifact root):

```bash
node scripts/skailr/ledger-status.mjs --json
```

Either way, this replaces reading `ledger.md` as a file — never do both. Both forms return a computed `next` field. Map it to `/build-program` phase (A–E). Do not reset channels. Re-run script gates before advancing.

If `.claude/program/mode.md` is `yolo`, resume with YOLO auto-decide rules for `@human` / `contract-change` (do not halt the whole run). Never archive an incomplete ledger on resume. When the ledger is already `complete`, the orchestrator follows skill `archive-program-state` (then cleanup) before the final report — that is completion hygiene, not resume.

When `next` is `B_workstreams` and `nextFeature` is set:

- `artifactRoot` is `.claude/program/workstreams/<ws>/features/<slug>`
- Follow skill `run-feature-queue` for that workstream (serial features; respect plan.md `Depends-on`)
- Resume the nested feature with `node scripts/skailr/feature-status.mjs --progress <artifactRoot>/progress.md --json` and skill `run-ticket-board` with `--root <artifactRoot>` when build is in progress

## Mid-slice / ticket handoffs (engineering features)

When Phase B has an engineering feature mid-build, check `<artifactRoot>/handoff/*.md` (ticket id or legacy slice). If a handoff exists, re-dispatch that engineer with the handoff path as primary context (plus ticket + spec under the same root) — same continue-from-handoff rules as skill `write-handoff-and-yield` and feature resume. Cap consecutive yields per ticket/slice at **5**, then surface to the human. Delete the handoff file when the ticket/slice completes.

Do **not** look for a flat `.claude/program/workstreams/<ws>/board.md` — boards live under each feature's artifact root.
