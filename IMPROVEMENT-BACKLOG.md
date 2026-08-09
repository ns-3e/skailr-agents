# skailr-agents — Improvement Backlog

Source: `docs/audits/2026-08-02-audit.md`. Sequenced in recommended order. Effort:
S (<½ day) / M (1–2 days) / L (multi-day). Every entry lists the invariant(s) it
touches; none violates one.

**Status (2026-08-09):** L-1..L-6 landed (benchmark-driven lean pass — see that
section below). L-7 is informational: this pass is not yet verified against a fresh
`bench/` campaign.

**Status (2026-08-02, third pass):**
DONE: B-1 (`doctor.mjs`, in CI; caught install.ps1 missing expert/expert-scout rules),
B-2 (`check-blocks.mjs`, in CI, now 6 blocks), B-3 (`status.mjs` + `ledger-status`
treats `done` as terminal), B-6 (`WS_ROOT` across 21 domain agents + `/build-program`
dispatch), B-7 (archive leftovers reporting), B-8 (built-against stamps), B-9 (inbox
age + addressee warnings + starvation-first drain), B-10 (`rotate-channels.mjs`, per
H-2), B-11 (verification evidence: pasted runner output, AC verdict table, mechanical
out-of-scope scan), B-13 (intake tie-breakers). H-1..H-4 all decided.

CLOSED — SUPERSEDED: B-5 (manifest-driven installers). doctor's installer-parity
check + CI now make array↔mirror drift impossible to miss (it caught two real
instances on its first runs); deriving arrays at install time would add a
python3/node dependency to otherwise dependency-free installers — fragility for no
remaining detection gain. Reopen only if the installers grow other reasons to parse
the manifest.

BLOCKED: B-4 (install.ps1 roster-fingerprint guard) — no PowerShell on this machine;
its own landing rule forbids shipping unverified. Top item once a pwsh env exists.

DEFERRED: B-12 (per-agent prompt tightening) — its own rule is one agent per PR,
behavior-diffed against the worked examples; batch-editing 36 prompts in an audit
pass is exactly the risk it warns about. The prime-directive §2/§4 doubling is the
first candidate when picked up.

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
tone, task-return, artifact-root, engineering-channels, short-channels,
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

---

## 2026-08-09 — Lean Skailr pass (benchmark-driven)

Source: `docs/BENCHMARKS.md`'s real (non-mock) Docker campaign data, which showed
Skailr losing to vanilla Claude Code on cost and wall-time on every task, and on
quality on two of three, driven by a fixed per-dispatch bookkeeping tax applied
regardless of task size (traced through `.claude/commands/patch.md` and `yolo.md`
and the skills they invoke — see the plan this pass executed for the full mechanism
trace). Landed in one pass, no items deferred.

## L-1 — De-tax `route-models` and `emit-telemetry` per dispatch — **S, high impact, low risk**
**Problem.** `route-models` re-read `model-routing.json` before every single Task
dispatch despite the file never changing mid-run. `emit-telemetry` wrapped every
dispatch in 2 Bash calls (span-start/span-end) at every command tier by default, for a
signal (`usage.by_source.subagent`) that was itself broken (L-6) — real campaigns showed
6-7+ dispatches per feature, so this was 12-14+ pure-overhead tool calls per run with no
offsetting benefit.
**Change.** `route-models`: read the routing file once at Setup, cache the role→model
map, re-consult only on escalate/downgrade. `emit-telemetry`: new `telemetry.scope`
config (`.claude/settings.skailr.json`) — `"program-only"` (new default) skips span
wrapping on `/patch` (`--tier patch`) and standalone `/yolo` (`--tier feature-yolo`);
`/yolo-program` and the other program/gated-pipeline commands (which omit `--tier`)
keep it on, since that's where an operator plausibly wants span-level visibility into a
long multi-workstream run. `scripts/skailr/emit-telemetry.mjs`'s `isEnabled()` gates on
tier + scope; legacy `telemetry.enabled: true/false` still wins if set explicitly.
**Files.** `.claude/skills/route-models/SKILL.md`, `.claude/skills/emit-telemetry/SKILL.md`,
`.claude/settings.skailr.json`, `scripts/skailr/emit-telemetry.mjs`, `patch.md`, `yolo.md`.
**Invariants.** None touched — purely a caching/scoping change to when existing
mechanisms fire, not what they enforce.

