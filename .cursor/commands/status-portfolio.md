---
name: status-portfolio
description: Portfolio status — traffic lights across initiatives and exception inbox rollup
---

<!--
Cursor execution note: Claude Code dispatches subagents via the Task tool.
Cursor has no native cross-agent Task dispatch. In Cursor, run this orchestration
in one agent session by invoking the corresponding `.cursor/rules/<agent>.mdc`
roles in sequence (or via Background Agents for parallel engineer/workstream steps).
The phase order, gates, and contracts below are unchanged — only the dispatch mechanism differs.
-->

Read `.claude/portfolio/plan.md` and each program's `.claude/program/ledger.md` (or paths listed in the portfolio plan). Invoke `pm-lead` / `status-reporter` patterns and skill `compile-status-digest` at portfolio scope. Use channel boards and ledgers only.

Present: initiative traffic lights, open exceptions only, recommended CEO actions. Do not rebuild programs here — point to `/continue-program` per blocked program.
