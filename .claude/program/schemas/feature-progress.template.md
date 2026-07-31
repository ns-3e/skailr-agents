---
schema: skailr.feature-progress/v1
feature: <slug>
mode: gated | yolo
status: researching | story | spec | building | verifying | validating | documenting | complete | blocked
updated: <ISO-8601>
request: <ARTIFACT_ROOT>/request.md
---

# Feature Progress: <name>

Artifact root (`ARTIFACT_ROOT`): `.claude/tmp` for standalone `/yolo` / `/ship-feature`, or `.claude/program/workstreams/<ws>/features/<slug>` when nested under a program workstream. All paths below are under that root.

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

## Tickets (when board exists)

Prefer this table when `<ARTIFACT_ROOT>/board.md` exists. Status mirrors ticket frontmatter. Script: `ticket-status.mjs --root <ARTIFACT_ROOT>`.

| ID | Title | Status | Report |
|----|-------|--------|--------|
| T-001 | <title> | pending | tickets/T-001-report.md |

## Build slice (when build is in_progress)

Legacy / aggregate view (still useful when no board, or as role rollup). Mark a role complete when no open/claimed tickets remain for that role.

| Slice | Status | Report |
|-------|--------|--------|
| backend | pending | backend-report.md |
| frontend | pending | frontend-report.md |

## Handoffs

Present while a ticket or build slice has yielded mid-Task (context reset). Convention paths — `feature-status.mjs` detects these files under `<ARTIFACT_ROOT>/handoff/`:

| Key | Path (when present) |
|-----|---------------------|
| T-001 | `handoff/T-001.md` |
| backend | `handoff/backend.md` |
| frontend | `handoff/frontend.md` |
| data | `handoff/data.md` |

Delete the handoff file when that ticket/slice completes. Schema: `.claude/program/schemas/handoff.template.md`. Skill: `write-handoff-and-yield`.

## Notes

Append-only operational notes (resume hints, partial failures, `handoff: <path> (yield N)`). Do not reset on resume.
