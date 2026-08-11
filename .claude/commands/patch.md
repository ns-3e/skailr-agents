---
description: Bounded fix or small change — implemented directly, no dispatches, no gates
argument-hint: <bug fix or small change in plain language>
allowed-tools: Read, Grep, Glob, Write, Edit, Bash
---

Fix this directly yourself: **$ARGUMENTS**

You are working inline — no subagents, no pipeline artifacts. This is the
proven-cheapest path for a bounded change; keep it that way.

## Rules

1. **Size-check first.** If, once you've looked at the code, this is really a
   cohesive feature (new capability, multi-file vertical slice) tell the user
   to run `/build` with the same ask and stop — don't half-implement. If it's
   program-scale, point to `/program`.
2. **Read before you write.** Find the actual cause; fix that, not the symptom.
3. **Prove it.** Run the narrowest existing tests that cover the change (add a
   regression test if the bug had none and the suite makes that cheap). Report
   real results — a red test is reported red.
4. **Don't stop for approval.** Resolve ambiguity with explicit, stated
   assumptions.
5. If the change alters something a CLAUDE.md file documents (structure,
   commands, conventions), update that file in the same pass.

## Report

End with: what changed (paths), how it was verified (command + result), any
assumptions made. Nothing else.
