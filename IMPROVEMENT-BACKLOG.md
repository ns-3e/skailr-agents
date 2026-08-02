# skailr-agents — Improvement Backlog

Source: `docs/audits/2026-08-02-audit.md`. Sequenced in recommended order. Effort:
S (<½ day) / M (1–2 days) / L (multi-day). Every entry lists the invariant(s) it
touches; none violates one. Items requiring a human decision are at the bottom and are
**not** implemented.

---

## B-1 — `scripts/skailr/doctor.mjs` installation health check — **M, high impact, low risk**
**Problem.** Twelve validators exit 0 on missing inputs (audit F-12); "all green" is
indistinguishable from "nothing ran". No single command answers "is this install sane?"
**Change.** One read-only script, table output + `--json`, exit 1 on any FAIL:
registry ↔ disk agent parity; every skill referenced by any agent/command resolves;
mirror freshness (`remirror.sh` into a temp copy + diff, or a `--check` mode added to
remirror); protocol files present; `manifest.json` paths resolve *and* no unlisted
artifacts; version consistency (package.json = manifest = CHANGELOG latest cut);
installer arrays ⊇ manifest commands/rules; example fixtures pass their gates; expert
roster valid (delegates to `check-experts.mjs`). Wire into CI and README quick-start.
**Files.** New `scripts/skailr/doctor.mjs`; `package.json` (`check:doctor`);
`.github/workflows/ci.yml`; README §Health.
**Invariants.** 1 (script, no runtime), 8 (mechanical gate). Strengthens both.

## B-2 — Boilerplate byte-identity lint — **S, medium impact, no risk**
**Problem.** 11 canonical blocks duplicated across up to 40 agent files (audit Phase 3);
edit-one-forget-39 is the pack's most likely future drift. Extraction is off the table
(no include mechanism; generating `.claude/` would invert invariant 2).
**Change.** `scripts/skailr/check-blocks.mjs`: a manifest of canonical block → expected
first line + hash → list of carrying files; fails when copies diverge. Add to CI. Blocks:
tone, task-return, artifact-root, engineering-channels, short-channels, intair-optional,
handoff, cleanup-before-done, lead-preamble.
**Files.** New script; CI; CONTRIBUTING note.
**Invariants.** 2, 5 — preserved (source stays `.claude/`, cost stays zero at runtime).

## B-3 — `skailr status` run view — **M, high DX impact, low risk**
**Problem.** No single view of an in-flight run; operators tail three files.
**Change.** `scripts/skailr/status.mjs` composing existing readers: ledger phase/cursors
(`ledger-status`), active feature progress + board frontier (`feature-status`,
`ticket-status`), channel inbox with **message age** (drains since posted), blockers.
Read-only, `--json`.
**Files.** New script; README.
**Invariants.** 1, 6 — read-only over the same state files.

