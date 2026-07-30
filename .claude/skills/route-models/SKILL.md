---
name: route-models
description: Resolve which model to use for each Task dispatch from model-routing.json — escalate on gate failure, downgrade for thin channel digests. Use before every subagent Task call.
---

# Skill: route-models

## When to use

Before every `Task` (subagent) dispatch in orchestrator commands (`/ship-feature`, `/build-feature`, `/yolo`, `/build-program`, portfolio commands, channel re-dispatches).

## Resolve model

1. Read `.claude/model-routing.json`.
2. Take `profiles[active].roles[<agent-name>]`, falling back to `profiles[active].default`.
3. Apply escalate / downgrade rules below.
4. **Claude Code:** invoke the named agent (frontmatter `model:` should already match the active profile after `apply-model-routing.mjs`). If you must override for a one-off escalate, say so in the Task prompt.
5. **Cursor:** pass the resolved model as the Task `model` parameter. Role defaults are also listed in `.cursor/model-routing.md` and on each `.cursor/rules/<agent>.mdc`.

## Task prompt preamble (every dispatch)

**Prepend** this to every Task `prompt` (first lines of the prompt string), including channel re-dispatches and lead→worker dispatches:

```text
Be extremely concise. Sacrifice grammar for the sake of concision.
Chatter/status only — code, schemas, syntax, and required artifact structure stay complete and valid.
```

Do not omit it for engineers or other builders: they stay terse in narration; deliverables remain full and correct.

## Downgrade (save tokens / rate limits)

Use **one tier below** the role default (tiers: `haiku` → `sonnet` → `opus`; never below `haiku`) when **all** of:

- The dispatch is a channel answer that is a factual lookup or a pure digest compile (`status-reporter`-style), **or** the skill `route-channels` is resolving a thin `question` thread; **and**
- The agent name is **not** in the config `protected` list.

Never downgrade protected roles (architects, engineers, validators, leads).

## Escalate (once)

If a quality gate fails and you **re-invoke the same role**, bump **one tier up** (max `opus`):

- Thin research (no concrete prior-art paths)
- Ownership glob overlap after architect
- Failed e2e / red kernel tests on engineer retry
- Validator / program-validator verdict `DO NOT SHIP` or `SHIP WITH FIXES` when re-running a builder or verifier

Escalate at most **once** per role per phase. Do not escalate protected-role floors downward in any profile.

## Log usage

Append one line after each dispatch:

- Feature runs: `.claude/tmp/model-usage.md`
- Program runs: `.claude/program/model-usage.md`

Format:

```text
ISO-8601 | <role> | <model> | <phase> | <note>
```

Example:

```text
2026-07-28T12:00:00Z | researcher | sonnet | research | default
2026-07-28T12:05:00Z | researcher | opus | research | escalate:thin-research
```

## Switch profiles (human / maintainer)

```bash
node scripts/skailr/apply-model-routing.mjs --profile economy
# pack maintainers:
./scripts/remirror.sh
```

Docs: [docs/MODEL_ROUTING.md](../../../docs/MODEL_ROUTING.md).
