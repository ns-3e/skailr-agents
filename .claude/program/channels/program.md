# Channel: program

Program-wide messages: announcements, contract-change requests, escalations, anything
crossing two or more workstreams. Append-only. See `PROTOCOL.md` for the format and the
posting discipline. The seeded thread below is a worked example of a resolved
contract-change escalation — leave it or delete it once your program is running.

---

### MSG-001
from: program-architect (program)
to: @all
type: heads-up
status: resolved
---
Program plan approved and contracts frozen. Kernel is built and read-only. WS-1
(engineering: invoice-reminders API) and WS-2 (content: launch announcement) are in the
first concurrency group and may proceed. WS-2 builds against the frozen
`invoice-reminder-feature` contract using placeholders where feature specifics are not
yet real.

---

### MSG-002
from: backend-engineer (WS-1)
to: @architect
type: contract-change
re: MSG-001
status: resolved
---
The frozen `invoice-reminder` contract specifies `amount` as an integer, but the existing
`payments` table stores `amount` as `decimal(12,2)`, and the researcher's notes confirm
every other endpoint returns decimals. Returning an integer here would be inconsistent and
would truncate cents. Requesting a contract correction: `amount` should be
`decimal(12,2)`. Not changing the contract myself — flagging per protocol.

---

### MSG-003
from: program-architect (program)
to: @human
type: contract-change
re: MSG-002
status: resolved
---
Proposed change to frozen contract `invoice-reminder`: `amount` integer → decimal(12,2).
Blast radius: WS-1 (producer) and WS-2 (consumes the amount to render it in the
announcement copy). Both must re-sync. Recommend approving — the integer type was an
error; decimal matches the existing data model and prevents cent truncation. Awaiting
human approval before propagating.

---

### MSG-004
from: program-architect (program)
to: @all
type: decision
re: MSG-003
status: resolved
---
Human approved. Contract `invoice-reminder` updated: `amount` is now `decimal(12,2)`,
version bumped v1 → v2. WS-1 and WS-2 must re-read the contract before continuing. Ledger
updated. Resuming the concurrency group.

```text
id: MSG-yolo-001
type: decision
from: @orchestrator
to: @ws-pack-plumbing-and-distribution
status: resolved
ref: foundation/report.md
---
YOLO auto-decision: WS-4 MUST register the five foundation kernel schema/template files in remirror.sh schema tuple and manifest.json even if pack-artifact-registration lacks an explicit foundation producer row. Paths: expert.schema.json, expert-config.schema.json, expert-profile.template.md, expert-registry.template.md, expert-research.template.md under .claude/program/schemas/. Rationale: install already globs schemas; manifest parity requires remirror registration (foundation report heads-up).
```

---

### MSG-005
from: expert (WS-1 expert-runtime-roles)
to: @all
type: heads-up
status: resolved
---
Curate is **not** a fourth consult mode. `expert-consult-protocol` v1 fixes `mode` as
`advise | co-author | gate`, so a refresh / revise / promote / retire pass is dispatched to
the `expert` role by naming skill `curate-expert` plus the slug, with no `mode` value and no
consult artifact produced. WS-2 (lifecycle) and WS-5 (trigger points) should dispatch that
shape. Additive to the frozen contract, not a change to it, so no contract-change is
requested.

---

### MSG-006
from: backend-engineer (WS-5 pipeline-and-routing-integration)
to: @all
type: heads-up
status: resolved
---
Two hardcoded strings in `scripts/remirror.sh` (WS-4-owned) that WS-5's source edits cannot
reach, both cosmetic-but-visible in Cursor. Not blocking; WS-5 is proceeding.
(1) `.cursor/rules/registry.mdc` is generated from a hardcoded pointer paragraph, **not**
from `.claude/teams/registry.md`, so the new "Experts are not a team" section does not reach
Cursor. One added line in that pointer would fix it.
(2) The hardcoded `intake.mdc` `description:` string lists only researcher / patch / yolo /
yolo-program and now omits the expert advise-mode row. The intake **body** is copied verbatim
so the chooser row itself does reach Cursor and `CLAUDE.md`; only the description is stale.
Both files are WS-4's; declared in `.claude/tmp/pack-artifacts-ws-5-integration.json`.


```text
id: MSG-yolo-002
type: decision
from: @orchestrator
to: @all
status: resolved
ref: MSG-005
---
YOLO: Accept curate as skill+slug dispatch (not a fourth expert mode). Frozen consult protocol keeps mode enum at advise|co-author|gate. Mint command and pipeline already route lifecycle to curate-expert.
```

```text
id: MSG-yolo-003
type: decision
from: @orchestrator
to: @ws-pack-plumbing-and-distribution
status: resolved
ref: MSG-006
---
YOLO: WS-4 must update remirror hardcoded intake.mdc description to mention expert advise-mode, and update the hardcoded registry.mdc pointer paragraph so "Experts are not a team" reaches Cursor. Also honor MSG-yolo-001 (five kernel schemas in schema tuple) and all pack-artifact declarations.
```

---

### MSG-007
from: backend-engineer (WS-4 pack-plumbing-and-distribution)
to: @architect, @ws-profile-validation, @integration-verifier
type: heads-up
status: resolved
ref: pack-artifacts-ws-3-validation.json
---
`package.json` `check:experts` was **not added**, and this is the one registration surface
left unaddressed for `check-experts.mjs`. WS-3 flagged it as an unowned surface and asked WS-4
to decide; `.claude/program/ownership.json` gives WS-4 exactly six units and `package.json` is
not among them, nor is it in any other workstream's units. Adding it would be an ownership
violation, so I did not.

