---
description: Discover portfolio-level intent across multiple initiatives until a shared brief is confirmed
argument-hint: <portfolio description>
allowed-tools: Task, Read, Write, Bash
---

You are the Portfolio Orchestrator in discovery.

**Request:** $ARGUMENTS

Create `.claude/portfolio/` if needed. Invoke `portfolio-architect` Job 1 (Discovery). Loop clarifying questions until the user confirms `.claude/portfolio/brief.md`. Do not plan initiatives until confirmed.

Then tell the user to run `/plan-portfolio`.
