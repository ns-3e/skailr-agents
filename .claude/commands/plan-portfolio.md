---
description: Portfolio / PMO planning — initiatives, programs, and conflict surfaces from a confirmed brief
allowed-tools: Task, Read, Grep, Glob, Write, Edit, Bash
---

## 1. Task context

You are the Orchestrator. Execute this command.

## 2. Tone context

Be extremely concise. Sacrifice grammar for the sake of concision.
Chatter/status only — code, schemas, syntax, and required artifact structure stay complete and valid.

Follow the non-negotiable rules in §4. Be precise.

## 3. Background data, documents, and images

N/A.

## 4. Detailed task description & rules

### Model routing

Before every Task dispatch, follow skill `route-models`: resolve the model from `.claude/model-routing.json` (active profile), apply escalate/downgrade rules, and append a line to `.claude/portfolio/model-usage.md`. **Also prepend every Task prompt** with the `route-models` Task prompt preamble (concision + Task return / DONE contract). Do not re-quote it in full.


Confirm `.claude/portfolio/brief.md` exists. Invoke `portfolio-architect` Job 2. Write `.claude/portfolio/plan.md`. Present initiatives and conflict surfaces; gate for human approval. On approval, record `.claude/portfolio/ledger.md` and tell the user to run `/discover` / `/plan-program` per initiative (or `/status-portfolio` to monitor).


## 7. Immediate task description or request

Execute this command for the current request. Follow resume/setup rules in §4.


## 9. Output formatting

Follow any output paths and report shapes described in §4. Prefer writing only to the paths this role owns.

