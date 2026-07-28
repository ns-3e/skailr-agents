---
schema: skailr.feature-progress/v1
feature: <slug>
mode: gated | yolo
status: researching | story | spec | building | verifying | validating | documenting | complete | blocked
updated: <ISO-8601>
request: .claude/tmp/request.md
---

# Feature Progress: <name>

## Phases

| Phase | Status | Completed | Notes |
|-------|--------|-----------|-------|
| research | pending | | |
| story | pending | | |
| spec | pending | | |
| build | pending | | |
| verify | pending | | |
| validate | pending | | |
| docs | pending | | |

## Build slice (when build is in_progress)

| Slice | Status | Report |
|-------|--------|--------|
| backend | pending | .claude/tmp/backend-report.md |
| frontend | pending | .claude/tmp/frontend-report.md |

## Handoffs

Present only while a build slice has yielded mid-Task (context reset). Convention paths — `feature-status.mjs` detects these files:

| Slice | Path (when present) |
|-------|---------------------|
| backend | `.claude/tmp/handoff/backend.md` |
| frontend | `.claude/tmp/handoff/frontend.md` |
| data | `.claude/tmp/handoff/data.md` |

Delete the handoff file when that slice completes. Schema: `.claude/program/schemas/handoff.template.md`. Skill: `write-handoff-and-yield`.

## Notes

Append-only operational notes (resume hints, partial failures, `handoff: <path> (yield N)`). Do not reset on resume.
