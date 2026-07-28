---
name: run-gated-pipeline
description: Meta-skill for orchestrators — run a phase, then ownership + channel + contract script gates before advancing.
---

# Meta-skill: run-gated-pipeline

## Pattern

1. Dispatch scoped agents for the phase.
2. Run `check-ownership` skill (script).
3. Run `route-channels` skill (script + router loop).
4. Run `check-contracts` if contracts changed.
5. Update ledger phase row to `complete` only if all gates pass.
6. On `@human` / `contract-change`, stop — do not advance.

Never skip gates because "tests passed."
