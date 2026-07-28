---
description: Decompose a confirmed portfolio brief into initiatives, programs, and conflict surfaces
allowed-tools: Task, Read, Write, Bash
---

## Model routing

Before every Task dispatch, follow skill `route-models`: resolve the model from `.claude/model-routing.json` (active profile), apply escalate/downgrade rules, and append a line to `.claude/portfolio/model-usage.md`.

Confirm `.claude/portfolio/brief.md` exists. Invoke `portfolio-architect` Job 2. Write `.claude/portfolio/plan.md`. Present initiatives and conflict surfaces; gate for human approval. On approval, record `.claude/portfolio/ledger.md` and tell the user to run `/discover` / `/plan-program` per initiative (or `/status-portfolio` to monitor).
