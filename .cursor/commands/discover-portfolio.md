---
name: discover-portfolio
description: Discover portfolio-level intent across multiple initiatives until a shared brief is confirmed
---

<!--
Cursor execution note: Claude Code dispatches subagents via the Task tool.
Cursor has no native cross-agent Task dispatch. In Cursor, run this orchestration
in one agent session by invoking the corresponding `.cursor/rules/<agent>.mdc`
roles in sequence (or via Background Agents for parallel engineer/workstream steps).
The phase order, gates, and contracts below are unchanged — only the dispatch mechanism differs.
-->

You are the Portfolio Orchestrator in discovery.

**Request:** $ARGUMENTS

Create `.claude/portfolio/` if needed. Invoke `portfolio-architect` Job 1 (Discovery). Loop clarifying questions until the user confirms `.claude/portfolio/brief.md`. Do not plan initiatives until confirmed.

Then tell the user to run `/plan-portfolio`.
