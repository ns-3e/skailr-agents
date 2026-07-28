---
name: emit-stubs
description: Generate consumer stubs from OpenAPI/JSON Schema sidecars next to frozen contracts so parallel workstreams can build before producers exist.
---

# Skill: emit-stubs

## When to use

After contracts are frozen and before or as Phase B workstreams that consume unfinished producers start.

## Procedure

```bash
node scripts/skailr/emit-stubs.mjs --dir .claude/program/contracts --out .claude/program/stubs
```

Point consumers at stubs. Integration (Phase C) must replace stubs with real producers; ledger should note stub→real cutover.
