# YOLO mode

**Tell Claude Code what you want built. The agent team one-shots it without stopping for your approval.** Uncertainties become logged assumptions instead of questions; every mechanical gate still runs.

| Scope | Command | What it one-shots | Business equivalent |
| ----- | ------- | ----------------- | ------------------- |
| **One feature** | `/yolo` | research → story → spec → build → verify → validate → docs | **Feature delivery without approval gates** |
| **Whole app / program** | `/yolo-program` | discover → plan → freeze contracts → build → integrate → validate → docs | **Program delivery without approval gates** (founder/autonomous mode) |

```
/yolo Users can invite a teammate by email and the invitee joins with a single click
```

```
/yolo-program Billing SaaS: orgs, invoices, email reminders 3 days before due,
customer portal to pay, admin dashboard. Prefer TypeScript.
```

That's the entire interaction until the final report. **Important:** `/yolo` will not decompose a whole product into workstreams — that's `/yolo-program`.

Use YOLO when you want speed over gates. Prefer the gated commands when requirements are fuzzy or a wrong assumption is expensive (compliance, billing, irreversible migrations). On an **unfamiliar existing codebase**, run [`/map-repo`](MAP_REPO.md) first so research and ownership have a durable baseline.

## Before you run

Same prerequisites as the [README](../README.md#install-30-seconds): Claude Code + skailr installed, `claude` started in the project. Prefer a clean working tree (or commit WIP first). Feature YOLO uses `feature/<slug>`; program YOLO uses `program/<slug>`. If `.claude/repo/orientation.md` exists, both read it before inventing orientation.

YOLO respects the active **model routing** profile and escalate-on-retry ([MODEL_ROUTING.md](MODEL_ROUTING.md)), and follows skill `consult-or-mint` for domain depth: consult existing experts early, evaluate auto-mint after research/brief evidence, carry matched slugs into co-author and soft-gate. An empty roster is normal and never narrated. Explicit mint/curate: [`/mint-expert`](experts.md).

## What runs

<details>
<summary><strong>Feature YOLO</strong> — <code>/yolo</code> phase table + artifacts</summary>

| Phase | Agent(s) | Human gate? |
| ----- | -------- | ----------- |
| Research | `researcher` | No |
| Story | `story-writer` | **Skipped** — open questions become explicit assumptions |
| Spec | `architect` (spec + ticket board) | **Skipped** — auto-approved after ownership / AC / board checks |
| Build | Frontier tickets → role workers (skill `run-ticket-board`; classic BE∥FE if no board) | No |
| Verify | `e2e-verifier` | No |
| Validate | `validator` | No |
| Docs | `program-documenter` | No |

Artifacts: `.claude/tmp/` (`request.md`, `research.md`, `story.md`, `spec.md`, `board.md`, `tickets/`, `mode.md` = `yolo`, `progress.md`, reports, channels).

Gated alternative: `/ship-feature` → `/continue-feature` → `/build-feature`.

</details>

<details>
<summary><strong>Program YOLO</strong> — <code>/yolo-program</code> phase table + artifacts</summary>

| Phase | What runs | Human gate? |
| ----- | --------- | ----------- |
| Discovery | `program-architect` writes `brief.md` with assumptions (no Q&A loop) | **Skipped** |
| Plan | Decomposition, ownership, contracts, DAG | **Skipped** — auto-approve + freeze |
| Foundation | Shared kernel build + freeze | No |
| Workstreams | Parallel teams; eng runs skill `run-feature-queue` (MECE features, each with feature-YOLO + ticket board under `workstreams/<ws>/features/<slug>/`) | Mid-build `@human` / contract-change **auto-decided** |
| Integration | `integration-verifier` | No |
| Validate | `program-validator` | No |
| Docs | `program-documenter` | No |

Artifacts: `.claude/program/` (`request.md`, `brief.md`, `plan.md` with Features tables, `mode.md` = `yolo`, `contracts/`, `ledger.md` with per-feature cursors, `ownership.json`, channels, `workstreams/<ws>/features/<slug>/`). When the ledger reaches `complete`, skill `archive-program-state` moves live runtime to `.claude/program/archive/<ts>-<slug>/` before worktree cleanup. A **new** initiative also archives prior state (`--force` if incomplete); an incomplete run is never archived on resume.

Gated alternative: `/discover` → `/plan-program` → `/build-program`.

</details>

## Resume after usage limits (or any mid-session death)

Claude Code can stop mid-run when usage resets. Skailr survives that via **disk checkpoints**, not chat memory:

| Scope | Cursor on disk | Resume with |
| ----- | -------------- | ----------- |
| Feature | `$ARTIFACT_ROOT/progress.md` (standalone: `.claude/tmp/`; nested: `workstreams/<ws>/features/<slug>/`) | `/continue-feature`, or re-run `/yolo` with **no new prompt** (or the same request text) |
| Program | `.claude/program/ledger.md` (+ contracts/channels + feature cursors) | `/continue-program`, or re-run `/yolo-program` with **no new prompt** (or the same request text) |

Rules:

- Orchestrators mark each phase complete in progress/ledger **before** starting the next agent.
- Resume picks the first incomplete phase; it never redoes finished work or resets channels.
- Do **not** change the request text or say "start over" unless you want a fresh archive.
- The final report still lists **Assumptions made** and the validator verdict.

**Mid-ticket handoffs:** build workers (`backend-engineer`, `frontend-engineer`, `data-engineer`) may yield *inside* a build Task when a process-step or tool-round budget hits — they write `$ARTIFACT_ROOT/handoff/<ticket-id>.md`, end with `YIELD: <path>`, and the orchestrator re-dispatches the same role in a fresh Task with that handoff (or `/continue-*` picks it up after a session death). Consecutive yields per ticket are capped at 5. Skills: `write-handoff-and-yield`, `run-ticket-board`, `run-feature-queue`.

## How ambiguity is handled

- Uncertainties become **Assumptions** with a one-line rationale — written into story/spec or brief/plan.
- Channel `@human` / `contract-change` messages don't halt the run: the orchestrator (and `program-architect` for contract seams) picks the smallest safe decision, logs `type: decision` on the channel, and continues.
- **Script gates still run** (ownership, contracts, channels). YOLO skips *human* stops only.
- Hard aborts still exist: empty request, unfixable ownership/DAG after retry, merge-hazard collisions, or a dirty tree that makes checks meaningless.

## After it finishes

Read the final report carefully — especially **Assumptions made** and the validator verdict. Those replace the gates you skipped. If the verdict is SHIP WITH FIXES or DO NOT SHIP, ask Claude to fix blocking findings and re-run verify/integrate/validate, or fall back to the gated path for a controlled retry.

### Scoped worktree cleanup

When a **program** finishes (`ledger` `status: complete`), orchestrators run skill `archive-program-state` first (`node scripts/skailr/archive-program.mjs`), then skill `cleanup-scoped-artifacts`: purge allowlisted build caches inside the **current agent worktree** (`.claude/worktrees/<id>/`), then retire that worktree. Feature runs skip archive-program and only run cleanup. Shared main-checkout `target/` / `node_modules` are **not** deleted. Incomplete `/continue-*` runs never archive or retire. Build workers also `purge` on their own `DONE:` (no-op outside an agent worktree); never on `YIELD:`.

## When not to YOLO

- You need exact acceptance criteria or product decisions confirmed before anyone codes
- Compliance, billing, security-sensitive, or irreversible data migrations
- You want the discovery interview and plan freeze as cheap checkpoints (use the gated paths in the README)

## Quick chooser

| You want… | Command | Business equivalent |
| --------- | ------- | ------------------- |
| Question only (plain chat) | Intake → expert advise or researcher ask — [INTAKE.md](INTAKE.md) | Q&A (no delivery) |
| Mint or curate a domain expert | `/mint-expert` — [experts.md](experts.md) | **Hiring a domain specialist** |
| Small fix, sync lineage | `/patch` | **Hotfix / small change request** |
| One feature, gated | `/ship-feature` → `/build-feature` | **Gated feature intake** → **approved-spec delivery** |
| One feature, one-shot | `/yolo` | **Feature delivery without approval gates** |
| Whole app, gated | `/discover` → `/plan-program` → `/build-program` | **VP discovery** → **planning + freeze** → **program delivery** |
| Whole app, one-shot | `/yolo-program` | **Program delivery without approval gates** |
| Resume (feature) | `/continue-feature` or `/yolo` with no new prompt | **Resume mid-feature** |
| Resume (program) | `/continue-program` or `/yolo-program` with no new prompt | **Resume mid-initiative** |

See also the [README Command reference](../README.md#command-reference).
