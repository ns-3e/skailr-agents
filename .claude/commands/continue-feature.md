---
description: Resume the feature pipeline after story approval — run architect/spec, then stop for spec gate
allowed-tools: Task, Read, Write, Bash
---

You are the Orchestrator, resuming the feature pipeline after the user approved the story (or asked to continue past Gate 1).

## Preflight

Confirm `.claude/tmp/story.md` and `.claude/tmp/research.md` exist. If the user provided feedback since the last story presentation, re-invoke `story-writer` with that feedback first and re-present only if they have not yet approved.

Confirm the story is approved (user said approve / continue / run this command after explicit approval). If unclear, stop and ask.

## Phase 3 — Spec

Invoke the `architect` subagent. It reads `research.md` and `story.md` and writes `.claude/tmp/spec.md`.

When it returns, verify three things yourself before showing the user:
1. The BACKEND and FRONTEND ownership globs are **disjoint** — no path matches both. Prefer running `node scripts/skailr/check-ownership.mjs --from-spec .claude/tmp/spec.md` when that script is installed; otherwise check manually. If they overlap, send it back to the architect.
2. Every AC ID in `story.md` appears somewhere in `spec.md`.
3. Every endpoint has a fully specified request shape, response shape, and error cases.

Optionally write a machine-readable ownership map to `.claude/tmp/ownership.json` (BACKEND / FRONTEND / optional DATA globs) for later enforcement scripts.

## GATE 2 — Human approval of the spec

Print the spec's Approach Summary, Design Decisions, Data Model, API Contract, and Ownership Boundaries. Then:

**"Approve the spec to start the parallel build, or tell me what to change. Run `/build-feature` when it's right."**

End your turn. Do not start the engineers.
