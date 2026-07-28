---
name: compile-status-digest
description: Compile PM status digest from ledger, channels inbox, and workstream reports for the exception inbox.
---

# Skill: compile-status-digest

## Procedure

1. Run `ledger-status.mjs --json`.
2. Run `validate-channels.mjs` and collect INBOX lines.
3. Read `.claude/program/workstreams/*/report.md` (or domain reports) for status.
4. Write `.claude/program/status-digest.md` with: traffic lights per workstream, blockers, risks, asks for human.
5. Escalate only exceptions (blocked, contract-change, deadline slip) — not routine green status.
