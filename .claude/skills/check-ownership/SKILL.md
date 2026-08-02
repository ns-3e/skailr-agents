---
name: check-ownership
description: Run mechanical ownership glob checks against the program or feature ownership map. Use before advancing build phases or after parallel engineer/workstream steps.
---

# Skill: check-ownership

## When to use

After any parallel write step (engineers, workstreams) and before plan approval when globs are set.

## Procedure

1. Prefer `.claude/program/ownership.json` (program) or `$ARTIFACT_ROOT/ownership.json` (feature; `.claude/tmp` standalone).
2. Run:

```bash
node scripts/skailr/check-ownership.mjs --map .claude/program/ownership.json
# or, feature-scoped (standalone ARTIFACT_ROOT=.claude/tmp; nested = workstreams/<ws>/features/<slug>):
node scripts/skailr/check-ownership.mjs --from-spec $ARTIFACT_ROOT/spec.md
# or, when the architect emitted a board-level map:
node scripts/skailr/check-ownership.mjs --map $ARTIFACT_ROOT/ownership.json
```

3. Non-zero exit → **halt**. Do not advance the phase. Report violations to the user or owning team.
4. Exit 0 with "No ownership map" is allowed only before a map exists; once plan/spec is approved, a missing map is a defect.
