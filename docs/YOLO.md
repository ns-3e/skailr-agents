# YOLO mode

Give Claude Code what you want to build. The agent team one-shots it **without stopping for your approval**.

Two tiers:

| Scope | Command | What it one-shots | Business equivalent |
| ----- | ------- | ----------------- | ------------------- |
| **One feature** | `/yolo` | research → story → spec → build → verify → validate → docs | **Feature delivery without approval gates** |
| **Whole app / program** | `/yolo-program` | discover → plan → freeze contracts → build → integrate → validate → docs | **Program delivery without approval gates** (founder/autonomous mode) |

Use YOLO when you want speed over gates. Prefer gated commands when requirements are fuzzy or a wrong assumption is expensive (compliance, billing, irreversible migrations). On an **unfamiliar existing codebase**, run [`/map-repo`](MAP_REPO.md) first so research and ownership have a durable baseline. Full command → business mapping: [README Command reference](../README.md#command-reference).

## Prerequisites

Same as the [README Quick start](../README.md#quick-start): Claude Code installed, skailr-agents installed into the target repo (`./install.sh … --claude-only`), then `claude` started from that project.

Prefer a clean working tree (or commit WIP first). Feature YOLO uses `feature/<slug>`; program YOLO uses `program/<slug>`. If `.claude/repo/orientation.md` exists (from `/map-repo`), feature and program YOLO read it before inventing orientation.

YOLO still respects the active **model routing** profile (`.claude/model-routing.json`) and escalate-on-retry via skill `route-models` — see [MODEL_ROUTING.md](MODEL_ROUTING.md).

When a project has (or should grow) domain depth, YOLO and related builds follow skill `consult-or-mint`: consult existing experts early, then (after research or brief evidence) evaluate T3 auto-mint, re-consult, and carry matched slugs into co-author and soft-gate. An empty roster is normal and is **not** a reason to skip mint evaluation; do not narrate “no experts registry” to the user. Explicit mint/curate: [`/mint-expert`](experts.md). Guide: [experts.md](experts.md).

---

## Feature YOLO — `/yolo`

```
/yolo Users can invite a teammate by email and the invitee joins with a single click
```

That is the entire interaction until the final report.

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

Gated alternative: `/ship-feature` → `/continue-feature` → `/build-feature` (**gated feature intake** → **resume mid-feature** → **approved-spec delivery**).

---

## Program YOLO — `/yolo-program`

Use for a **whole app**, MVP, or multi-part initiative when you do not want discovery/plan approval loops.

```
/yolo-program Billing SaaS: orgs, invoices, email reminders 3 days before due,
customer portal to pay, admin dashboard. Prefer TypeScript.
```

| Phase | What runs | Human gate? |
| ----- | --------- | ----------- |
| Discovery | `program-architect` writes `brief.md` with assumptions (no Q&A loop) | **Skipped** |
| Plan | Decomposition, ownership, contracts, DAG | **Skipped** — auto-approve + freeze |
| Foundation | Shared kernel build + freeze | No |
| Workstreams | Parallel teams; eng WS runs skill `run-feature-queue` (MECE features, each with feature-YOLO + `run-ticket-board` under `workstreams/<ws>/features/<slug>/`) | Mid-build `@human` / contract-change **auto-decided** |
| Integration | `integration-verifier` | No |
| Validate | `program-validator` | No |
| Docs | `program-documenter` | No |

Artifacts: `.claude/program/` (`request.md`, `brief.md`, `plan.md` with Features tables, `mode.md` = `yolo`, `contracts/`, `ledger.md` with per-feature cursors, `ownership.json`, channels, `workstreams/<ws>/features/<slug>/`). When the ledger reaches `complete`, skill `archive-program-state` moves live runtime to `.claude/program/archive/<ts>-<slug>/` automatically (before worktree cleanup). A **new** initiative also archives prior state via the script (`--force` if incomplete); an incomplete run is never archived on resume.

Gated alternative: `/discover` → `/plan-program` → `/build-program` (**VP kickoff / discovery** → **program planning + interface freeze** → **program delivery**).

**Important:** `/yolo` will not decompose a whole product into workstreams. Use `/yolo-program` (or gated Path A) for that.

---

## Resume after usage limits (or any mid-session death)

Claude Code can stop mid-run when usage resets. Skailr survives that via **disk checkpoints** — not chat memory.

| Scope | Cursor on disk | Resume with |
| ----- | -------------- | ----------- |
| Feature | `$ARTIFACT_ROOT/progress.md` (standalone: `.claude/tmp/`; nested: `workstreams/<ws>/features/<slug>/`) | `/continue-feature`, or re-run `/yolo` with **no new prompt** (or the same request text); nested: `/continue-program` + `run-feature-queue` |
| Program | `.claude/program/ledger.md` (+ contracts/channels + feature cursors) | `/continue-program`, or re-run `/yolo-program` with **no new prompt** (or the same request text) |

Rules:

- Orchestrators mark each phase complete in progress/ledger **before** starting the next agent.
- Resume picks the first incomplete phase and does **not** redo finished work or reset channels.
- Do **not** change the request text or say “start over” unless you want a fresh archive.
- After limits reset: same project directory, then one of the resume commands above.
- When the run eventually finishes, the final report still lists **Assumptions made** and the validator verdict.

### Mid-ticket / mid-slice context handoff

Build workers (`backend-engineer`, `frontend-engineer`, `data-engineer`) may also yield **inside** a build Task when a process-step or tool-round budget hits. They write `$ARTIFACT_ROOT/handoff/<ticket-id>.md` (or legacy `<slice>.md`), end with `YIELD: <path>`, and the orchestrator immediately re-dispatches the same role in a **fresh Task** with that handoff — or `/continue-feature` / `/continue-program` picks it up after a session death. Skills: `write-handoff-and-yield`, `run-ticket-board`, `run-feature-queue`. Consecutive yields per ticket/slice are capped at 5.

---

## How ambiguity is handled (both)

- Uncertainties become **Assumptions** (or Assumed answers) with a one-line rationale — written into story/spec or brief/plan.
- Channel `@human` / `contract-change` messages do not halt the run: the orchestrator (and `program-architect` for contract seams) picks the smallest safe decision, logs `type: decision` on the channel, and continues.
- Script gates still run (ownership, contracts, channels). YOLO skips **human** stops only.
- Hard aborts still exist: empty request, unfixable ownership/DAG after retry, merge-hazard / boundary collisions, or a dirty tree that makes checks meaningless.

---

## After it finishes

Read the final report carefully — especially **Assumptions made** and the validator verdict. Those replace the gates you skipped.

If the verdict is SHIP WITH FIXES or DO NOT SHIP, ask Claude to fix blocking findings and re-run verify/integrate/validate, or fall back to the gated path for a controlled retry.

### Scoped worktree cleanup

When a **program** finishes (`ledger` `status: complete`), orchestrators follow skill `archive-program-state` first (`node scripts/skailr/archive-program.mjs`) to move live `.claude/program/` runtime into `archive/<ts>-<slug>/`, then skill `cleanup-scoped-artifacts`: purge allowlisted build caches inside the **current agent worktree** (`.claude/worktrees/<id>/`), then retire that worktree. Feature runs skip archive-program (feature tmp archive is separate) and only run cleanup. Shared main-checkout `target/` / `node_modules` are **not** deleted. Incomplete `/continue-*` runs never archive or retire. Build workers also `purge` on their own `DONE:` (no-op outside an agent worktree); they never purge on `YIELD:`.

---

## When not to YOLO

- You need exact acceptance criteria or product decisions confirmed before anyone codes
- Compliance, billing, security-sensitive, or irreversible data migrations
- You want the discovery interview and plan freeze as cheap checkpoints (use gated Path A / B in the README)

---

## Quick chooser

| You want… | Command | Business equivalent |
| --------- | ------- | ------------------- |
| Question only (plain chat) | Intake → expert advise (exact-one band) or researcher ask mode — [INTAKE.md](INTAKE.md) | Q&A (no delivery) |
| Mint or curate a domain expert | `/mint-expert` — [experts.md](experts.md) | **Hiring a domain specialist** |
| Small fix, sync lineage | `/patch` | **Hotfix / small change request** |
| One feature, gated | `/ship-feature` → `/build-feature` | **Gated feature intake** → **approved-spec delivery** |
| One feature, one-shot | `/yolo` | **Feature delivery without approval gates** |
| Whole app, gated | `/discover` → `/plan-program` → `/build-program` | **VP discovery** → **planning + freeze** → **program delivery** |
| Whole app, one-shot | `/yolo-program` | **Program delivery without approval gates** |
| Resume after usage limits (feature) | `/continue-feature` or `/yolo` with no new prompt | **Resume mid-feature** |
| Resume after usage limits (program) | `/continue-program` or `/yolo-program` with no new prompt | **Resume mid-initiative** |

See also the [README Command reference](../README.md#command-reference).
