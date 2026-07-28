---
name: drain-exception-inbox
description: Meta-skill — collect open human/contract-change/blocker items into a decision list for the CEO inbox (CLI/UI or chat).
---

# Meta-skill: drain-exception-inbox

## Procedure

1. `node scripts/skailr/validate-channels.mjs` (program and/or tmp).
2. List every INBOX line.
3. For each item present: blast radius (from contract metadata if `contract-change`), recommended decision, blocking workstreams.
4. Do not auto-approve. Wait for human `approve` / `reject` / `defer`.
5. After decision, append channel resolution and update ledger blockers section.
6. If control-plane API is running: prefer `GET /inbox` and `POST /approvals/:id`.