## L-2 — Guarded inline-fix carve-out for `/patch` — **M, highest measured impact, guarded risk**
**Problem.** `/patch`'s absolute "never write application code yourself" rule forced
even a one-line bug fix through a full subagent spawn — fresh context, re-explores the
repo, reports back — the likely explanation for the `patch-webhook` benchmark task's
3.4x tool-call ratio vs. vanilla Claude Code and a functional regression in one run.
`fit-test`'s own numeric defaults already state a spawn floor ("~10k tokens — below →
inline, don't spawn") that `patch.md` was silently overriding for the orchestrator
itself.
**Change.** New "Inline vs dispatch" decision in Phase 1: the orchestrator implements
the fix directly (Read/Edit, no Task) only when fit-test estimates below the spawn
floor **and** no touched path matches a sensitive-surface list (auth, security,
payment, billing, crypto, compliance, permission, rbac, secret, token, password,
session — `ownership.json` role tags preferred, keyword match as fallback) **and** the
fix stays within a single owner's paths. Otherwise, dispatch as before (unchanged
default). Either path logs which one was taken in `patch-report.md`; ownership/contract
gates run unchanged regardless. Scoped to `/patch` only — `/yolo`/`/yolo-program` keep
the rule unchanged (different risk profile at multi-ticket/multi-owner scale).
**Files.** `.claude/commands/patch.md`.
**Invariants.** Narrows (does not remove) the role-separation rule for the one tier
where its cost was empirically not paying for itself; explicitly guarded to preserve it
everywhere else.

## L-3 — Proportional verification/docs in `/yolo` — **M, high impact, guarded risk**
**Problem.** Phases 5 (`e2e-verifier`), 6 (`validator`), and 7 (`program-documenter`)
ran unconditionally on every feature regardless of ticket count or surface — a
single-ticket, non-sensitive feature paid the same 3 extra subagent dispatches as a
multi-workstream security feature.
**Change.** Phase 5/6 skip (with a logged reason) only when the board had exactly one
ticket, nothing matches the sensitive-surface list from L-2, and (for Phase 5
specifically) the change isn't e2e-covered/user-visible; any ownership/contract
failure, engineer-flagged risk, or sensitivity match forces the full path
unconditionally — this is a risk gate, not a downgrade. Phase 7 runs only when the diff
touches a documented public surface. Phase 4's ticket-board ceremony (claim/resolve) is
skipped for a single-ticket board — direct dispatch instead, since board coordination
only earns its keep at ≥2 parallel tickets.
**Files.** `.claude/commands/yolo.md`.
**Invariants.** None touched — script gates (ownership, channels) stay unconditional;
only the *subagent verification/docs* dispatches become risk-proportional.

## L-4 — `/patch`'s remaining unconditional overhead — **S, medium impact, low risk**
**Problem.** `consult-or-mint` and `program-documenter` ran unconditionally on every
patch even though patch explicitly commits to staying cheaper than `/yolo`.
**Change.** Both now gate on the sensitive-surface list from L-2 (consult) / a
documented-public-surface check (docs) instead of running every time.
**Files.** `.claude/commands/patch.md`.
**Invariants.** None.