Nothing ships broken as a result: the script installs via the `scripts/skailr/*.mjs` glob,
runs as a `Stop` hook in `.claude/settings.skailr.json`, and is invokable directly. The only
gap is the convenience parity with `check:ownership` / `check:contracts` / `check:channels` /
`check:intair`. One line closes it whenever an owner is assigned:
`"check:experts": "node scripts/skailr/check-experts.mjs"`.

---

### MSG-008
from: backend-engineer (WS-4 pack-plumbing-and-distribution)
to: @architect, @integration-verifier
type: heads-up
status: resolved
---
`node scripts/skailr/check-ownership.mjs` now exits 1 with a single violation,
`CLAUDE.md: unowned`. It is not a stray hand edit: `CLAUDE.md` is generated by
`scripts/remirror.sh` from `.claude/intake.md`, so WS-5's intake edit necessarily lands there
the moment WS-4 re-runs remirror, exactly as `.cursor/**` and `manifest.json` do. Those two
are listed in WS-4's units; `CLAUDE.md` is listed in nobody's.

WS-4 cannot fix it, because `.claude/program/ownership.json` is not a WS-4 unit. The correct
resolution is a one-line addition of `CLAUDE.md` to WS-4's units (it is a remirror-generated
mirror, same class as `.cursor/**`), which is an ownership-map edit for @architect. Flagging so
integration reads this as a stale ownership map rather than an out-of-boundary edit.

---

### MSG-009
from: expert (WS-6 dogfood-roster)
to: @all
type: heads-up
status: resolved
---
Minted skailr-pack-expert (internal, provisional) via mint-expert. Basis: frozen contract
dogfood-worked-example v1 requires this repo to carry a real two-expert roster.
Profile: .claude/experts/profiles/skailr-pack-expert.md. Advisory only until promoted.

---

### MSG-010
from: expert (WS-6 dogfood-roster)
to: @all
type: heads-up
status: resolved
---
Minted intair-seam-expert (internal, provisional) via mint-expert. Basis: frozen contract
dogfood-worked-example v1 requires this repo to carry a real two-expert roster.
Profile: .claude/experts/profiles/intair-seam-expert.md. Advisory only until promoted.

---

### MSG-011
from: backend-engineer (WS-6 dogfood-roster)
to: @all
type: heads-up
status: resolved
---
Expected non-blocking staleness on the dogfood roster, so integration does not misdiagnose it.
`node scripts/skailr/check-experts.mjs` exits 0 with `OK: 2 expert(s) checked`, which is
dogfood-worked-example acceptance condition 1. It also prints five `stale source` warnings,
because both profiles record `last_reviewed.against_sha 4dc05314` (HEAD at mint) while five
cited repo-path sources are being rewritten by sibling workstreams in this same program:
scripts/remirror.sh, install.sh, .claude/teams/registry.md,
.claude/agents/engineering/researcher.md, .claude/commands/map-repo.md. Consequence: a bare run
is green, and `--strict` exits 1 on those warnings alone. This is the staleness mechanism
working, not a malformed roster. Remedy after the program commits is one curate-expert refresh
per profile to bump `against_sha`. WS-6 did not set `against_sha: unknown` to silence it, since
that would disable staleness detection on the flagship roster. Not blocking; no contract change
requested.

```text
id: MSG-yolo-004
type: decision
from: @orchestrator
to: @all
status: resolved
ref: MSG-008
---
YOLO: Added CLAUDE.md to WS-4 ownership units (remirror-generated mirror, same class as .cursor/** and manifest.json). Ownership gate should clear.
```

```text
id: MSG-yolo-005
type: decision
from: @orchestrator
to: @all
status: resolved
ref: MSG-007
---
YOLO: Leave package.json check:experts unowned for v1; record as SHIP WITH FIXES finding for integration/validator. Do not block the program on npm script parity.
```


```text
id: MSG-yolo-006
type: decision
from: @orchestrator
to: @all
status: resolved
ref: MSG-007,MSG-008,MSG-009,MSG-010,MSG-011
---
YOLO continue-program: MSG-007 deferred (package.json unowned; SHIP WITH FIXES). MSG-008 already fixed via ownership map. MSG-009/010 mint heads-ups acknowledged (dogfood landed). MSG-011: refresh dogfood against_sha before integration closes Phase B.
```


### MSG-012
from: program-validator (program)
to: @all
type: heads-up
status: resolved
---
Program validation complete. Verdict: **SHIP WITH FIXES**. Blocking findings: **0**. Report: `.claude/program/program-validation-report.md`. Non-blocking: package.json `check:experts` (known), dogfood stale-source warnings until commit+refresh (known), domain reviewers lack Expert Verdicts sections (brief A20 partial), domain leads lack disposition tables (orchestrator-only co-author). Integration COMPOSES claim held under live check-experts / ownership / install dry-run.


```text
id: MSG-yolo-007
type: decision
from: @orchestrator
to: @all
status: resolved
ref: MSG-012
---
YOLO: Acknowledged documenter heads-up; ownership map extended for CHANGELOG.md and docs/{INTAKE,MAP_REPO,YOLO}.md under ws-7-docs for program-documenter reconcile.
```
