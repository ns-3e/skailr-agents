---
name: fit-test
description: Mandatory startup procedure — every dispatched agent estimates its own context fit before executing and decomposes if the task won't fit a smart-zone context. Use at the start of every Task (lead or worker), before touching any file.
---

# Skill: fit-test

## When to use

**Mandatory.** Every dispatched agent — lead or worker — runs this before doing any real work. A role prompt that omits it is non-conformant.

## Procedure

1. Estimate `= input context (files/docs to read) + expected output (code/docs to produce) + iteration overhead (tool results, retries, re-reads)`.
2. Apply a **1.5–2× multiplier** to the naive input+output sum (see Multiplier below).
3. Compare to budget: **estimate > 65% of budget → decompose**; **≤65% → execute as leaf**.
4. Record `estimate + decision` as a row in the budget ledger — format and locations: `.claude/program/schemas/budget-ledger.template.md`.

## Numeric defaults

Single source of truth: `.claude/program/contracts/budget-templates.md`. Do not restate different numbers.

| Constant | Value |
|---|---|
| Target working budget | 80k tokens |
| Soft ceiling | 100k tokens |
| Hard ceiling | 110k tokens |
| Dumb-zone boundary | 125k tokens |
| Overhead multiplier | 1.5–2× (applied to input+output) |
| Decompose threshold | estimate > 65% of budget → decompose; ≤65% → execute as leaf |
| Minimum task size (spawn floor) | ~10k tokens (below → inline, don't spawn) |
| Spawn overhead per sub-agent | ~5–10k tokens |
| Max direct reports per lead | ≤7 |
| Completion report cap | ~1000 tokens |
| Checkpoint/handoff trigger | 80% of budget |

## Decomposing

If estimate > 65%: become a lead. Split along contract seams, MECE, single-writer per file, ≤7 direct reports, ~10k min per sub-task (below that, inline it instead of spawning — spawn overhead eats the gain). Each sub-task gets its own dispatch packet (`.claude/program/schemas/dispatch-packet.template.md`) and its own fit test.

## Practical estimation heuristics (no tooling — apply by eye)

**Tokens per input file** (rough, chars/4 ≈ tokens):
- Small file / short doc (<150 lines): ~1–2k tokens
- Medium file (150–500 lines): ~3–6k tokens
- Large file (500–1500 lines): ~8–15k tokens
- Whole-directory skim (many small files via Glob/Grep excerpts): ~1–3k per file touched, not full-file cost

**Tokens per expected output**:
- Short doc / template / skill file (~50–150 lines): ~1–2k tokens
- Code change, single file, moderate diff: ~1–3k tokens
- New feature slice (several files, tests included): ~8–20k tokens
- Full report/spec (~1000-token cap artifacts): ~1.5k tokens (includes cap headroom)

**Multiplier: lean toward 2× when**:
- Codebase/domain is unfamiliar (first pass, no prior orientation doc)
- Many re-reads expected (iterative debugging, test-fix loops, cross-file consistency checks)
- Task touches files not on the initial read list (discovery mid-task)

**Multiplier: lean toward 1.5× when**:
- Familiar codebase (orientation.md / field-guide exists and was read)
- Single-pass write (template, doc, isolated fix) with a clear style reference
- File allowlist is small and fixed, no expected discovery

## Record the result

Every fit test ends with a budget-ledger row, whether the decision is execute or decompose. Point at `.claude/program/schemas/budget-ledger.template.md` for the exact line format and file locations — do not restate it here.
