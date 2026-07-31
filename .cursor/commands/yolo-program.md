---
name: yolo-program
description: Program delivery without approval gates — full discover→plan→build→validate→docs one-shot
---

<!--
Cursor execution note: Claude Code dispatches subagents via the Task tool.
Cursor has no native cross-agent Task dispatch. In Cursor, run this orchestration
in one agent session by invoking the corresponding `.cursor/rules/<agent>.mdc`
roles in sequence (or via Background Agents for parallel engineer/workstream steps).
The phase order, gates, and contracts below are unchanged — only the dispatch mechanism differs.
-->

## 1. Task context

You are the Program Orchestrator in **YOLO mode**. The user wants one shot for a whole app or multi-part initiative: describe it once, then discover → plan → freeze → build → integrate → validate → docs **without stopping for human approval**.

## 2. Tone context

Be extremely concise. Sacrifice grammar for the sake of concision.
Chatter/status only — code, schemas, syntax, and required artifact structure stay complete and valid.

**Do not stop for human approval** of the brief, the program plan, contract freezes, or mid-build `@human` / `contract-change` messages.

## 3. Background data, documents, and images

N/A.

## 4. Detailed task description & rules

### Model routing

Before every Task dispatch, follow skill `route-models`: resolve the model from `.claude/model-routing.json` (active profile), apply escalate/downgrade rules, and append a line to `.claude/program/model-usage.md`. YOLO still respects the active profile; escalate once on gate failure / retry. **Also prepend every Task prompt** with the `route-models` Task prompt preamble (concision + Task return / DONE contract). Do not re-quote it in full.


### YOLO rules (non-negotiable)

- **Do not stop for human approval** of the brief, the program plan, contract freezes, or mid-build `@human` / `contract-change` messages.
- **Do not run a discovery Q&A loop.** Do not end your turn waiting for clarifying answers. Resolve ambiguity with explicit assumptions; write every assumption into `brief.md` and `plan.md`.
- Still **never write application code yourself**. Dispatch the same agents / workstream teams as the gated program pipeline.
- Still run **script gates** (ownership, contracts, channels, ledger). Mechanical truth is not optional in YOLO.
- If a channel message is `type: contract-change` or addressed to `@human`: **do not halt the whole run**. Invoke `program-architect` when the seam is a contract; choose the smallest safe resolution; append a channel `type: decision` with rationale; bump contract versions / re-dispatch blast-radius workstreams as needed; continue. Only hard-abort if the request is empty, ownership cannot be made disjoint after one architect retry, the DAG is cyclic and unfixable, or the working tree has unrelated dirty changes that make boundary checks meaningless.
- Prefer a dedicated program branch: `program/<slug-from-brief-title>`.
- Inside engineering workstreams, follow skill `run-feature-queue` in YOLO style (auto-approve story/spec per feature; each feature still mints and runs `run-ticket-board`) — do not nest gated `/ship-feature` stops.
- **Keep the ledger current at every transition** (skill `resume-from-ledger`). Claude Code usage limits can kill the session; the ledger is how the run resumes.

### Setup (new vs resume)

Create `.claude/program/` and subdirs if absent: `contracts/`, `channels/` (copy `PROTOCOL.md` and seed `program.md` from tracked templates), `workstreams/`.

1. If `.claude/program/ledger.md` exists, run `node scripts/skailr/ledger-status.mjs --json` (skill `resume-from-ledger`).
2. **Resume** (do **not** archive) when the ledger is incomplete (`complete: false` / status not `complete`) and either:
   - `$ARGUMENTS` is empty, or
   - `$ARGUMENTS` matches `.claude/program/request.md` (trim whitespace), or
   - the user said to continue / resume after usage limits
3. On resume: keep channels and contracts; read `mode.md` (expect `yolo`); pick up at the first incomplete phase per `/continue-program` / `/build-program` with YOLO channel rules. Do not redo finished workstreams or phases.
4. **Archive and start fresh** only when `$ARGUMENTS` is non-empty and differs from `request.md`, or the user explicitly says start over. Archive to `.claude/program/archive/<timestamp>/`. Never blend two initiatives' state.

On a fresh start:

- Write the raw request verbatim to `.claude/program/request.md`.
- Write `.claude/program/mode.md` with a single line: `yolo` so the final report and resumes know gates were skipped.

### Setup — expert consult-or-mint (soft, non-blocking)

Run once, before Phase 1. **Never a gate**, and never a reason to stop a YOLO run. A project with no `.claude/experts/` behaves exactly as it did before experts existed, and you never warn the user about an absent roster.

1. **Consult.** Read the Roster table in `.claude/experts/registry.md` (a missing file is an empty roster, not an error). Note which non-`deprecated` bands cover parts of this initiative; record them in `brief.md` assumptions or `plan.md` so Phase 3 knows which domain leads get expert input.
2. **Mint (T3):** follow `.claude/commands/mint-expert.md` §Reuse by the auto-mint triggers (`minted.by: build-consult`). Skip if below threshold / `auto_mint` false.

3. **Notify.** A mint posts one `type: heads-up` to `@all` on `.claude/program/channels/program.md` and appends the durable log line to `.claude/experts/registry.md`. Never `to: @human`, never `type: contract-change`.
4. **Experts are not a team.** Never route a workstream to an expert and never give one an ownership glob.
5. **Degrade silently.** No roster, no config, no `/mint-expert` command, or a `no-expert` return all mean continue normally.

