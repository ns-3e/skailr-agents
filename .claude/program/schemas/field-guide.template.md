---
program: <slug>
budget: 100 lines (enforced by convention — trim oldest entries when over budget)
---

# Program Field Guide

A shared knowledge base seeded by the researcher/architect and appended by agents during the
program run. Automatically injected at the start of each agent's context.

Entries should capture non-obvious discoveries: patterns found in the codebase, constraints
not in the spec, failure modes encountered, or conventions confirmed. Do NOT copy information
already in research.md, spec.md, or the contracts — those are the authoritative sources.

## Format

Each entry: `[ROLE @ TIMESTAMP] <one sentence fact>` — max 2 lines per entry.

## Entries

<!-- Seed entries go here. Example:
[researcher @ 2026-01-01] All API handlers validate auth via middleware; never inline — adding inline auth check is a bug.
[architect @ 2026-01-01] The payments module has a 200-line limit enforced by the linter; decompose any payment feature before assigning.
-->
