---
schema: skailr.handoff/v1
slice: backend | frontend | data | T-001
role: backend-engineer | frontend-engineer | data-engineer
workstream: null | <ws-slug>
yield: <1-based count for this slice/ticket in this run>
updated: <ISO-8601>
trigger: tool-round | budget-80pct
---

# Handoff: <slice or ticket id>

## Goal

One paragraph: what this ticket/slice must deliver (from the ticket or spec).

## Ownership

Globs / owned units this role may touch. Do not expand scope on resume.

## Done

- Path or artifact — what is finished and verified (tests run, migration applied, etc.)
- Reference AC IDs where applicable

## Not done

- Remaining work items (concrete, not vague)

## Decisions

Assumptions and choices made mid-work that the next Task must keep. Empty is fine.

## Open channels

Channel message IDs still open that affect this work (`MSG-…`), or `none`.

## Next steps

1. Exact next action (file/area)
2. Optional second action
3. Optional third action — stop at three; the resume Task re-plans after these

## Commands already run

Shell/test/migrate commands already executed and their outcome (pass/fail). Do not re-run green suites from scratch unless Not done requires it.

## Do-not-reread

Large files or docs already digested — resume should trust Done/Decisions instead of re-reading unless verifying a change.

## Budget checkpoint (80%)

Fires in addition to the tool-round trigger, when a worker reaches 80% of its token budget. Optional — omit this section entirely when `trigger: tool-round`.

- Progress: what fraction of Goal is done
- Decisions: mid-work choices the resume Task must keep (mirror/extend the Decisions section above)
- Remaining plan: concrete steps left
- Gotchas: traps the resume Task would otherwise re-discover

Pair with a **partial** completion report (`.claude/program/schemas/completion-report.template.md`, `Status: partial`), not a `YIELD:`-only note — the dispatching lead re-dispatches the remainder as a fresh agent using this handoff plus that report.
