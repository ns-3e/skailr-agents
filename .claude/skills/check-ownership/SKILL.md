---
name: check-ownership
description: Run mechanical ownership glob checks against the program or feature ownership map. Use before advancing build phases or after parallel engineer/workstream steps.
---

# Skill: check-ownership

## When to use

After any parallel write step (engineers, workstreams) and before plan approval when globs are set.

## Procedure

1. Prefer `.claude/program/ownership.json` (program) or `.claude/tmp/ownership.json` (feature).
2. Run:

```bash
node scripts/skailr/check-ownership.mjs --map .claude/program/ownership.json
# or
node scripts/skailr/check-ownership.mjs --from-spec .claude/tmp/spec.md
```

3. Non-zero exit → **halt**. Do not advance the phase. Report violations to the user or owning team.
4. Exit 0 with "No ownership map" is allowed only before a map exists; once plan/spec is approved, a missing map is a defect.
