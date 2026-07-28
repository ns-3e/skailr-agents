---
name: route-channels
description: Drain open channel messages — route to addressees, halt on @human and contract-change. Use after every concurrency group or engineer pair.
---

# Skill: route-channels

## When to use

After each parallel step in `/build-feature` or `/build-program`.

## Procedure

1. Validate boards:

```bash
node scripts/skailr/validate-channels.mjs --dir .claude/program/channels
# feature:
node scripts/skailr/validate-channels.mjs --tmp
```

2. For each `status: open` message in seq order:
   - `to: @human` or `type: contract-change` → mark `blocked-on-human`, surface to user, **end turn**
   - else dispatch addressee with only that thread; collect answer; re-dispatch blocked agent
   - When dispatching, follow skill `route-models` (channel factual lookups may **downgrade** one tier unless the role is `protected`)
3. Repeat until no resolvable opens remain.
4. Read `.claude/program/channels/PROTOCOL.md` for format rules.
