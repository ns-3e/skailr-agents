---
schema: skailr.budget-ledger/v1
---

# Budget ledger

Append-only. One line per dispatched agent. Sibling to `model-usage.md` — **not** folded into `skailr.ledger/v1`.

## Locations

- Program runs: `.claude/program/budget-ledger.md`
- Feature runs: `$ARTIFACT_ROOT/budget-ledger.md`

## Format

One markdown table row per agent, in this field order:

`role | budget assigned | fit-test estimate | decision (execute|decompose) | outcome | approx actuals`

```text
| role | budget assigned | fit-test estimate | decision | outcome | approx actuals |
|------|------------------|--------------------|----------|---------|-----------------|
```

Append a row immediately after the agent's fit test (per `.claude/skills/fit-test/SKILL.md`); update `outcome` / `approx actuals` when its completion report lands. Never rewrite or delete a prior row.
