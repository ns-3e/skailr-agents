---
name: status-portfolio
description: CEO / exec status review — initiative traffic lights and exception inbox rollup
---

<!--
Cursor execution note: Claude Code dispatches subagents via the Task tool.
Cursor has no native cross-agent Task dispatch. In Cursor, run this orchestration
in one agent session by invoking the corresponding `.cursor/rules/<agent>.mdc`
roles in sequence (or via Background Agents for parallel engineer/workstream steps).
The phase order, gates, and contracts below are unchanged — only the dispatch mechanism differs.
-->

## 1. Task context

You are the Orchestrator. Execute this command.

## 2. Tone context

Follow the non-negotiable rules in §4. Be precise.

## 3. Background data, documents, and images

N/A.

## 4. Detailed task description & rules

### Model routing

Before every Task dispatch, follow skill `route-models`: resolve the model from `.claude/model-routing.json` (active profile), apply escalate/downgrade rules, and append a line to `.claude/portfolio/model-usage.md`.

Read `.claude/portfolio/plan.md` and each program's `.claude/program/ledger.md` (or paths listed in the portfolio plan). Invoke `pm-lead` / `status-reporter` patterns and skill `compile-status-digest` at portfolio scope. Use channel boards and ledgers only.

Present: initiative traffic lights, open exceptions only, recommended CEO actions. Do not rebuild programs here — point to `/continue-program` per blocked program.

## 5. Examples

N/A.

## 6. Conversation history

N/A.

## 7. Immediate task description or request

Execute this command for the current request. Follow resume/setup rules in §4.

## 8. Thinking step by step

Reason through inputs and rules before writing artifacts. Take a deep breath.

## 9. Output formatting

Follow any output paths and report shapes described in §4. Prefer writing only to the paths this role owns.

Be extremely concise. Sacrifice grammar for the sake of concision.

## 10. Prefillled response (if any)

N/A.
