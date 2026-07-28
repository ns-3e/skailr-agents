# YOLO mode

Give Claude Code what you want to build. The agent team one-shots it **without stopping for your approval**.

Two tiers:

| Scope | Command | What it one-shots |
| ----- | ------- | ----------------- |
| **One feature** | `/yolo` | research → story → spec → build → verify → validate → docs |
| **Whole app / program** | `/yolo-program` | discover → plan → freeze contracts → build → integrate → validate → docs |

Use YOLO when you want speed over gates. Prefer gated commands when requirements are fuzzy or a wrong assumption is expensive (compliance, billing, irreversible migrations).

## Prerequisites

Same as the [README Quick start](../README.md#quick-start): Claude Code installed, skailr-agents installed into the target repo (`./install.sh … --claude-only`), then `claude` started from that project.

Prefer a clean working tree (or commit WIP first). Feature YOLO uses `feature/<slug>`; program YOLO uses `program/<slug>`.

YOLO still respects the active **model routing** profile (`.claude/model-routing.json`) and escalate-on-retry via skill `route-models` — see [MODEL_ROUTING.md](MODEL_ROUTING.md).

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
| Spec | `architect` | **Skipped** — auto-approved after ownership / AC checks |
| Build | `backend-engineer` + `frontend-engineer` (parallel) | No |
| Verify | `e2e-verifier` | No |
| Validate | `validator` | No |
| Docs | `program-documenter` | No |

Artifacts: `.claude/tmp/` (`request.md`, `research.md`, `story.md`, `spec.md`, `mode.md` = `yolo`, `progress.md`, reports, channels).

Gated alternative: `/ship-feature` → `/continue-feature` → `/build-feature`.

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
| Workstreams | Parallel teams (engineering workstreams use feature-YOLO internally) | Mid-build `@human` / contract-change **auto-decided** |
| Integration | `integration-verifier` | No |
| Validate | `program-validator` | No |
| Docs | `program-documenter` | No |

Artifacts: `.claude/program/` (`request.md`, `brief.md`, `plan.md`, `mode.md` = `yolo`, `contracts/`, `ledger.md`, `ownership.json`, channels, workstream reports). A **new** initiative archives prior program state; an incomplete run is never archived on resume.

Gated alternative: `/discover` → `/plan-program` → `/build-program`.

**Important:** `/yolo` will not decompose a whole product into workstreams. Use `/yolo-program` (or gated Path A) for that.

---

## Resume after usage limits (or any mid-session death)

Claude Code can stop mid-run when usage resets. Skailr survives that via **disk checkpoints** — not chat memory.

| Scope | Cursor on disk | Resume with |
| ----- | -------------- | ----------- |
| Feature | `.claude/tmp/progress.md` (+ artifacts) | `/continue-feature`, or re-run `/yolo` with **no new prompt** (or the same request text) |
| Program | `.claude/program/ledger.md` (+ contracts/channels) | `/continue-program`, or re-run `/yolo-program` with **no new prompt** (or the same request text) |

Rules:

- Orchestrators mark each phase complete in progress/ledger **before** starting the next agent.
- Resume picks the first incomplete phase and does **not** redo finished work or reset channels.
- Do **not** change the request text or say “start over” unless you want a fresh archive.
- After limits reset: same project directory, then one of the resume commands above.
- When the run eventually finishes, the final report still lists **Assumptions made** and the validator verdict.

### Mid-slice context handoff

Build workers (`backend-engineer`, `frontend-engineer`, `data-engineer`) may also yield **inside** a build Task when a process-step or tool-round budget hits. They write `.claude/tmp/handoff/<slice>.md` (or `.claude/program/workstreams/<ws>/handoff/<slice>.md`), end with `YIELD: <path>`, and the orchestrator immediately re-dispatches the same role in a **fresh Task** with that handoff — or `/continue-feature` / `/continue-program` picks it up after a session death. Skill: `write-handoff-and-yield`. Consecutive yields per slice are capped at 5.

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

---

## When not to YOLO

- You need exact acceptance criteria or product decisions confirmed before anyone codes
- Compliance, billing, security-sensitive, or irreversible data migrations
- You want the discovery interview and plan freeze as cheap checkpoints (use gated Path A / B in the README)

---

## Quick chooser

| You want… | Command |
| --------- | ------- |
| One feature, gated | `/ship-feature` → `/build-feature` |
| One feature, one-shot | `/yolo` |
| Whole app, gated | `/discover` → `/plan-program` → `/build-program` |
| Whole app, one-shot | `/yolo-program` |
| Resume after usage limits (feature) | `/continue-feature` or `/yolo` with no new prompt |
| Resume after usage limits (program) | `/continue-program` or `/yolo-program` with no new prompt |
