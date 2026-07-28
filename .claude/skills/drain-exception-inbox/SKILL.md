---
name: drain-exception-inbox
description: Meta-skill — collect open human/contract-change/blocker items into a decision list for the human (chat / channel answers).
---

# Meta-skill: drain-exception-inbox

## Procedure

1. `node scripts/skailr/validate-channels.mjs` (program and/or tmp).
2. List every INBOX line.
3. For each item present: blast radius (from contract metadata if `contract-change`), recommended decision, blocking workstreams.
4. Do not auto-approve. Wait for human `approve` / `reject` / `defer` in chat or as a channel `decision` / `answer`.
5. After decision, append channel resolution and update ledger blockers section.
