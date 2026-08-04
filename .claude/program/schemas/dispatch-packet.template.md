---
schema: skailr.dispatch-packet/v1
task: <task-id or slug>
from: <dispatching role>
to: <dispatched role>
workstream: null | <ws-slug>
updated: <ISO-8601>
---

# Dispatch: <task-id or slug>

No conversation history, no parent transcript. Exactly these 8 fields.

## Goal

One paragraph: what this task must deliver, unambiguous.

## Acceptance criteria

Testable, enumerated (AC1, AC2, …).

## Frozen contract(s)

Interfaces this task must conform to, by path. `none` if none apply.

## File allowlist

Read: paths this task may read.
Write/own: paths this task may write (single-writer — no other task touches these).

## Token budget

Target / soft ceiling / hard ceiling (tokens). Run fit-test (`.claude/skills/fit-test/SKILL.md`) before starting.

## Forbidden scope

What this task must NOT touch or re-decide. Deviations go in the completion report, not silent edits.

## Report format

Pointer: `.claude/program/schemas/completion-report.template.md`.

## Channel path

Where to append channel entries, or `N/A`.
