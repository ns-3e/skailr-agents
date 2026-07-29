---
name: reconcile-model
description: Link each financial line item or total to traced assumptions and verify sums and rollups reconcile.
---

# Skill: reconcile-model

## Procedure

1. Open `assumptions.md` and every model under `.claude/program/workstreams/<ws>/models/`.
2. For each material input in a model, confirm it cites an assumption id (or consumed contract id) that exists and matches the stated value (or is explicitly marked placeholder).
3. For each calculated line, recompute from the stated formula and inputs; record pass/fail.
4. For each subtotal and total, verify children sum (or otherwise roll up) to the stated figure within documented rounding policy.
5. Flag plug figures, circular unexplained balancing items, and decision-changing rounding without disclosure.
6. `fin-auditor` fails the workstream if any material line lacks a trace or fails reconciliation.