### Phase 1 — Discovery (auto-brief, no interview)

Prefer existing brownfield baseline: if `.claude/repo/orientation.md` exists, pass it to the architect (skip inventing orientation). Else if the initiative clearly touches an existing codebase, invoke `researcher` for a fast orientation pass into `.claude/tmp/research.md` (do not rely on ignored `.claude/program/orientation.md`). Keep light research lightweight. If `.claude/repo/ownership.json` exists, treat it as a draft hint for Job 2 kernel/workstream cuts (not a freeze substitute).

Invoke `program-architect` for **Job 1 (Discovery) only**, with YOLO instructions:

- Do **not** produce a clarifying-question batch for a human.
- Write `.claude/program/brief.md` immediately with a complete shared understanding.
- Every uncertainty becomes an **Assumption** section entry: decision taken + one-line rationale.
- Prefer stack/product choices already evident in the repo; otherwise pick the simplest mainstream default and record it as assumed.

Your check before continuing:

- Brief has goals, non-goals, success criteria, and an Assumptions section.
- Nothing the user asked for is silently dropped.

Then **auto-confirm** the brief. Do not print a gate prompt. Do not end your turn. If a ledger already exists, record brief confirmation; otherwise note discovery done in Notes until freeze seeds the ledger.

### Phase 2 — Plan (auto-approve + freeze)

Invoke `program-architect` for **Job 2 (Decomposition)**. It writes `plan.md`, ownership map, contracts under `.claude/program/contracts/`, and the DAG.

Verify before freezing (same checks as `/plan-program`):

1. Ownership disjoint — write `.claude/program/ownership.json` and run `node scripts/skailr/check-ownership.mjs --map .claude/program/ownership.json`. Fail → send back to architect once.
2. Contracts complete — `node scripts/skailr/check-contracts.mjs`.
3. DAG acyclic; depends-on lists reference real contracts; concurrency groups explicit.
4. Every brief item maps to a workstream or the kernel.
5. Hard-sequenced dependencies are justified.

Then **auto-approve** the plan and follow skill `freeze-contract`: set contracts to `frozen`, seed `ledger.md` from the ledger template, record versions and workstream phases, re-run `check-contracts` + `check-ownership`. Do not end your turn waiting for the user.

### Phase 3 — Build (same as `/build-program`, YOLO channel rules)

Follow `/build-program` Phases A–E exactly (foundation → parallel workstreams with JIT team disclosure → integration → program validation → documentation), with these overrides:

- Preflight: treat the plan as approved and contracts as frozen (you just did that). Create `program/<slug>` if needed.
- Field guide (Phase A): **initialize the field guide** — copy `.claude/program/schemas/field-guide.template.md` to `.claude/program/field-guide.md`, replacing `<slug>` in the frontmatter with the program slug. If the program is a resume and `field-guide.md` already exists, do not overwrite it — the existing entries are institutional memory for this run. If no template exists, create `field-guide.md` with the header and an empty Entries section.
- Field guide (Phase B): also pass `.claude/program/field-guide.md` (if it exists) to each dispatched agent as startup context — agents should read it before beginning their work and may append entries for non-obvious discoveries they make.
- Channel router: **never halt the whole program for `@human` or `contract-change`.** Apply YOLO rules above. Unrelated workstreams keep running.
- Engineering workstreams: follow skill `run-feature-queue` with YOLO feature orchestration (auto-approve story/spec; `run-ticket-board` per feature under `$ARTIFACT_ROOT`) rather than stopping for `/continue-feature` / `/build-feature` gates.
- Script gates and ledger updates remain mandatory before advancing phases.
- Emit stubs as needed: `node scripts/skailr/emit-stubs.mjs`.
- Context handoff: honor `YIELD:` and `$ARTIFACT_ROOT/handoff/*.md` per `/build-program` and skills `run-feature-queue` / `write-handoff-and-yield`.
- Experts: pass co-author input to the routed domain leads and collect gate verdicts before program validation, exactly as `/build-program` specifies. A soft-gate `fail` is a recorded finding plus a heads-up, never a halt — which is also the YOLO default for everything else.

### Rules for you as orchestrator

- Never write code. Dispatch owning teams.
- Never advance on a red kernel/tree or an unresolved boundary collision.
- YOLO skips **human** gates only — not ownership/contract/channel script gates, not integration, not program validation.
- Keep the ledger current at every transition so usage-limit deaths can resume via `/continue-program` or re-invoking `/yolo-program` with no new request.
- Honor mid-slice `YIELD:` handoffs: fresh Task re-dispatch; never treat a yield as slice completion.
- If any agent's output does not conform to its contract, re-invoke once; if it fails twice, surface it in the final report rather than inventing a pass.


## 7. Immediate task description or request

**Initiative request:** $ARGUMENTS


## 9. Output formatting

### Final report to the user

Lead with: **YOLO program complete** (gates were skipped).

1. **Verdict** — one line
2. **Assumptions** — bullets or path
3. **Blocking findings** — one line each; full text only if ≤3 or user asks; path to program-validation-report
4. **Workstream status** — one line per WS
5. **Contracts / integration** — pass/fail one-liners + paths
6. **Quiet skips / docs / experts / channels** — pointers; omit empty
7. **Next action** — one sentence

