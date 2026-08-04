---
schema: skailr.dispatch-packet/v1
task: engineering-agents-budget-fields
from: WS-3 worker-prompts-budget (lead)
to: general-purpose
workstream: WS-3
updated: 2026-08-04T00:44:00Z
---

# Dispatch: engineering-agents-budget-fields

No conversation history, no parent transcript. Exactly these 8 fields.

This is a real 3rd-tier dispatch from this program's own execution: the program
decomposed into workstreams (including WS-3), WS-3's fit test failed (~150-200k naive
across 40 role files, >65% of its 80k budget) and it decomposed by team subdirectory,
and this packet is what WS-3 sent to one of its 7 resulting sub-agents.

## Goal

Add the shared `### Budget` obligation block — "run the startup fit test (skill
`fit-test`) before touching any file; do not proceed past your budget's soft ceiling
without checkpointing (skill `write-handoff-and-yield`)" — to each of the 8 engineering
role files under `.claude/agents/engineering/`, matching the wording WS-3 already
landed in `.claude/agents/program/program-architect.md`.

## Acceptance criteria

- AC1: Each of `architect.md`, `backend-engineer.md`, `data-engineer.md`,
  `e2e-verifier.md`, `frontend-engineer.md`, `researcher.md`, `story-writer.md`,
  `validator.md` has a `### Budget` section.
- AC2: Each `### Budget` section states the fit-test-before-work obligation and the
  soft-ceiling checkpoint obligation, in wording consistent with
  `program-architect.md`'s block — no divergent phrasing invented per file.
- AC3: No other section in any of the 8 files is reordered, removed, or otherwise
  edited.
- AC4: Wording references skill `fit-test` and skill `write-handoff-and-yield` by name.

## Frozen contract(s)

- `.claude/program/contracts/budget-templates.md`
- `.claude/program/contracts/fit-test-procedure.md`

## File allowlist

Read: the two contracts above; `.claude/agents/program/program-architect.md` (reference
wording only, not owned by this task).
Write/own: the 8 files listed in AC1, all under `.claude/agents/engineering/` —
single-writer, no other task touches these paths.

## Token budget

Target 80k / soft ceiling 100k / hard ceiling 110k. Run fit-test
(`.claude/skills/fit-test/SKILL.md`) before starting.

## Forbidden scope

Do not touch any file outside `.claude/agents/engineering/`. Do not touch
`.claude/commands/**` or `.claude/skills/**`. Do not renegotiate the `### Budget`
block's wording — it is frozen by the `budget-templates` contract, not this task's to
redesign. Do not touch WS-2's or the other 6 WS-3 sub-agents' files.

## Report format

Pointer: `.claude/program/schemas/completion-report.template.md`.

## Channel path

`.claude/program/channels/program.md`
