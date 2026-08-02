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
# standalone feature:
node scripts/skailr/validate-channels.mjs --tmp
# nested program feature (ARTIFACT_ROOT=.claude/program/workstreams/<ws>/features/<slug>):
node scripts/skailr/validate-channels.mjs --dir $ARTIFACT_ROOT/channels
```

2. Starvation check first: the validator prints `age=` (messages posted since) per inbox item and `WARN` for addressees matching no team/role. An open item with `age >= 10`, or any addressee WARN, does not wait its turn — re-route it to the right owner now, or surface it to the user with the thread. A parked message never drains itself.
3. For each `status: open` message in seq order:
   - `to: @human` or `type: contract-change` → mark `blocked-on-human`, surface to user, **end turn**
   - else dispatch addressee with only that thread; collect answer; re-dispatch blocked agent
   - When dispatching, follow skill `route-models` including its Task prompt preamble (concision); channel factual lookups may **downgrade** one tier unless the role is `protected`
4. Repeat until no resolvable opens remain.
5. After the drain, rotate oversized boards: `node scripts/skailr/rotate-channels.mjs [--dir <channels>]` (default threshold 50 settled messages). It moves **fully-settled threads only**, raw blocks verbatim, to `archive-<board>.md` in the same directory — append-only semantics preserved; open and partially-settled threads never move.
6. Read `.claude/program/channels/PROTOCOL.md` for format rules.
