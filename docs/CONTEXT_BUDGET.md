# Context budget & recursive decomposition

**Context is the only scarce resource.** Skailr already runs a plan-before-build hierarchy with frozen contracts and append-only channels. This doc covers the layer on top: every dispatched agent — orchestrator, lead, or worker — carries an explicit token budget, checks whether its task fits that budget before it starts, and decomposes into contract-bounded sub-agents when it doesn't. The two-tier program/workstream model was always capable of this; this doc names the discipline and shows where it's wired in.

Nothing here replaces plan-before-build, frozen contracts, or append-only channels. It extends them down to every delegation boundary, not just the program/workstream one.

---

## The workforce mental model

Think of Skailr as a company where every manager can hire a dream team:

- A **program lead** runs a project team (engineer, designer, data, QA…).
- Each of those roles can itself be a **lead** with its own team of specialists underneath, and those specialists can lead their own teams, to any depth needed.
- Unlike a real company, there is **no talent scarcity** — every lead assembles the best possible specialist team for the exact shape of the work, splits it cleanly, executes in parallel, and integrates.
- The **only scarce resource is context.** The entire org design exists to keep every individual contributor inside their smart zone.

The corollary that makes this work: **managers manage, workers work.** A lead never reads raw work product into its own context. If leads absorb their reports' transcripts, recursion just re-inflates the parent and the whole scheme collapses. In the pack this shows up concretely as leads (`program-architect`, engineering feature-queue leads via skill `run-feature-queue`, ticket-board leads via `run-ticket-board`) consuming only completion reports and channel messages — never a worker's diff, full file bodies, or tool-call transcript.

## Smart zone vs. dumb zone

The numeric defaults are frozen in `.claude/program/contracts/budget-templates.md` (single source of truth — every other file in the pack references these numbers, none restates a different value):