## B-4 — Port roster-fingerprint guard to `install.ps1` — **S, medium impact, medium risk (needs Windows verification)**
**Problem.** install.sh aborts FATAL if an upgrade touches `.claude/experts/`
(`install.sh:211-236`); install.ps1 has no equivalent (audit F-8c).
**Change.** Same pre/post hash over the experts tree via `Get-FileHash`, abort on delta.
Do not land without a PowerShell smoke run (why it isn't in the fixed series).
**Invariants.** 10 — this *is* invariant 10's enforcement on Windows.

## B-5 — Derive installer copy-lists from `manifest.json` — **M, high impact, medium risk**
**Problem.** `PACKAGED_RULES`/`PACKAGED_COMMANDS` hardcoded twice, disjoint from
remirror's generated set (audit F-15); F-8a (missing `mint-expert` on Windows) is this
class. CI checks a fixed subset only.
**Change.** Installers read `manifest.json` (bash: `python3`/`node` one-liner; ps1:
`ConvertFrom-Json`) and copy what it lists. CI asserts installed-set == manifest-set.
**Files.** `install.sh`, `install.ps1`, `ci.yml`.
**Invariants.** 2 — manifest is already remirror-generated from `.claude/`; this makes
install a pure function of it.

## B-6 — `$ARTIFACT_ROOT` for domain teams — **M, medium impact, medium risk**
**Problem.** All six domain teams hardcode `workstreams/<ws>/…` with no standalone root
(audit F-11) — the inverse of the engineering defect fixed as F-10.
**Change.** Add the same artifact-root block engineering carries (default
`.claude/program/workstreams/<ws>/` for teams, overridable via Task prompt) to the 24
domain agent files + leads' dispatch preambles; remirror.
**Invariants.** 3, 4, 5 — pure parameterization, no role merging.

## B-7 — `archive-program.mjs`: stop labeling no-ledger runs `complete=true` — **S, low impact, no risk**
**Problem.** Audit F-13: pre-freeze leftovers archived under a `complete=true` label
(deliberate safety net, misleading report).
**Change.** Report `leftovers (no ledger)`; keep the no-`--force` behavior (archives,
never deletes); document the rule in skill `archive-program-state`.
**Invariants.** 8.

## B-8 — Contract-version-consumed stamps — **M, high impact vs failure mode #4, low risk**
**Problem.** Audit Phase 2 rank 4: nothing records which contract *version* a
workstream built against; a mid-flight bump can leave a consumer on the stale interface
with only prose ("re-dispatch blast radius") to catch it.
**Change.** (a) `run-feature-queue` / team leads write `built-against: <contract-id>@<version>`
lines into the ws `report.md`; (b) `check-contracts.mjs --consumed <report-glob>` (or a
small new script) cross-checks stamps against the ledger's Contract versions table;
(c) `integration-verifier` §Checks requires the cross-check output pasted.
**Invariants.** 7 — strengthens frozen-contract enforcement mechanically.

## B-9 — Channel staleness signals — **S/M, medium impact, low risk**
**Problem.** Audit Phase 2 rank 5: `open` messages to never-dispatched addressees sit
forever; router has no staleness input.
**Change.** `validate-channels.mjs`: `--roster <registry>` warns on `to:` targets that
are neither a registered team/role, `@human`, `@all`, `@architect`, nor a plan
workstream; report age (message-count delta since posted) for every inbox item so
`route-channels` can escalate items older than N drains.
**Invariants.** 6 — board semantics unchanged, append-only untouched.

## B-10 — Ledger/channel scale hygiene — **M, medium impact, medium risk**
**Problem.** Audit Phase 2 rank 7: unbounded append-only growth of
`channels/program.md` and one cursor row per feature forever.
**Change.** Mechanical rotation in `route-channels`: when a channel exceeds N resolved
messages, move resolved threads to `channels/archive-<n>.md` (append-only preserved —
whole-thread moves only, never edits); ledger: collapse `done` cursor rows for
*completed workstreams* into a one-line rollup (`ws-x: 12 features complete`), detail
preserved in the ws report. Thresholds configurable in `settings.skailr.json`.
**Invariants.** 6 — flag: "append-only" is preserved per-file but threads *move* files;
see flagged item H-2 if that reads as a violation.

## B-11 — Verification evidence requirements — **S, high impact, low risk**
**Problem.** `e2e-verifier`/`validator`/`integration-verifier` demand judgments but not
evidence; a lazy pass is representable (audit Phase 2 ranks 4, 9).
**Change.** Three prompt edits + one mechanical hook: e2e-verifier must paste the
actual test-runner output block (fail if absent — validator checks for it);
validator Pass 1 becomes an AC-by-AC verdict table keyed to story ACs; validator Pass 3
runs `check-ownership.mjs --base <baseRef>` itself and pastes the result (out-of-scope
write scan becomes mechanical); integration-verifier pastes the B-8 cross-check.
**Invariants.** 4, 8.

## B-12 — Per-agent prompt tightening — **S per agent, low-medium impact, medium risk (behavioral precision)**
**Problem.** Prime-directive doubling in ~36 files (§2 ≡ §4, zero value); `researcher`
(234 lines) and `expert` (202) carry mode tables restatable at ~60% length.
**Change.** Delete the §2 duplicate sentence pack-wide (CI grep to keep it out);
rewrite researcher/expert mode tables. One agent per PR, behavior-diffed against the
worked examples. Sharper, not vaguer.
**Invariants.** 4, 5.

## B-13 — Intake brownfield tightening — **S, medium impact, low risk**
**Problem.** Stress cases: "add X" on an unmapped brownfield repo routes to `/yolo`,
which then researches cold; multi-feature asks phrased as one feature land in `/yolo`
rather than `/yolo-program`.
**Change.** Two sentences in `.claude/intake.md` (propagates to `CLAUDE.md` +
`intake.mdc` via remirror; mirror docs/INTAKE.md): (a) non-trivial repo + no
`.claude/repo/orientation.md` → offer `/map-repo` first, build on decline; (b) an ask
naming ≥3 separable capabilities → confirm `/yolo-program` before `/yolo`.
**Invariants.** none touched (routing prose only).

## B-14 — Benchmarks: adoptable mechanics — **informational**
Compared against Claude Code subagent guidance, Anthropic agent-design guidance, OpenAI
Swarm handoffs, CrewAI role patterns, GitHub agentic-workflow patterns:
- **Already ahead:** mechanical script gates (most frameworks use prose-only role
  constraints); append-only board vs chat-loop token burn; JIT disclosure vs CrewAI's
  always-loaded crews; state-file resume vs Swarm's in-memory-only handoffs.
- **Worth adopting:** (1) CI-enforced mirror/lint freshness (GitHub pattern) — landed in
  the fixed series; (2) structured-output contracts for verifier verdicts (Anthropic
  guidance) — B-11's verdict table is the markdown-native version; (3) health-check
  entrypoint (`doctor`) — B-1; (4) handoff payload schemas — already present
  (`handoff.template.md`), no action.
- **Explicitly rejected:** graph runtimes/daemons (invariant 1), auto-compaction of
  channels via LLM summarization inside gates (nondeterministic gate = invariant 8
  violation; B-10 does mechanical moves instead).

---

## Needs human decision (flagged, not implemented)

**H-1 — Expert artifacts under `$ARTIFACT_ROOT` vs a per-feature experts dir.** The
F-10c fix points expert co-author/verdict files at `$ARTIFACT_ROOT/expert-*.md`. An
alternative (`.claude/experts/consults/<feature>/…`) would keep all expert output under
the experts root (cleaner invariant-9 story) but breaks "feature artifacts live under
the feature root" and complicates cleanup. The implemented choice follows the consumers'
existing read paths (`architect.md:23`, `validator.md:21`). Reverse if you want the
experts-root story instead — blast radius: `expert.md`, 4 command files, `validator`,
`program-validator`.

**H-2 — Channel rotation (B-10) vs strict append-only reading of invariant 6.** Moving
resolved threads to an archive file preserves append-only *semantics* (no edits, no
deletions) but not append-only *files*. If invariant 6 is meant file-literally, B-10
should instead cap per-run channels by seeding `program-2.md` continuation files.
Decide before B-10.

**H-3 — Version cut policy.** F-2 was reconciled by bumping package.json to 1.7.0 and
cutting the CHANGELOG from the existing Unreleased content, matching the already-shipped
manifest 1.7.0. If 1.7.0 was reserved for something else, re-cut before publishing
(`PUBLISH.md` flow).

**H-4 — `check-experts.mjs` route-when band overlap.** The script's header documents
that expert-vs-expert and expert-vs-team band overlap is deliberately unchecked; intake
handles ambiguity by falling through (0 or 2+ matches → no expert route). Mechanical
overlap detection would need NL-band comparison — LLM-in-a-gate, which invariant 8
forbids. Recommend keeping the fall-through design and documenting it as the guard;
flagging because the audit prompt asked for overlap detection.
