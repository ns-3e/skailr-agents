---
name: run-gated-pipeline
description: Meta-skill for orchestrators — run a phase, then ownership + channel + contract script gates before advancing.
---

# Meta-skill: run-gated-pipeline

## Pattern

1. Dispatch scoped agents for the phase.
2. Run `check-ownership`, `validate-channels` (the mechanical half of `route-channels`), and `check-contracts` (when contracts changed) **as one `&&`-chained Bash call**, not three separate tool calls — each top-level Bash invocation costs a full context re-read this deep into a session; there's no reason three fast, independent-of-each-other checks need three turns. Only the channel *drain loop* that follows an open message is inherently multi-turn.
3. Update ledger phase row to `complete` only if all gates pass — skill `track-phase`.
4. On `@human` / `contract-change`, stop — do not advance.

Never skip gates because "tests passed."
