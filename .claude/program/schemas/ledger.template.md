---
schema: skailr.ledger/v1
program: <slug>
status: planning | approved | building | integrating | validating | documenting | complete | blocked
updated: <ISO-8601>
---

# Program Ledger: <name>

## Gates

| Gate | Status | At | By | Notes |
|------|--------|----|----|-------|
| brief_confirmed | pending | | | |
| plan_approved | pending | | | |
| contracts_frozen | pending | | | |

## Phases

| Phase | Status | Commit | Completed |
|-------|--------|--------|-----------|
| A_kernel | pending | | |
| B_workstreams | pending | | |
| C_integration | pending | | |
| D_validation | pending | | |
| E_documentation | pending | | |

## Contract versions

| Contract ID | Version | Status | Path |
|-------------|---------|--------|------|
| | 1 | draft | .claude/program/contracts/ |

## Workstream cursors

One row per feature (from plan.md Features). A workstream is complete when every feature row for that workstream is `complete`. Feature phase mirrors the nested feature pipeline: `research` | `story` | `spec` | `build` | `verify` | `validate` | `docs` | `complete`. Artifact root: `.claude/program/workstreams/<ws>/features/<slug>/`.

| Workstream | Team | Feature | Feature phase | Status |
|------------|------|---------|---------------|--------|
| | | | | pending |

## Blockers

Open inbox items (channel MSG ids or approval ids). Empty when clear.

## Notes

Append-only operational notes. Prefer channel messages for cross-team items.