## L-5 — Fixed `resultEvent` selection picking the FIRST `result` event, not the last — **S, high impact, low risk**
**Problem.** Found while investigating L-6: a single real (non-mock) `claude -p`
process (one `spawn()` call, never `--resume`-chained) emits **multiple**
`result`-shaped events over its own lifetime, not one. Verified on a real
`feature-api-keys` skailr-arm transcript (7 result events, one `spawn()` call): one
untagged interim result mid-stream (`"T-001 and T-003 dispatched in parallel..."`,
`is_error:false`) plus six tagged `origin:{"kind":"task-notification"}`, one per
background Task completing (e.g. `"T-003 (frontend console) complete."`),
`total_cost_usd` rising monotonically across all seven ($2.61 → $12.70). Neither the
untagged one nor the origin tag reliably marks "the true final result" — the untagged
one at line 614 was *not* final (1000+ more events followed it). The only reliable
signal is stream position: the truly last `result` event, confirmed by its own text
(`"**YOLO run complete**..."`) and by being the last line before the process exited.
Both `invokeClaude()` call sites used `events.find((e) => e.type === "result")`, which
returns the *first* match — an early interim status, not the run's outcome — silently
understating `cost_reported_usd` (the figure `docs/BENCHMARKS.md` treats as
authoritative) and every `usage.tokens` figure derived from it. Mock mode only ever
emits one, so this was invisible to the existing test suite.
**Change.** `events.findLast((e) => e.type === "result")` at both call sites in
`bench/src/claude.mjs` — the last event holds the correct cumulative total for the
whole session (main + every Task-dispatched subagent; Claude Code's own accounting
already rolls subagent spend into the running total shown at each interim result).
**Files.** `bench/src/claude.mjs`.
**Invariants.** N/A (bench harness, not the pack).
**Note.** This means historical `cost_reported_usd`/`usage.tokens` figures already
published in `docs/BENCHMARKS.md` for real (non-mock) skailr-arm runs with more than
one `result` event may be understated. Not retroactively corrected here — no
fabricated numbers; real re-verification needs a fresh `bench/docker-run.sh` campaign.

## L-6 — `usage.by_source.subagent` always zero: real limitation, not fixed further — **informational**
**Problem.** `docs/BENCHMARKS.md` flagged `usage.by_source.subagent` reading all zeros
despite real subagent activity in the transcript, framing it as an extraction bug to
fix.
**Investigation.** Tried the obvious fix — sum each `assistant` event's own
`message.usage`, bucketed main vs. subagent by `parent_tool_use_id`/`subagent_type` —
and rejected it: verified against a real transcript that per-turn `usage` reflects
cumulative context size *at that turn* (mostly `cache_read`), not an incremental
per-turn delta, so summing across many turns overcounts by ~26x. No sound per-source
split is derivable from stream-json alone; only a single session-level total is
available (see L-5), and it correctly can't be attributed to main vs. subagent without
a different data source (e.g. real per-agent OTel spans, if Claude Code ever exports
them).
**Change.** Documented the limitation precisely in `bench/src/telemetry.mjs`'s
top-of-file comment so it reads as an honest, investigated data boundary rather than an
open bug to keep chasing. No code change beyond the comment (L-5 is the real fix that
was in reach).
**Files.** `bench/src/telemetry.mjs`.
**Invariants.** N/A.

## L-7 — Benchmarks: what this pass predicts vs. what needs a real re-run — **informational**
This pass is not verified against a fresh bench campaign (no re-run was executed as
part of implementation — see `docs/BENCHMARKS.md`'s forward-note). Expected direction,
not a claimed result: fewer tool calls per run (route-models/telemetry de-tax removes a
fixed multiple of the dispatch count; the inline-fix path removes a whole subagent
round-trip on trivial patches), lower cost/wall-time on `patch-webhook` and
single-ticket `feature`-class tasks, and corrected (likely higher, per L-5) cost
figures on any multi-checkpoint real run. Quality/solve-rate should be unaffected on
sensitive-surface or multi-ticket work (full path preserved there) and is the thing
most worth watching on the tasks where the fast path now applies. `program-rbac`'s
6/6 identical failure is a capability gap this pass does not address — see
`docs/BENCHMARKS.md`'s "The real program-rbac finding" for the next step (read the two
failing probes against both arms' diffs).
