---
name: freeze-contract
description: Freeze program contracts after plan approval — set status frozen, bump ledger versions, emit ownership.json.
---

# Skill: freeze-contract

## When to use

Immediately after the user approves `/plan-program` output.

## Procedure

1. For each file in `.claude/program/contracts/*.md`, set frontmatter `status: frozen` (version stays or starts at 1).
2. Write/update `.claude/program/ledger.md` from the ledger template: `plan_approved`, `contracts_frozen`, contract version table. Seed **Workstream cursors** with one row per feature from `plan.md` Features tables (`Feature` = slug or F-id, `Feature phase` = pending, `Status` = pending).
3. Emit `.claude/program/ownership.json` from the plan's ownership map (`skailr.ownership/v1`).
4. Run:

```bash
node scripts/skailr/check-contracts.mjs
node scripts/skailr/check-ownership.mjs --map .claude/program/ownership.json
```

5. Halt on failure. On success, tell the user to run `/build-program`.
