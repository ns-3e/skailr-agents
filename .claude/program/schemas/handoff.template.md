---
schema: skailr.handoff/v1
slice: backend | frontend | data
role: backend-engineer | frontend-engineer | data-engineer
workstream: null | <ws-slug>
yield: <1-based count for this slice in this run>
updated: <ISO-8601>
---

# Handoff: <slice>

## Goal

One paragraph: what this slice must deliver (from the spec).

## Ownership

Globs / owned units this role may touch. Do not expand scope on resume.

## Done

- Path or artifact — what is finished and verified (tests run, migration applied, etc.)
- Reference AC IDs where applicable

## Not done

- Remaining work items (concrete, not vague)

## Decisions

Assumptions and choices made mid-slice that the next Task must keep. Empty is fine.

## Open channels

Channel message IDs still open that affect this slice (`MSG-…`), or `none`.

## Next steps

1. Exact next action (file/area)
2. Optional second action
3. Optional third action — stop at three; the resume Task re-plans after these

## Commands already run

Shell/test/migrate commands already executed and their outcome (pass/fail). Do not re-run green suites from scratch unless Not done requires it.

## Do-not-reread

Large files or docs already digested — resume should trust Done/Decisions instead of re-reading unless verifying a change.
