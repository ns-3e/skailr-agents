---
schema: skailr.completion-report/v1
task: <task-id or slug>
role: <role>
workstream: null | <ws-slug>
updated: <ISO-8601>
---

# Completion report: <task-id or slug>

Cap ~1000 tokens total. Exactly these 6 fields. Terse — this is a lead-facing report, not a narrative.

## Status

complete | partial | blocked

## Artifacts

Path — one-line description. One line per artifact.

## Contract conformance

Confirmed per acceptance criterion (AC1: ✅/❌ …).

## Deviations

From plan, with rationale. `none` if none.

## Open risks

Follow-ups / risks / escalations needed. `none` if none.

## Budget actuals

Fit-test estimate vs approximately consumed; execute/decompose decision.
