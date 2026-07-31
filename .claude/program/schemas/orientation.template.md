# Orientation: <repo name or root>

## Stack
Language, framework, package manager, test runner, DB, ORM/query layer, deployment target.

## Directory Boundaries
| Concern | Path | Notes |
|---------|------|-------|
| Backend | | |
| Frontend | | |
| Shared types | | |
| Tests | | |
| Migrations | | |
| Config | | |

## Design System / Brand Visuals
Tokens, component library / primitives, typography, motion patterns, brand guidelines path — or `none / greenfield` if absent. Omit detail when the repo has no UI.

## Representative Vertical Slices
Max 2 slices.
### <Slice 1 name>
- Paths: `path/a`, `path/b`, …
- How it works: ≤5 lines. No essay.
### <Slice 2 name>
…

## House Conventions
Max ~8 rows. Topics: routing / validation / error handling / auth / migrations / state / API client / testing / design-system (when UI).
Per row: topic — path — ≤3-line excerpt **or** `same as <prior path>`.

## Data Model overview
Existing tables/columns/relationships. Bullets; no full schema dump.

## Cross-cutting Risks
Ranked one-liners: what / where (paths) / why.

## Open Questions
Things you could not determine from the code alone and that a human must answer.
