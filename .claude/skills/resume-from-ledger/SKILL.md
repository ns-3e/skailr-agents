---
name: resume-from-ledger
description: Determine the next incomplete program phase from ledger.md and resume without redoing finished work.
---

# Skill: resume-from-ledger

## When to use

`/continue-program` or any mid-session return to an in-flight program.

## Procedure

```bash
node scripts/skailr/ledger-status.mjs --json
```

Map `next` to `/build-program` phase (A–E). Do not reset channels. Re-run script gates before advancing.
