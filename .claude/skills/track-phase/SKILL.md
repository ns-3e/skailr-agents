---
name: track-phase
description: Record phase/gate/contract/ticket state via scripts/skailr/db.mjs instead of hand-editing progress.md/ledger.md's tables, then render them so existing readers see no change. Use at every "Checkpoint: <phase> → <status>" instruction in yolo.md and build-program.md (and build-feature.md's gated pipeline). Not for patch.md — patch-report.md is a lightweight single-status file by design, deliberately cheaper than the Phases-table machinery this skill backs.
---

# Skill: track-phase

## Why this exists

`progress.md` and `ledger.md`'s Phases/Gates/Contract-versions tables are machine-checked
facts (status enums, timestamps) that used to be hand-maintained prose tables — every
orchestrator re-read and re-wrote the whole table on every transition, which is exactly the
kind of thing that's fragile to parse and easy to drift. `scripts/skailr/lib/db.mjs`
(SQLite, `node:sqlite`, no new dependency) is now the source of truth for these facts; this
skill is the one place that documents how to write to it. **Never hand-edit the Phases,
Gates, or Contract versions tables in progress.md/ledger.md directly** — write to the DB and
render, so the two can never disagree.

The rendered markdown is **byte-structurally identical** to the existing templates
(`.claude/program/schemas/ledger.template.md`, `feature-progress.template.md`) — resume
skills (`resume-from-ledger`, `resume-from-feature-progress`) and any agent that reads these
files as text need zero changes. Freeform sections (`## Notes`, `## Blockers`, `## Handoffs`,
`## Build slice`) are preserved verbatim from the existing file, never regenerated — those
stay hand-authored.

## Feature-level (progress.md) — `/yolo`, `/patch`, `/build-feature`, nested program features

At feature Setup, once (creates the row if absent, no-ops if it already exists):

```bash
node scripts/skailr/db.mjs feature init --id <feature-slug> [--program-id <program-slug>] [--workstream-id <ws-id>] --mode yolo|gated|patch --artifact-root <ARTIFACT_ROOT> [--request "<one-line ask>"]
```

At every "Checkpoint: `<phase>` → complete" instruction (research, story, spec, build,
verify, validate, docs — or whatever phases that command names):

```bash
node scripts/skailr/db.mjs feature set-phase --id <feature-slug> --phase <phase> --status complete [--notes "<one-line note, same as you'd have put in the table>"]
node scripts/skailr/db.mjs render progress --feature-id <feature-slug> --name "<feature title>" --out <ARTIFACT_ROOT>/progress.md
```

Use `--status in_progress` when entering a phase, `--status complete` when leaving it — same
semantics the old hand-written table used.

## Program-level (ledger.md) — `/yolo-program`, `/build-program`, `/continue-program`

At program Setup, once:

```bash
node scripts/skailr/db.mjs program init --id <program-slug> --status building
```

At every "Checkpoint: Phase `<X>` → done" instruction (A_kernel, B_workstreams,
C_integration, D_validation, E_documentation):

```bash
node scripts/skailr/db.mjs program set-phase --id <program-slug> --phase <phase> --status done --commit-sha <sha>
node scripts/skailr/db.mjs render ledger --program-id <program-slug> --name "<program name>" --out .claude/program/ledger.md
```

Gates (`brief_confirmed`, `plan_approved`, `contracts_frozen`) and contract freeze/bump
(`program-architect` only, per the contract change-control rule) use the matching `db.mjs`
subcommands — see `node scripts/skailr/db.mjs --help` for the full list (`contract freeze`,
`contract bump`, `ownership set`, `ticket add/claim/resolve`, `channel post`, `finding add` —
the last two have their own skills/agent-instructions already: `route-channels` and the
validator agents respectively).

## What NOT to move to the DB

Narrative content stays markdown, authored directly with Write/Edit as always:
`research.md`, `story.md`/`spec.md` prose, ticket `Goal`/`Acceptance criteria`/`Resolution`
bodies, `brief.md`, validation finding explanations. The DB owns status/facts; markdown owns
reasoning a human or model needs to read in full.
