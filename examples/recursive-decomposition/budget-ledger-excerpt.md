---
schema: skailr.budget-ledger/v1
---

# Budget ledger excerpt — worked example

Format: `role | budget assigned | fit-test estimate | decision (execute|decompose) |
outcome | approx actuals`, per `.claude/program/schemas/budget-ledger.template.md`.

Rows in sections 1-3 are drawn from this program's own live ledger,
`.claude/program/budget-ledger.md` (program `context-budget-recursive-decomposition`) —
real numbers from the real run. Section 4 is marked **[ILLUSTRATIVE]** throughout and
did not happen; it extends the real `engineering-agents-budget-fields` row to show the
80%-checkpoint → handoff → fresh-agent → integrate beat, which no dispatch in the real
run actually triggered.

## 1. Why the whole program was never dispatched as one leaf

| role | budget assigned | fit-test estimate | decision | outcome | approx actuals |
|---|---|---|---|---|---|
| program-build-as-one-leaf **[ILLUSTRATIVE]** | 80k/100k/110k | ~280k naive (plan + build + verify + doc across 4 workstreams in one context), far over 65% of 80k | decompose | never dispatched — program-architect decomposed into workstreams at planning time instead | n/a |

Constructed, not a real ledger line — no agent ever attempts the whole program as a
single leaf. The real fit-test-shaped step that produces the workstream split is
program-architect's Job 2 decomposition (real row below). This illustrative row exists
only to show the arithmetic: ~280k naive is ~3.5x the 80k target, nowhere near
executable as a leaf, which is why the plan goes straight to N workstreams.

## 2. Program decomposes into workstreams (real)

| role | budget assigned | fit-test estimate | decision | outcome | approx actuals |
|---|---|---|---|---|---|
| program-architect (Job 2: decomposition) | 80k/100k/110k | ~35k (brief read + plan/contracts write) | execute | complete | ~54k |
| WS-1 foundation-templates | 80k/100k/110k | ~35-40k | execute | complete | ~60k |
| WS-2 orchestrator-lead-prompts (lead) | 80k/100k/110k | ~70-90k (12 files, contracts+plan read) | decompose | complete | ~40k |
| WS-3 worker-prompts-budget (lead) | 80k/100k/110k | ~150-200k naive (40 role files + 7 kernel docs), >65% of budget | decompose | complete | ~68k lead + ~509k across 7 sub-agents (isolated contexts, not additive) |
| WS-4 docs-worked-example (lead) | 80k/100k/110k | ~75-90k, >65% of budget | decompose | in progress | pending |

WS-1's estimate (~35-40k on an 80k budget, ≤65% = ≤52k) passed the fit test and ran as
a single leaf. WS-2's and WS-3's estimates both exceeded 52k and both decomposed. This
worked example follows WS-3's decomposition down another tier.

## 3. WS-3 decomposes into 7 team-subdir sub-agents (real)

| role | budget assigned | fit-test estimate | decision | outcome | approx actuals |
|---|---|---|---|---|---|
| content-team-budget-hygiene | 80k/100k/110k | ~27k | execute | complete | ~20k |
| engineering-agents-budget-fields | 80k/100k/110k | ~44k (8 files read ~24k + 16 small edits ~5k, 1.5x overhead) | execute | complete | ~40k |
| legal-agents-budget-fields | 80k/100k/110k | ~15k | execute | complete | ~13k |
| finance-agents-budget-fields | 80k/100k/110k | ~12k | execute | complete | ~20k |
| design-agents-budget-fields | 80k/100k/110k | ~14k | execute | complete | ~13k |
| marketing-agents-budget-fields | 80k/100k/110k | ~14k | execute | complete | ~16k |
| pm-program-portfolio-experts-budget-fields | 80k/100k/110k | ~18k | execute | complete | ~30k |

Exactly 7 direct reports — at the ≤7 ceiling. Every one of these fit-tested well under
65% of 80k (all execute as leaves), and none crossed the 80% checkpoint trigger (64k
tokens); the largest, `engineering-agents-budget-fields`, finished at ~40k, 50% of
budget. See `dispatch-packet-example.md` and `completion-report-example.md` for that
sub-agent's real, full-shaped artifacts.

## 4. Illustrative extension: engineering-agents-budget-fields hits 80% instead

*Nothing below this line happened. It is constructed to exercise the
checkpoint/handoff/fresh-agent/integrate beat the real run never triggered — full
artifact in `handoff-example.md`.*

| role | budget assigned | fit-test estimate | decision | outcome | approx actuals |
|---|---|---|---|---|---|
| engineering-agents-budget-fields **[ILLUSTRATIVE variant]** | 80k/100k/110k | ~44k, same as the real estimate | execute | partial — hit 80% of budget (64k) after 5 of 8 files; checkpointed via skill `write-handoff-and-yield`, filed `Status: partial` completion report | ~64k |
| engineering-agents-budget-fields-resume **[ILLUSTRATIVE, fresh agent]** | 80k/100k/110k | ~15k (handoff + 3 remaining files) | execute | complete — finished `researcher.md`, `story-writer.md`, `validator.md` | ~18k |
| WS-3 worker-prompts-budget (lead) — integrates **[ILLUSTRATIVE step]** | n/a | n/a | n/a | reads both completion reports (never the diffs), confirms AC1-AC4 across all 8 files, marks the sub-task complete in its own report to the program | n/a |

The fresh agent's estimate (~15k) is well inside the smart zone precisely because the
handoff did the expensive part — digesting the two frozen contracts and the placement
rule — once, so the resume doesn't re-pay that cost. Total cost across the illustrative
fork (64k + 18k = 82k of *dispatched* budget, across two separate contexts) is higher
than the real single-agent run (40k), which is the expected trade: a fresh context
beats a degraded one pushing past the soft ceiling, not a cheaper one.
