---
schema: skailr.handoff/v1
slice: engineering-agents-budget-fields
role: general-purpose
workstream: WS-3
yield: 1
updated: 2026-08-04T00:48:00Z
trigger: budget-80pct
---

*Illustrative — constructed for this worked example; no real dispatch in this program
actually hit 80%. In the real run, `engineering-agents-budget-fields` (see
`dispatch-packet-example.md` / `completion-report-example.md`) completed all 8 files at
~40k tokens — 50% of its 80k budget — without checkpointing. This variant asks: what if
the same task had instead run ~1.6x longer (say, three of the eight files needed a
second read-edit pass to match existing section conventions) and crossed the 80%
checkpoint/handoff trigger (64k tokens) after 5 of 8 files? This is what the resulting
handoff artifact would look like.*

# Handoff: engineering-agents-budget-fields

## Goal

Add the shared `### Budget` obligation block to all 8 engineering role files under
`.claude/agents/engineering/`, matching the wording in `program-architect.md`. (Full
goal/ACs: `dispatch-packet-example.md`.)

## Ownership

`.claude/agents/engineering/*.md` — the 8 files named in the dispatch packet's File
allowlist, single-writer. Do not expand scope to other team subdirs on resume.

## Done

- `.claude/agents/engineering/architect.md` — `### Budget` added, verified.
- `.claude/agents/engineering/backend-engineer.md` — `### Budget` added, verified.
- `.claude/agents/engineering/data-engineer.md` — `### Budget` added, verified.
- `.claude/agents/engineering/e2e-verifier.md` — `### Budget` added, verified.
- `.claude/agents/engineering/frontend-engineer.md` — `### Budget` added, verified.
  (AC1/AC2/AC4 satisfied for these 5.)

## Not done

- `.claude/agents/engineering/researcher.md`
- `.claude/agents/engineering/story-writer.md`
- `.claude/agents/engineering/validator.md`

## Decisions

Wording copied verbatim from `program-architect.md`'s `### Budget` block, substituting
only the role name. Placement: directly under `## 1. Task context`, after the
role-intro paragraph — uniform across all 8 files, no per-file variation.

## Open channels

none

## Next steps

1. Add `### Budget` to `researcher.md` — directly under `## 1. Task context`, after
   the role-intro paragraph.
2. Add `### Budget` to `story-writer.md` — directly under `## 1. Task context`, after
   the role-intro paragraph.
3. Add `### Budget` to `validator.md` — directly under `## 1. Task context`, after
   the role-intro paragraph, same as done for `e2e-verifier.md`.

## Commands already run

None — markdown-only edits, no test suite applies to role-prompt files.

## Do-not-reread

`.claude/program/contracts/budget-templates.md` and
`.claude/program/contracts/fit-test-procedure.md` — already digested; wording is
settled per Decisions above. Trust this handoff instead of re-reading them unless
verifying an exact phrase.

## Budget checkpoint (80%)

- Progress: 5 of 8 files done (~62% of Goal by file count, 80% of token budget
  consumed — the two aren't proportional because the last 3 files needed a second
  read-edit pass to confirm placement matched the other 5).
- Decisions: verbatim wording from `program-architect.md`; placement directly under
  `## 1. Task context`, after the role-intro paragraph, uniform across all 8 files.
- Remaining plan: the 3 files in Next steps, in order.
- Gotchas: confirm the role-intro paragraph boundary before placing the block, or it
  lands in the wrong spot silently (no lint catches this).

Pair with a **partial** completion report
(`.claude/program/schemas/completion-report.template.md`, `Status: partial`), not a
`YIELD:`-only note — WS-3 re-dispatches the remaining 3 files as a fresh agent using
this handoff plus that report (see the illustrative
`engineering-agents-budget-fields-resume` row in `budget-ledger-excerpt.md`).