| Constant | Value |
|---|---|
| Target working budget | 80k tokens |
| Soft ceiling | 100k tokens |
| Hard ceiling | 110k tokens |
| Dumb-zone boundary | 125k tokens |
| Overhead multiplier (applied to input+output) | 1.5–2× |
| Decompose threshold | estimate > 65% of budget → decompose; ≤65% → execute as leaf |
| Minimum task size (spawn floor) | ~10k tokens (below → inline, don't spawn) |
| Spawn overhead per sub-agent | ~5–10k tokens |
| Max direct reports per lead | ≤7 |
| Completion report cap | ~1000 tokens |
| Checkpoint/handoff trigger | 80% of budget |

**Smart zone: ≤125k tokens, targeting well under that for headroom.** Below that boundary, an agent's instruction-following and judgment stay reliable. **Dumb zone: >125k tokens** — quality degrades measurably and cost climbs: mistakes increase, instruction-following weakens, returns diminish. The fix isn't "try harder to be concise" — it's structural: give every agent a budget it's expected to stay inside, and a mechanical trigger (the fit test) that forces decomposition before an agent ever gets close to the dumb zone.

The gap between the 110k hard ceiling and the 125k dumb-zone boundary — 15k tokens — is deliberate headroom for estimation error. Agents self-estimate without a tokenizer; the multiplier and the threshold are the only guardrails, so the plan never targets the edge of the cliff.

## Two-tier, generalized to recursive N-tier

Skailr's existing structure — program → workstream → feature → ticket — is already nested delegation. What this enhancement adds is the explicit rule: **any lead can decompose to any depth**, not just at the program/workstream seam. A workstream lead whose fit test fails becomes a lead of sub-agents; a ticket worker whose fit test fails can itself decompose further. Depth is unbounded in principle, bounded in practice by the fit test itself — a task keeps splitting only until every leaf passes.

**No new runtime was built for this.** The pack has no spawner, no orchestration engine, no daemon — recursion is realized entirely through the existing Task-nesting Claude Code / Cursor already provide (a Task dispatching a Task dispatching a Task). `.claude/commands/build-program.md` Phase B states the mandatory fit-test-before-dispatch step and the decomposition rules (contract-seam splits, MECE, single-writer, ≤7 direct reports, ~10k minimum task size) at the point where a workstream is handed to its team lead — and the same rules apply again wherever that lead, or any sub-agent under it, decomposes further. Skill `run-feature-queue` documents the same disciplines (integration ownership, single-writer enforcement, 80% escalation, budget-ledger append) at the feature-queue tier, and `run-ticket-board` at the ticket tier. It's the same mechanism, applied recursively — not a special case per tier.

---

## The 9 core principles, as actually implemented

### 1. Context Budget Discipline

Every agent is dispatched with an explicit token budget, echoed back in its completion report. The numbers (target 80k / soft ceiling 100k / hard ceiling 110k) live once in `.claude/program/contracts/budget-templates.md` and are referenced, not restated, everywhere else. Concretely: the dispatch packet's **Token budget** field (`.claude/program/schemas/dispatch-packet.template.md`) carries target/soft/hard per task; the completion report's **Budget actuals** field (`.claude/program/schemas/completion-report.template.md`) reports estimate vs. approximate consumption. Every role file states its budget obligation in a short, shared block — see the `### Budget` section in `.claude/agents/engineering/backend-engineer.md` and `.claude/agents/program/program-architect.md`: "Run the startup fit test (skill `fit-test`) before touching any file. Do not proceed past your budget's soft ceiling without checkpointing — skill `write-handoff-and-yield`."

### 2. The Fit Test

Every dispatched agent — lead or worker — runs skill `fit-test` (`.claude/skills/fit-test/SKILL.md`) before doing any real work: estimate = input context + expected output + iteration overhead, apply a 1.5–2× multiplier, and compare to budget — **>65% of budget → decompose, ≤65% → execute as leaf.** This is invoked at the startup of every dispatched agent per the `### Budget` block WS-3 added to every role, and it is also called out as a mandatory pre-dispatch step by the orchestrator itself: `.claude/commands/build-program.md` Phase B, "**Fit-test before dispatch (mandatory)**," runs the same procedure before dispatching each workstream and before any lead further decomposes. The skill file also carries practical, tooling-free heuristics (rough tokens-per-file-size, tokens-per-output-size, and when to lean toward 1.5× vs. 2×) so agents can apply the estimate by eye.

### 3. Recursive Decomposition (N-tier, not two-tier)

An agent whose fit test fails becomes a lead: it splits along contract seams, keeps splits MECE, and dispatches sub-agents that run their own fit tests. `.claude/skills/fit-test/SKILL.md`'s "Decomposing" section states this signature directly: "Split along contract seams, MECE, single-writer per file, ≤7 direct reports, ~10k min per sub-task… Each sub-task gets its own dispatch packet and its own fit test." `.claude/commands/build-program.md` Phase B restates the same rules at the point of workstream dispatch. Frozen contracts extend to every delegation boundary via the dispatch packet's **Frozen contract(s)** field — a sub-sub-agent works correctly knowing only its own packet, never its grandparent's context.

### 4. Minimum Task Size (anti-over-decomposition)

Spawning costs real overhead — dispatch packet + completion report + parent bookkeeping ≈ 5–10k tokens per spawn. The numeric guard (don't spawn under ~10k tokens; do it inline) and the ≤7-direct-reports ceiling both live in the `budget-templates` contract and are restated in `.claude/skills/fit-test/SKILL.md`'s numeric-defaults table and Decomposing section, and again in `.claude/commands/build-program.md` Phase B's "Decomposition rules" paragraph. If a proposed split would produce more than ~7 direct reports for one lead, that's a signal the split is along the wrong seam.

### 5. Lead Context Hygiene

A lead spends its context only on the task graph, contracts, dispatch packets, completion reports, and integration/verification of declared artifacts — never on raw diffs, full file contents, worker transcripts, or tool-call logs. Skill `run-feature-queue` states this as a rule for the engineering feature-queue lead: "**Integration ownership.** … Never raw-ingest a worker's diff, full file bodies, or transcript to decide next steps." `.claude/commands/build-program.md`'s "Budget discipline for integration + verification" section states the same for the program orchestrator itself: "You never ingest raw diffs, transcripts, or full work product from a workstream directly into your own context: dispatch `integration-verifier` / `program-validator`… and consume back only their findings plus each team's completion report."

### 6. Dispatch Packet

`.claude/program/schemas/dispatch-packet.template.md` is the only context a sub-agent receives: exactly 8 fields — Goal, Acceptance criteria, Frozen contract(s), File allowlist, Token budget, Forbidden scope, Report format, Channel path. The template states directly: "No conversation history, no parent transcript. Exactly these 8 fields." The `budget-templates` contract freezes these field names as the shape every dispatching command/skill must produce.

### 7. Completion Report

`.claude/program/schemas/completion-report.template.md` is the only thing a parent receives back: exactly 6 fields — Status, Artifacts, Contract conformance, Deviations, Open risks, Budget actuals — hard-capped at ~1000 tokens, a cap stated in the template itself. Existing per-role reports weren't replaced; they gained a **Budget actuals** line. See the ticket-mode and whole-slice-mode report templates in `.claude/agents/engineering/backend-engineer.md`'s Output formatting section, both ending in a `## Budget actuals` field, and `program-architect.md`'s "Report additionally states Budget actuals: estimated vs approximately consumed."

### 8. Escalation & Fresh-Context Handoff

Every worker monitors its own consumption. At 80% of budget it stops taking on new subtask work, checkpoints state to markdown, and files a partial completion report; the parent re-dispatches the remainder as a fresh agent seeded by that checkpoint. This reuses the pack's existing yield/handoff machinery rather than adding a parallel mechanism: skill `write-handoff-and-yield` lists "trigger 4" — "consumed roughly 80% of your assigned token budget… fires regardless of tool-round count" — applicable to any dispatched worker or lead, not just the three named build roles. `.claude/program/schemas/handoff.template.md` carries an additive **Budget checkpoint (80%)** section (progress / decisions / remaining plan / gotchas), explicitly paired with a `Status: partial` completion report rather than a bare `YIELD:` note. The rationale is stated verbatim in the skill: "A fresh agent starting from a good checkpoint beats a degraded agent pushing through the dumb zone (>125k tokens); that trade is why this trigger exists." Skill `run-feature-queue`'s "80% budget escalation" bullet wires the same trigger into the feature-queue lead's re-dispatch behavior.

### 9. Budget Ledger

`.claude/program/schemas/budget-ledger.template.md` defines an append-only, one-line-per-agent ledger: `role | budget assigned | fit-test estimate | decision (execute|decompose) | outcome | approx actuals`. It's sibling to `model-usage.md`, not folded into `skailr.ledger/v1` — deliberately kept separate so program-state schema stays clean. Location: `.claude/program/budget-ledger.md` for program runs, `$ARTIFACT_ROOT/budget-ledger.md` for feature runs. Skill `fit-test` step 4 states "Record `estimate + decision` as a row in the budget ledger" immediately after every fit test; skill `run-feature-queue`'s "Budget ledger" bullet states the same append point for the feature-queue lead. The ledger is what makes estimation heuristics tunable over time and makes dumb-zone incursions auditable after the fact.

---

## The 7 anti-patterns

1. **Pushing through** — continuing work past the soft ceiling instead of checkpointing and handing off. Countered by the mandatory 80% checkpoint/handoff trigger (`write-handoff-and-yield` trigger 4): a worker that keeps going past 80% of budget is non-conformant, not just unwise.
2. **Manager doing IC work** — a lead reading or writing work product directly instead of dispatching it. Countered by lead context hygiene (`run-feature-queue`'s integration-ownership rule, `build-program.md`'s integration-budget-discipline section): leads consume completion reports and verifier/validator findings, never raw diffs or transcripts.
3. **Context smuggling** — dispatch packets that include parent history "just in case." Countered structurally: the dispatch-packet template states "No conversation history, no parent transcript" and enumerates exactly 8 fields — there is no field to smuggle history into.
4. **Report bloat** — completion reports containing diffs or transcripts. Countered by the ~1000-token cap stated in `completion-report.template.md` itself, and by role output-formatting rules like backend-engineer's "Never paste report/story/spec bodies into the Task result."
5. **Org-chart inflation** — decomposing tasks below the minimum task size. Countered by the ~10k-token spawn floor and ≤7-direct-reports guard in `budget-templates` / `fit-test/SKILL.md`: below ~10k, do the work inline — spawn overhead (5–10k) eats the gain.
6. **Sibling ping-pong** — sub-agents coordinating with each other directly instead of through parent-owned contracts and integration. Countered by the existing channel discipline `build-program.md` already enforces: an agent posts a typed message and ends its turn; "you are the router that delivers the answer and resumes the blocked agent" — siblings never resolve conflicts peer-to-peer, the parent (or the parent's team lead) does.
7. **Shared-writer conflicts** — two agents with write access to the same file. Countered by the single-writer rule stated at every decomposition boundary (fit-test's Decomposing section, `run-feature-queue`'s "Single-writer enforcement" bullet) and checked mechanically by `check-ownership.mjs`, which `build-program.md` runs as a boundary check after every concurrency group.

---

## Migration notes

Existing two-tier programs adopt this with **zero required action.** The defaults preserve current single-context behavior for any task that already fits in one smart-zone context:

- A task whose fit-test estimate is ≤65% of budget runs exactly as it does today — as a single leaf agent, no decomposition. Nothing about how it plans, builds, or reports changes shape.
- The only additions for a fitting task are two appended lines: one fit-test entry (estimate + "execute" decision) and one budget-ledger row. Everything else — the dispatch packet's other 7 fields, the completion report's other 5 fields, channel discipline, contract freezing — was already there.
- No existing invariant changes shape. Plan-before-build still runs before any code is written. Frozen contracts still freeze at plan approval and change only through the program-architect + human-approval path. Append-only markdown channels are still the only cross-agent coordination surface. This enhancement extends the delegation boundary from "program/workstream only" to "every dispatch," using the same contract and channel mechanisms already in place — it does not introduce a second, parallel coordination system.
- Only when a task's fit-test estimate exceeds 65% of its budget does new behavior appear: the agent decomposes instead of executing, following the same contract-seam / MECE / single-writer / ≤7-reports rules that already govern program/workstream decomposition, now available at any depth.

## Worked example

The artifacts live in `examples/recursive-decomposition/`: `dispatch-packet-example.md`,
`completion-report-example.md`, `handoff-example.md`, and `budget-ledger-excerpt.md`.
They aren't a hypothetical feature — they're pulled from this program's own execution
(`context-budget-recursive-decomposition`, recorded live in
`.claude/program/budget-ledger.md`), with exactly one counterfactual extension, clearly
labeled, to show a beat the real run never triggered.

**Why the top level never runs as one leaf.** `budget-ledger-excerpt.md` §1 estimates
what dispatching the entire program as a single context would cost: ~280k tokens naive
(plan + build + verify + doc across four workstreams) against an 80k target — about
3.5x over, nowhere near the >65%-of-80k (>52k) decompose threshold, let alone
executable. That row is constructed (no agent ever actually attempts this), included
only to show the arithmetic behind going straight to a workstream split. The real
step that produces the split is program-architect's Job 2 decomposition — ~35k
estimate, 44% of budget, executes as a leaf, and *produces* four workstream dispatches
rather than doing their work itself.

**Why WS-1 stayed a leaf and WS-2/WS-3 didn't.** §2 shows the real fit-test estimates:
WS-1 (~35-40k, ≤52k) passes and executes as a single leaf. WS-2 (~70-90k) and WS-3
(~150-200k naive across 40 role files) both exceed 52k and decompose. WS-3's is the
chain this example follows down another tier, because it's the one that produced
sub-sub-agents — a real 3rd-tier dispatch (program → WS-3 → sub-agent).

**Why exactly 7 direct reports.** §3 shows WS-3's decomposition: one sub-agent per team
subdirectory (content, engineering, legal, finance, design, marketing,
pm/program/portfolio/experts) — 7 sub-agents, landing exactly on the ≤7-direct-reports
ceiling from `budget-templates.md`. Every one of them fit-tests well under 65% of 80k
and executes as a leaf; the largest, `engineering-agents-budget-fields` (8 files under
`.claude/agents/engineering/`, ~44k estimate), finishes at ~40k — 50% of budget.
`dispatch-packet-example.md` and `completion-report-example.md` are that sub-agent's
real, full-shaped artifacts: the packet's exact 8 fields as WS-3 sent them, and the
report's exact 6 fields as WS-3 received them back — WS-3 never reads the 8 edited
role files directly, only this ~1000-token report.

**Why 80% specifically, and what a checkpoint looks like.** The trigger is a live
self-assessment an agent makes while it still has work left, not a retrospective ratio
of a finished row's approx actuals to its budget — and no dispatch in the real run
recorded firing it: every real row's fit-test decision and Status stayed `complete`
without a checkpoint. So §4 of the ledger excerpt and all of `handoff-example.md` are marked
**[ILLUSTRATIVE]** and say so in-file: they ask what would have happened if
`engineering-agents-budget-fields`'s task had run ~1.6x longer and crossed 64k tokens
(80% of its 80k budget) after 5 of 8 files. At that point the worker stops taking on
new file edits, writes `handoff-example.md` (Done: 5 files, Not done: 3 files,
Decisions, Gotchas) per `handoff.template.md`'s additive **Budget checkpoint (80%)**
section, and files a `Status: partial` completion report instead of pushing on. WS-3
re-dispatches the remaining 3 files as a fresh agent seeded by that handoff — its
estimate is only ~15k, because the handoff already paid the cost of digesting the two
frozen contracts and the placement rule, so the resume doesn't re-read them. The
80%-not-100% threshold is the point: it stops the worker with 20% of its soft-ceiling
headroom still in hand, enough to checkpoint cleanly, rather than waiting until it's
already crowding the 100k soft ceiling or the 110k hard ceiling with no slack left to
write a good handoff. The illustrative fork costs more in aggregate dispatched budget
than the real single-pass run (64k + 18k = 82k vs. the real 40k) — expected, since a
fresh context finishing cleanly beats a degraded one pushing through the dumb zone,
not a cheaper one.
