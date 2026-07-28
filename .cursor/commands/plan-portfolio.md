---
name: plan-portfolio
description: Decompose a confirmed portfolio brief into initiatives, programs, and conflict surfaces
---

<!--
Cursor execution note: Claude Code dispatches subagents via the Task tool.
Cursor has no native cross-agent Task dispatch. In Cursor, run this orchestration
in one agent session by invoking the corresponding `.cursor/rules/<agent>.mdc`
roles in sequence (or via Background Agents for parallel engineer/workstream steps).
The phase order, gates, and contracts below are unchanged — only the dispatch mechanism differs.
-->

## Model routing

Before every Task dispatch, follow skill `route-models`: resolve the model from `.claude/model-routing.json` (active profile), apply escalate/downgrade rules, and append a line to `.claude/portfolio/model-usage.md`.

Confirm `.claude/portfolio/brief.md` exists. Invoke `portfolio-architect` Job 2. Write `.claude/portfolio/plan.md`. Present initiatives and conflict surfaces; gate for human approval. On approval, record `.claude/portfolio/ledger.md` and tell the user to run `/discover` / `/plan-program` per initiative (or `/status-portfolio` to monitor).
