---
name: run-feature-queue
description: Serial MECE feature queue for an engineering workstream — seed per-feature artifact roots, run the nested feature pipeline with ticket boards, update ledger cursors.
---

# Skill: run-feature-queue

## When to use

`/build-program` / `/yolo-program` / `/continue-program` Phase B for an **engineering** workstream that has a Features (MECE) table in `.claude/program/plan.md`. Non-engineering workstreams do not use this skill (their lead maps Features to domain units).

## Rules

- **Serial within the workstream.** Never run two features in the same WS concurrently (shared ownership globs).
- Respect plan.md Features `Depends-on` (feature IDs in the same WS only).
- Each feature uses `ARTIFACT_ROOT=.claude/program/workstreams/<ws>/features/<slug>`.
- After architect mint / during build: **must** follow skill `run-ticket-board` with `--root $ARTIFACT_ROOT`. Do not skip tickets when a board exists.
- Ticket `blocked_by` stays same-board only; cross-feature order is Features `Depends-on` only.
- Mode: gated (`/ship-feature` → `/build-feature` style with human gates) when program mode is not `yolo`; YOLO feature orchestration when `.claude/program/mode.md` is `yolo`.
- **Integration ownership.** This workstream lead owns integrating and verifying every dispatched agent's work — from each phase's completion report (`story.md`, `spec.md`, ticket reports, `e2e`/`validator` findings) plus script/gate output. Never raw-ingest a worker's diff, full file bodies, or transcript to decide next steps.
- **Single-writer enforcement.** Exactly one agent/ticket owns write access to any given file across this feature queue (ownership globs stay disjoint); parallel siblings — across features or within a feature's ticket board — never share a write target.
- **80% budget escalation.** When a dispatched worker's handoff carries `trigger: budget-80pct` with its **Budget checkpoint (80%)** section filled (per `.claude/program/schemas/handoff.template.md`) paired with a `Status: partial` completion report, the lead re-dispatches the remainder to a **fresh** agent seeded by that checkpoint/handoff, per skill `write-handoff-and-yield`. Do not invent a different resume mechanism.
- **Budget ledger.** Immediately after each dispatched agent's fit test, append one line to `.claude/program/budget-ledger.md` (program runs) or `$ARTIFACT_ROOT/budget-ledger.md` (feature runs) — `role | budget assigned | fit-test estimate | decision | outcome | approx actuals`, per `.claude/program/schemas/budget-ledger.template.md`.

## Procedure

1. **Read Features** for this workstream from `.claude/program/plan.md` (ID, Slug, Title, Goal, Depends-on, Maps-to brief).

2. **Seed missing trees.** For each feature slug, ensure:

```text
.claude/program/workstreams/<ws>/features/<slug>/
  request.md     # feature goal + pointers to WS contracts / brief item
  mode.md        # gated | yolo (from program mode.md)
  progress.md    # from feature-progress.template.md; request: under this root
```

Create `channels/` only if useful; otherwise use program `ws-<name>.md` for decide/`@human`.

3. **Pick next incomplete feature** from ledger Workstream cursors (or plan order):
   - Prefer `status: in_progress`
   - Else first `pending` whose `Depends-on` features are all `complete`
   - Artifact root: `.claude/program/workstreams/<ws>/features/<slug>`

```bash
node scripts/skailr/ledger-status.mjs --json
node scripts/skailr/feature-status.mjs --progress <ARTIFACT_ROOT>/progress.md --root <ARTIFACT_ROOT> --json
```

4. **Mark ledger** feature row `in_progress` and set Feature phase to the nested `next` phase.

5. **Dispatch nested feature pipeline** with every Task prepended `ARTIFACT_ROOT=<root>` + `route-models` preamble:

| Phase | Action |
|-------|--------|
| research | Task `researcher` → `$ARTIFACT_ROOT/research.md` |
| story | Task `story-writer` → `story.md` (YOLO: auto-approve; gated: surface Gate 1) |
| spec | Task `architect` → `spec.md` + mint `board.md` / `tickets/`; validate with `ticket-status.mjs validate --root $ARTIFACT_ROOT` |
| build | Skill `run-ticket-board` with `--root $ARTIFACT_ROOT` (claim → parallel Tasks → resolve). Ownership + channels + tests before complete |
| verify | Task `e2e-verifier` |
| validate | Task `validator` (expert gate if carry-forward `matched:` non-empty) |
| docs | Task `program-documenter` for this feature slice (or defer rollup to WS/program docs) |

On mid-build `YIELD:`: re-dispatch per `write-handoff-and-yield` under `$ARTIFACT_ROOT/handoff/`.

6. **On feature complete:** set ledger Feature phase + Status to `complete`. Delete leftover handoffs. Do not start the next feature until script gates for this feature pass.

7. **Repeat** until every feature row for this workstream is `complete`.

8. **WS rollup:** write `.claude/program/workstreams/<ws>/<ws>-report.md` summarizing features shipped, open risks, and contract producers delivered. For **every frozen contract this workstream consumed**, add one line per contract at the top of the report body, exactly:

   ```
   built-against: <contract-id>@<version>
   ```

   (the version read from the contract file at build time). Then run `node scripts/skailr/check-contracts.mjs --consumed` — a `stale consumer` error means a contract was bumped mid-flight and this workstream must be re-dispatched against the new version before the ledger marks it done. Mark the workstream done in the ledger Notes / phase tracking only after this passes.

## Resume

If Phase B resumes mid-queue, start at step 3 using `ledger-status` `nextFeature` / `artifactRoot`. Do not re-seed completed features. Do not archive incomplete feature roots.
