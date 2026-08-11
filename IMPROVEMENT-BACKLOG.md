# skailr-agents — Improvement Backlog

Source: `docs/audits/2026-08-02-audit.md`. Sequenced in recommended order. Effort:
S (<½ day) / M (1–2 days) / L (multi-day). Every entry lists the invariant(s) it
touches; none violates one.

**Status (2026-08-10):** L-8 landed — extends the L-1..L-6 lean pass's proportionality
logic from `/yolo`'s back end (Phase 5/6, already proportional as of L-3) to its front
end (Phase 1-3: Research/Story/Spec). Not yet verified against a fresh `bench/`
campaign — same honesty rule as L-7: predicted direction, not a claimed result.
L-9 also landed same day — hierarchical `CLAUDE.md` maintenance (see that section).

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

---

## 2026-08-10 — Front-end proportionality for `/yolo`

Source: re-read of `docs/BENCHMARKS.md`'s v1.15.0 campaign against the pattern-doc
framework in a rethink-Skailr planning session. The lean pass (L-1..L-4) made
`/patch` and `/yolo`'s Phase 5/6 proportional to task size; it never touched Phase
1-3. `feature-api-keys`' 1.15.0 run (346 tool calls, $9.73, 2701s vs vanilla's 43
tool calls, $0.93, 350s, for a *worse* quality score) is the clearest evidence this
was the wrong place to stop: `/yolo` still dispatches researcher → story-writer →
architect as three unconditional, separately cold-started Task calls before an
engineer ever opens a file, on every feature regardless of size. `architect.md`
already documents each dispatch as a roughly fixed cost independent of ticket size
(~700K-1.2M tokens/dispatch in a long session, per its own ticket-consolidation
note) — the same fixed-cost-times-N mechanism L-1/L-2 fixed for bookkeeping and
`/patch`, unaddressed on the three most expensive dispatches in the pipeline.

## L-8 — Lean-path proportionality for Research/Story/Spec — **M, highest remaining measured leverage, guarded risk**
**Problem.** Phase 1 (`researcher`), Phase 2 (`story-writer`), and Phase 3
(`architect`) run as three unconditional, sequential Task dispatches on every
`/yolo` feature. Each pays a full cold-start tax (fresh context, repo
re-orientation) regardless of whether the feature is a one-file CRUD addition or a
genuine multi-surface build — the same "fixed tax regardless of task size" pattern
L-1/L-2 already found and fixed elsewhere in this pipeline, left unaddressed here.
**Change.** New Phase 0 gate in `yolo.md`, before Phase 1: a feature is
lean-eligible only when it fails to match the sensitive-surface list **and** names
one separable capability (not ≥3, reusing the existing `/yolo` vs `/yolo-program`
intake signal) **and** Setup's expert consult-only pass found no roster match
**and** `.claude/repo/orientation.md` exists or the repo is genuinely greenfield
**and** fit-test's own single-leaf estimate is ≤65% of budget. When eligible, one
`architect` dispatch (`mode: lean`, new section in `architect.md`) performs
abbreviated researcher and story-writer passes itself, in the same context, then
proceeds into its own normal Process — writing `research.md`, `story.md`,
`spec.md`, and minting `board.md` in one dispatch instead of three. Every
downstream check (Prior Art present, ACs have IDs, ownership disjointness, AC
coverage, ticket validity) runs unchanged against the same artifact contracts;
nothing past Phase 3 differs. An `ESCALATE:` escape hatch in the architect's Task
return forces every later proportionality gate (Phase 5/6) to the full path if the
work turns out bigger than Phase 0 assumed — this narrows the fixed-tax cost, it
never lets a genuinely complex feature masquerade as small.
**Files.** `.claude/commands/yolo.md` (Phase 0, Phase 1 (lean)), `.claude/agents/engineering/architect.md` (Lean mode section).
**Invariants.** Narrows (does not remove) the researcher/story-writer/architect
role separation for the one case — small, non-sensitive, single-capability,
already-mapped-or-greenfield — where three separate dispatches were not earning
their isolation cost; every other feature shape keeps the unchanged three-phase
path. Script gates (ownership, ticket validation) stay unconditional in both
branches. Mirrors L-2's `/patch` carve-out shape exactly, one tier up.
**Note.** Not verified against a fresh `bench/` campaign — same standing rule as
L-7. Predicted effect: fewer tool calls and lower cost/wall-time on single-surface,
non-sensitive `/yolo` features (this is most of what `feature-api-keys`-class
"cross-cutting" tasks are *not* — that task both matches the sensitive-surface list
and is explicitly tagged cross-cutting, so it stays on the full path under this
gate and this change predicts no effect on its regression). Quality on lean-path
features is the thing most worth watching in a re-run: a single dispatch doing
three jobs is a real behavioral change, not just a bookkeeping one, and the
abbreviated research/story passes are a plausible place for something to slip
that a dedicated researcher or story-writer would have caught.

---

## 2026-08-10 — Hierarchical `CLAUDE.md` maintenance

Source: user request, directly following the rethink-Skailr planning session, to
adopt the pattern-doc's "hierarchical, scoped project instructions" pattern (talk
Scenario 2) as a first-class Skailr capability rather than leaving it implicit.

## L-9 — `/map-repo` and `program-documenter` create/maintain hierarchical `CLAUDE.md` files — **M, new capability, guarded risk**
**Problem.** Skailr wrote exactly one `CLAUDE.md`, at project root, containing
only its own intake-routing prose — fixed boilerplate, install.sh/install.ps1
blind-`cp`-overwrote it on every install and upgrade. Everything Skailr actually
learned about a *specific* project (stack, directory boundaries, house
conventions) went into `.claude/repo/orientation.md`, a Skailr-proprietary format
nothing outside an explicitly-dispatched researcher ever reads — meaning the
single most leveraged, zero-plumbing context mechanism Claude Code has (auto-loaded
`CLAUDE.md`, root and every ancestor directory of the cwd) carried none of it, in
either a Skailr session that hadn't yet dispatched a researcher or a vanilla
Claude Code session at all.
**Change.** Root `CLAUDE.md` is now two independently-owned, marker-delimited
zones: `skailr:intake` (unchanged content and ownership — remirror/install still
keep it in sync every upgrade) and `skailr:conventions` (new — project-owned,
written and maintained by Skailr, survives upgrades). New skill
`maintain-claude-md` defines the contract: baseline mode, called directly by the
`/map-repo` orchestrator right after `orientation.md`'s existing quality gate (no
new subagent dispatch — mechanical derivation from an artifact already in hand),
writes the root conventions zone plus one `<path>/CLAUDE.md` per real directory
boundary (skip boundaries with nothing distinct to say beyond the root summary);
reconcile mode, called from `program-documenter`'s existing Reconcile mode, keeps
them true against later diffs using the same "surgical, do not restructure" rule
its other documentation reconciliation already follows.
**Files.** New `.claude/skills/maintain-claude-md/SKILL.md`;
`.claude/commands/map-repo.md` (Phase 1.5, write-scope note);
`.claude/agents/program/program-documenter.md` (Reconcile mode step 6);
`scripts/remirror.sh` (wraps `intake_body` in `<!-- skailr:intake:start/end -->`
when generating root `CLAUDE.md`); `install.sh` / `install.ps1` (see next
paragraph); `README.md`, `docs/MAP_REPO.md`.
**Prerequisite fix, shipped in the same change.** `install.sh`/`install.ps1`
previously blind-overwrote root `CLAUDE.md` on every install/upgrade — safe only
because the file carried zero consumer-owned content before this change. Left
unfixed, the very next `install.sh` run after a `/map-repo` baseline would have
silently destroyed the conventions zone this change introduces, the same failure
mode already solved for `.claude/settings.skailr.json` and `.claude/experts/` but
not, until now, for `CLAUDE.md`. New `install_claude_md`/`Install-ClaudeMd`
functions replace only the marked intake zone (portable POSIX `sed`+`awk` in
`install.sh`, `[regex]` block-splice in `install.ps1` — no node/python dependency
introduced into either installer, consistent with why B-5 rejected that for the
copy-list logic); a target file with no complete intake zone yet (first install
over a human's own `CLAUDE.md`, or an upgrade from before this marker existed)
appends rather than guesses at or destroys unknown content.
**Invariants.** Extends (does not narrow) the existing "consumer-owned content
survives upgrade" guarantee already established for `.claude/settings.skailr.json`
and `.claude/experts/` to a third file. `program-documenter`'s existing "writes
only documentation, never application code" scope is unchanged — CLAUDE.md is
documentation. `researcher`'s existing write-path contract is untouched (it still
writes only `orientation.md`; the derivation into `CLAUDE.md` happens in the
orchestrator, not the subagent).
**Verified.** `install.sh`'s new merge path was smoke-tested end-to-end against
the real script (not just the isolated `sed`/`awk` pipeline): fresh install →
simulate a `/map-repo`-written conventions zone → re-run install as an upgrade →
confirm the intake zone updated and the conventions zone survived
byte-identical. `doctor.mjs`, `check:blocks`, `check:agent-tools` all pass; the
new skill resolves in the skill-refs check and the manifest picked it up
(109 → 110 artifacts). **Not verified:** `install.ps1`'s `[regex]`-based merge —
no PowerShell available on this machine (same limitation already blocking B-4);
read carefully by eye for correctness (no `MatchEvaluator`/closure pitfalls —
uses plain index-based `Substring` splicing instead) but unexecuted. Also not
verified: an actual `/map-repo` run exercising `maintain-claude-md` end-to-end
against a real non-trivial repo (this change was authored and validated at the
mechanism level — installer merge safety, doctor/lint checks, file-contract
consistency — not run against a live brownfield target).

---

## 2026-08-10 — Owner-dispatch model (Increment 1): architect stops designing owners' internals

Source: a real bench campaign this session measured `feature-api-keys` (2-owner,
backend+frontend) at 4 subagent dispatches / 435 tool calls / $13.95 / 3925s on
the skailr arm vs. vanilla Claude Code's single continuous session at 44 tool
calls / $1.05 / 409s — solving the same task, at roughly equal-or-better quality.
`architect.md` already documented, from its own prior measurement, that each
subagent dispatch costs ~700K-1.2M tokens of orchestrator-side context re-read
roughly independent of the ticket's size (see L-8's Process step 10 note) — but
435 tool calls over 4 dispatches is ~109 tool calls/dispatch, more than dispatch
count alone explains. The user asked to rebuild Skailr from the ground up,
including deleting everything; the case made back (and accepted) was that the
measured problem is real but localized to the feature-tier's phase-per-dispatch
pattern — specifically, `architect.md` pre-designs **each owner's internal
implementation** (services/domain logic/transaction boundaries for backend;
components/props/state for frontend), not just the seam between them, so a
separate engineer dispatch then spends tool calls reconciling that prescription
against what the code actually looks like instead of designing once from what it
reads. Confirmed via `validator.md`'s Pass 1: it only ever checks the diff
against data model / API contract / ownership globs, never against prescribed
internal service or component design — nothing downstream actually depends on
architect pre-designing an owner's internals, so removing it costs nothing.

A Plan-agent stress-test of the initial redesign (a new `brief.md` artifact,
broadened lean-path eligibility to 2-owner features) found both would-be changes
too risky to bundle with the well-understood fix: `brief.md` would require
touching three independently-hardcoded phase-name enums
(`scripts/skailr/lib/db.mjs`'s `DEFAULT_FEATURE_PHASES`,
`feature-status.mjs`'s `ORDER`, `feature-progress.template.md`) for a rename
that buys nothing (the savings come from dispatch count and per-dispatch
reconciliation overhead, not what the checkpoint ledger calls a phase), and
broadened lean-path eligibility only applies to `/yolo` — gated mode
(`/ship-feature`, `/continue-feature`) structurally needs research/story/spec
as separate dispatches for its two approval gates. **This entry ships only the
lower-risk half (Increment 1: thin the spec/build contract) — Increment 2
(broadened lean-path eligibility) is explicitly deferred until this is
re-benchmarked**, matching this pass's own established sequencing discipline
(L-2 shipped and measured before L-3; L-3 before L-8).

## L-10 — Owner-dispatch model, Increment 1: seam-only `spec.md`, engineers design their own slice — **L, highest-leverage untested change this pass, guarded risk**
**Problem.** `architect.md` produced a full technical blueprint — data model,
migrations, service/domain logic, component props/state — for **both** backend
and frontend, even though each engineer only ever reads their own half. Real
data (`feature-api-keys`, above) shows this costing tool calls beyond what
dispatch count alone explains, plausibly from engineers reconciling a
prescription against real code instead of designing directly from it.
**Change.** `spec.md` becomes seam-only: everything that crosses an ownership
boundary (API request/response shapes; DB schema/migrations *only when
`data-engineer` is a separate owner from `backend-engineer`*; shared types; any
file two owners' globs would otherwise touch) — derived from *this feature's
actual ownership split* (`architect.md`'s new Process step 1, "Seam
determination"), not a fixed section list. Each owning engineer's own dispatch
now does its own micro-research over its own slice, its own internal design,
then builds — one continuous context, the same "design once, from what you just
read" pattern L-8's lean mode already uses for the smallest features, now
applied to *internal design* on every feature regardless of size. New Process
step 0 ("Design your slice") in `backend-engineer.md`/`frontend-engineer.md`;
`data-engineer.md` needed only a clarifying note since its own Process (profile
→ model → pipeline → quality gates → optimize → secure) was already fully
autonomous design work, never dependent on architect prescribing it. New
`## Design` report subsection in backend/frontend engineers (no new artifact
file — `validator.md`'s "read every report" flow is unaffected).
**Files.** `.claude/agents/engineering/architect.md` (Process steps rewritten,
output template's Backend/Frontend Work sections cut to megafile-check only,
Data Model made conditional); `.claude/agents/engineering/backend-engineer.md`,
`frontend-engineer.md` (new step 0 + `## Design` report section),
`data-engineer.md` (clarifying note only); `.claude/skills/run-ticket-board/SKILL.md`
(new "Contract-change fan-out" section — the one genuinely new coordination
logic this change needs: thinner seam-briefs plausibly raise how often an owner
discovers mid-build that its seam was incomplete, since each owner now designs
more independently and misalignment surfaces later; today nothing re-checks the
*other* owner when a contract-change resolves, so this adds that check —
unclaimed tickets need no action, in-flight tickets get re-dispatched with the
corrected section, already-`done` tickets get flagged in `progress.md` for
elevated verification risk rather than silently trusted);
`.claude/agents/engineering/validator.md` (Pass 1: an engineer's own internal
design choice inside their boundary is not spec drift just because the spec
never mentioned it — only a boundary-crossing divergence is a finding).
**Invariants.** `check-ownership.mjs --from-spec`'s mechanical parse of the exact
`BACKEND/FRONTEND may write only:` lines is untouched — those lines are the one
part of `spec.md` this change explicitly preserves byte-for-byte. No phase
rename: `research`/`story`/`spec`/`build`/`verify`/`validate`/`docs` stay exactly
as `db.mjs`/`feature-status.mjs`/`render.mjs`/`feature-progress.template.md`
already define them — zero schema/checkpoint churn. `researcher.md`/
`story-writer.md` are unchanged and still real, dispatched roles — only what
`spec.md` contains changes, not the phase structure, and nothing is deleted.
Gated mode's dispatch shape (`ship-feature.md`/`continue-feature.md`/
`build-feature.md`) is untouched — this change only thins content, which is
safe there too, but proposes no dispatch-count change for gated mode.
Ownership/contracts/channels/experts/bench harness/install system: not touched,
not implicated by anything measured.
**Note.** Not verified against a fresh bench campaign — same standing rule as
L-7/L-8/L-9. `IMPROVEMENT-BACKLOG.md`'s own program-tier precedent
(`/build-program` Phase A: "prefer one consolidated dispatch pass... reserve a
full separate nested pipeline for items that are genuinely large, independent,
or need their own research") already proved this shape works at the workstream
level; this generalizes it to the feature tier's spec/build contract specifically,
not the whole pipeline. **Explicitly deferred, not this pass:** broadening
`/yolo`'s Phase 0 lean-path eligibility from single-owner to ≤2-owner features,
and a `mode: lean-partial` addition to `architect.md` for repos without
`orientation.md` — ship this increment, re-benchmark, then decide.

---

## 2026-08-10 — Diagnosing the remaining cost gap: one broken metric, one real fix, one honest reframing

Source: the 2.0.0 real campaign showed `feature-api-keys` and `program-rbac` still at
8-10x vanilla's cost, and the user asked for a root-cause investigation, not more
theorizing, before shipping 2.0.0. Did the forensic work directly against
`bench-docker-out/results/*/events.jsonl` — the raw stream-json transcript — rather
than trusting `skailr_diagnostics`, the harness's own derived summary. That distrust
was immediately justified: the first finding disproves a claim already written into
`docs/BENCHMARKS.md`'s 2.0.0 entry earlier the same day.

## L-11a — `skailr_diagnostics.agents_spawned` was never a real dispatch count — **S, high impact (measurement correctness), low risk**
**Problem.** `bench/src/run.mjs`: `agents_spawned: count(/^\|?\s*[\w-]+\s*(@\s*Task|dispatched)/gim)
|| count(/role:\s*\w/gim)` — a regex scan over agent-produced **artifact text**
(research.md, tickets/*.md, etc.), never the session transcript. The fallback mostly
matches ticket YAML frontmatter's `role: backend` line, which is why it correlated
with ticket count, not dispatch count. Extracting the real number directly from
`events.jsonl` (top-level `assistant` events carrying an `Agent`-type `tool_use`, no
`parent_tool_use_id`): `feature-api-keys` skailr reported `2`, real count `8`
(researcher, story-writer, architect, backend-engineer×2, e2e-verifier, validator,
program-documenter); `program-rbac` skailr reported `7`, real count `10`. This had
already produced a wrong claim in `docs/BENCHMARKS.md`'s first 2.0.0 write-up
("agent count dropped from 4 to 2... plausibly an L-10 effect") — the real count was
8 both campaigns; L-10 doesn't touch dispatch count (that's Increment 2, deferred),
so nothing dropped. Corrected in the same page, same day.
**Change.** `extractSkailrDiagnostics` (`bench/src/run.mjs`) now takes the parsed
`events` array (already in memory from `invokeClaude`, no extra file read) and counts
real top-level `Agent` tool_use events, independent of whether any artifact files
exist (a crashed run can dispatch agents before writing anything). Every other field
in this function (`inter_agent_messages`, `blockers`, `contract_events`,
`gate_failures`, `validator_findings`) is untouched — those genuinely do match
literal channel-message text (`type: blocker`, etc.) per `PROTOCOL.md`'s own format,
so the artifact-text approach was sound for them, just never for dispatch count.
**Files.** `bench/src/run.mjs`.
**Verified.** Ran the fixed function directly against both real transcripts already
on disk (`feature-api-keys_skailr_rep0_f058923bee`, `program-rbac_skailr_rep0_34c73b0977`)
— output `8` and `10`, matching the hand-extraction exactly.

## L-11b — orchestrator bookkeeping Bash calls weren't consistently chained — **M, real measured impact, low risk**
**Problem.** Breaking down the same two transcripts by who issued each tool call
(top-level vs. `parent_tool_use_id`-tagged subagent calls): on `feature-api-keys`,
**115 of 314 total tool calls (37%) were the orchestrator itself — more than any
single subagent dispatch.** Of those 115, 28 (`ticket-status.mjs` × 11,
`model-usage.md` writes × 9, `db.mjs ... set-phase` × 8) were simple, single-purpose
bookkeeping calls that could have been chained. On `program-rbac`: 103 of 495 (21%)
orchestrator, 31 of those the same class of call. `yolo.md`/`build-program.md`
**already** establish and correctly use `&&`-chaining for exactly this reason in two
spots (Phase 3's ownership+ticket-validate chain, Phase 4's ownership+channels+test+
lint+typecheck chain) — confirmed both appear as single Bash calls in the real
transcript. The gap was that this discipline wasn't applied to the *other* repeated
bookkeeping call sites: a ticket resolving, a model-usage log line, and a
phase-completion mark each fired as their own separate top-level Bash call, every
single time.
**Change.** `track-phase` skill: `db.mjs feature set-phase`/`program set-phase` now
explicitly `&&`-chained with their `db.mjs render` call (previously shown as two
sequential commands with no chaining instruction). `run-ticket-board` skill: a
frontier batch's `ticket-status.mjs claim` calls now chain into one call covering the
whole batch instead of one call per ticket; `ticket-status.mjs resolve` now chains
with the immediately-following frontier recompute read. `yolo.md`/`build-program.md`
updated to match (including the lean-path checkpoint, where three phases' `set-phase`
calls now chain together with a single trailing render instead of three separate
render calls).
**Files.** `.claude/skills/track-phase/SKILL.md`, `.claude/skills/run-ticket-board/SKILL.md`,
`.claude/commands/yolo.md`, `.claude/commands/build-program.md`.
**Invariants.** No change to what gets checked, recorded, or gated — only how many
top-level Bash invocations it costs to do so. The underlying scripts
(`ticket-status.mjs`, `db.mjs`) are unchanged.
**Note.** Not yet re-benchmarked — the 2.0.0 campaign numbers on `docs/BENCHMARKS.md`
predate this fix (they measure L-10's effect alone). A future campaign is needed to
see this fix's own impact; not spent on as part of this pass, same discipline as
every other fix this session.

## L-11c — `program-rbac`'s remaining gap is now mostly real work volume, not waste — **informational**
**Problem/finding.** Real dispatch count for `program-rbac` skailr is 10 (via L-11a's
fix), and the tool-call distribution is dominated by the 5 build-tier dispatches
(258 of 495, 52%) plus the closing verify/validate/docs trio (104, 21%) — only 21%
(103) is orchestrator overhead, and L-11b's fix targets roughly a third of that. This
is a materially different profile than `feature-api-keys`, where orchestrator
overhead alone was 37% of the total tool calls. A 5-workstream program legitimately
needs 5 separate build dispatches; that is not overhead to eliminate, it's the
correct shape for the work.
**Change.** None — documentation only. `docs/BENCHMARKS.md`'s 2.0.0 entry now says
this plainly instead of continuing to imply the whole gap is fixable orchestration
waste.
**Files.** `docs/BENCHMARKS.md`.

## 2026-08-10 — L-11 verification campaign: no regression, one grader false-negative traced to ground

Source: the user asked for a real campaign to confirm L-11a/L-11b actually helped
before calling it done. Ran one against a fresh dangling ref (2.0.0 + L-11). Result
did **not** confirm a cost/time improvement on `feature-api-keys` or `program-rbac` —
`feature-api-keys` skailr got more expensive ($15.29 vs. the prior campaign's $8.40)
and was marked `solved: false` for the first time in three real campaigns on this
task. Traced this all the way to root cause, the same discipline as L-11a/b, rather
than either declaring the fix validated or declaring it broken from the summary
numbers alone.

## L-12a — `feature-api-keys`'s "failure" this campaign is a grader false-negative, not a product regression, and not related to L-11 — **informational, high-value finding**
**Problem/finding.** `run.json` showed `critical_failures: ["revoked-keys-rejected"]`,
`solved: false`, quality 79.17 — but `termination_reason: "finish"` (not a
crash/timeout) and Skailr's own internal `validation-report.md` verdict was **SHIP**,
zero blocking findings, all 28 ACs passed with real test citations, including the two
ACs (AC-11, AC-28) covering revocation enforcement. Traced the discrepancy to the
grader (`bench/graders/feature-api-keys/hidden-tests.mjs`), not the shipped code:
1. `hf-revoke-endpoint-discoverable` (the critical check) failed because
   `discoverRevoke()`'s six guessed request shapes never match this run's real,
   spec'd revoke contract — `POST /api-keys/revoke` with `{"keyId": "<id>"}` in the
   body (`spec.md` line 452, "DECISION-1 revoke route", Adopted). The grader's closest
   guess sends `{"id": "<id>"}` to the same path; the shipped handler
   (`src/http/server.ts:141`, `handleRevokeApiKey`) correctly 400s on a missing
   `keyId` field, so the guess never registers as the real endpoint and the prober
   gives up.
2. `hf-authenticate-with-api-key` failed because the grader assumes an API key
   authenticates the same `GET /api-keys` list endpoint it was created from. This
   run's `spec.md` explicitly and deliberately names `POST /org/audit-events` as
   **the only** API-key-authenticated surface (line 8, line 345's AC-1 text, and line
   457's own recorded amendment: *"'API-key-authenticated surfaces' left unnamed —
   Amended: spec names exactly one, `POST /org/audit-events`... without which
   AC-1/AC-15/AC-16/AC-17 are untestable"*) — driven by `auth-security-expert`, minted
   for the first time on this task this campaign. `/api-keys` create/list/revoke stay
   session-only by design (`src/http/server.ts:1-4`'s own header comment: *"No
   endpoint accepts both credential types"*). This is a **stricter, smaller-blast-radius**
   credential-scoping choice than the grader's implicit assumption, not a defect.

   Both failures are grader/harness convention mismatches against a correctly
   spec-conformant, security-hardened implementation — confirmed by reading the real
   shipped route table and the spec's own explicit, recorded design decisions, not
   inferred. This is unrelated to L-11a/L-11b (which touch orchestrator bookkeeping
   and a diagnostics counter, nothing in the grading path) and unrelated to any code
   this session touched. The most plausible explanation for why this surfaced now,
   after two prior clean real campaigns on the same task: this is the first campaign
   where `auth-security-expert` minted (previous two never triggered it), and its
   security-hardening amendment to scope API-key auth to exactly one endpoint is what
   first exposed the grader's implicit, unstated assumption that all three prior runs
   happened not to violate.
**Change.** None to Skailr — this is a bench-harness (grading fixture) finding, out of
scope for this pass same as the `program-rbac` grader bug (L-10/PR #14). Not
silently patched; recorded here so it isn't lost, same policy as that bug.
**Files.** None changed. `bench/graders/feature-api-keys/hidden-tests.mjs` (`REVOKE_SHAPES`
body-field assumption, `hf-authenticate-with-api-key`'s target-endpoint assumption)
would need to widen to accept a spec-declared endpoint/field name instead of guessing,
mirroring how `program-rbac`'s grader fix (unmerged PR #14) already had to happen once.
**Verified.** Read the real shipped route table (`src/http/server.ts`), the real spec
decision log (`spec.md` lines 8, 345, 452, 457), and the grader's own probe code
(`hidden-tests.mjs`, `lib/probe.mjs`) directly — not inferred from summary fields.
**Note.** A `sec-create-missing-name-handled` security-subscore miss (creating a key
with `{}` body returns 200, not 4xx — no `name`-required check) is real and
independent of the above; minor, not a critical failure, left as-is (not part of
this pass's scope).

## L-12b — expert-mint schema validation can fail on first write, forcing a retry — **S, low risk, minor**
**Problem.** `node scripts/skailr/check-experts.mjs --slug auth-security-expert`
failed on its first invocation this campaign — `.claude/experts/profiles/auth-security-expert.md`
was missing required frontmatter fields (`schema`, `slug`) that `check-experts.mjs`
validates. A `--regen-registry` plus a second `--slug` check then passed. First time
this expert was minted in any real campaign on this task, so this is the first time
the mint flow's first-draft profile has been checked end-to-end against the real
validator. Cost: one extra orchestrator round-trip, not a correctness issue (the
profile was fixed before use) and not related to L-11.
**Change.** None yet — flagged for whoever owns the expert-mint skill next; needs the
mint template checked against `check-experts.mjs`'s actual required-field list so the
first write passes validation instead of relying on a retry.
**Files.** None changed this pass.

## L-12c — `&&`-chains silently drop everything after the first unrecognized command — **informational, generic fragility, not caused by L-11b**
**Problem/finding.** One orchestrator turn this campaign ran `db.mjs feature
set-phase ... && db.mjs feature set-status ... && db.mjs render progress ...`.
`feature set-status` is **not a real `db.mjs` subcommand** (confirmed:
`scripts/skailr/db.mjs` only defines `feature set-phase` and `program set-phase`;
neither `yolo.md` nor `track-phase`'s `SKILL.md` — including L-11b's own edits —
ever instruct `set-status`). The dispatched agent invented it. Because of `&&`, the
first command (`set-phase docs complete`) genuinely succeeded, but the invented
second command failed and the chain never reached the third (`render progress`) —
so `progress.md` never got its final render this run, visible as `docs: pending` in
the artifact despite the feature actually being complete in the database and the run
terminating cleanly. Purely cosmetic (didn't affect grading or real DB state,
confirmed by direct query) and **not introduced by L-11b** — L-11b's own chains never
mention `set-status` — but it does illustrate a real, generic cost of the
`&&`-chaining pattern this pass extended: one wrong or hallucinated command anywhere
in a chain silently kills every command after it, with no surfaced error beyond the
raw transcript.
**Change.** None this pass. Worth a future guard (e.g., chains that end in a
render/read step could tolerate a failed middle step with `;` instead of `&&` where
the trailing step doesn't depend on the failed one's success) — not implemented here;
flagging so it isn't lost.
**Files.** None changed this pass.

## L-12d — headline conclusion: L-11 neither confirmed nor contradicted; no regression found — **informational**
**Finding.** `feature-api-keys`'s dispatch count rose from 8 (prior campaign) to 12
this campaign — fully accounted for by real, legitimate additional work: 3 extra
expert-related dispatches (story co-author, re-integration, spec co-author) plus a
3rd backend-engineer ticket (a dedicated security-E2E-test ticket that didn't exist
in prior runs), all downstream of `auth-security-expert` minting for the first time.
This is not orchestration waste and L-11b's fix does not target it. `program-rbac`
re-graded with the fixed grader a fourth time (see below) — same clean flip to
`solved: true` on both arms as every prior campaign, no change in that pattern.
`patch-webhook` remains a clean win (solved/quality tied at 95, skailr cheaper and
faster). No evidence in any of the three tasks' transcripts that L-11a or L-11b
caused a failure, a slowdown, or a cost increase — the one chain failure found
(L-12c) traces to an unrelated hallucinated command, not to anything L-11b wrote.
**Conclusion.** This campaign cannot claim L-11 reduced cost — the comparison isn't
apples-to-apples once the real extra work is accounted for. It also finds no evidence
L-11 caused harm. Treat L-11a/L-11b as: correct fixes for real, confirmed bugs
(the diagnostics counter really was wrong; the bookkeeping calls really weren't
chained), landing in 2.0.0 on that basis — not as measures whose cost-reduction
benefit this campaign proves. A cleaner re-run (same task, no new expert mint) would
be needed to isolate L-11b's own effect; not spent on as part of this pass.
**Files.** `docs/BENCHMARKS.md`, `CHANGELOG.md`.

## 2026-08-10 — `balanced` profile moves worker roles to Opus; top-level planning to Fable

Source: user asked whether model routing was using the right tier at every level, given
the L-11/L-12 investigation's own evidence that a caught account-takeover bug's fix
dispatch (`backend-engineer`) stayed on the same tier (`sonnet`) that produced it. Grepped
every real campaign's `model-usage.md` on disk for escalation events: zero found — every
logged fix/retry round for `backend-engineer`/`frontend-engineer` across every real run
stayed at its default tier, note field literally `"default"`, never `"escalate"`, despite
`route-models`' documented rule to bump one tier on a validator/e2e retry. User directed a
config fix rather than waiting to fix the enforcement gap first: raise the floor for
worker/IC roles instead of continuing to depend on an escalation step real runs weren't
exercising.

## L-13 — `balanced`: worker/IC roles → Opus; `architect`/`program-architect`/`portfolio-architect` → Fable — **config change, unverified against a real run**
**Change.** `.claude/model-routing.json`'s `balanced` profile (the active one):
`default` sonnet→opus; every previously-sonnet worker/IC role (`backend-engineer`,
`frontend-engineer`, `researcher`, `story-writer`, `compliance-reviewer`,
`content-strategist`, `content-writer`, `design-strategist`, `designer`, `fin-analyst`,
`fin-modeler`, `initiative-lead`, `legal-analyst`, `mkt-strategist`, `risk-analyst`) now
maps to `opus`. `status-reporter` is the deliberate exception, left on `sonnet` —
matches the `quality` profile's own existing precedent for this role (pure digest
compile, no judgment call). The three roles that own a high-level plan —
`architect`, `program-architect`, `portfolio-architect` — now map to `"fable"`
directly (same mechanism as any other role→tier mapping, no new indirection).
`researcher` and `story-writer` added to the `protected` list (joining
`backend-engineer`/`frontend-engineer`, already there) so the thin-channel-digest
downgrade rule can't undercut this change for the four explicitly-named roles;
left the other newly-bumped roles out of `protected` so that downgrade path still
has room to operate on the less-central IC roles. `economy` and `quality` profiles
untouched — this change is scoped to `balanced`, the active profile, per the
question that prompted it.
**Consequence worth naming plainly:** `balanced` is now nearly identical to
`quality` (opus-everywhere) except for the three Fable-routed planning roles and
the one `status-reporter` exception both profiles already shared. `economy` is now
the only profile offering real per-role cost variation. If cost is still a concern
in practice, `economy`'s design is worth revisiting rather than treating `balanced`'s
tier spread as the cost lever going forward.
**Files.** `.claude/model-routing.json`, `docs/MODEL_ROUTING.md`,
`.claude/skills/route-models/SKILL.md` (escalate-example was `researcher`
sonnet→opus, now stale since `researcher` starts at opus — replaced with
`status-reporter`, the one role with real escalation headroom left). Applied via
`node scripts/skailr/apply-model-routing.mjs --profile balanced` (18 agent files
updated) + `./scripts/remirror.sh`; `doctor.mjs` passes clean (`40 agents match
profile "balanced"`).
**Verified.** Config applies cleanly, frontmatter matches, Cursor mirror regenerated,
all doctor checks pass. **Not verified:** whether Claude Code's subagent Task
dispatch actually honors `model: fable` in agent frontmatter the same way it honors
`model: opus`/`model: sonnet` today — confirmed only that the installed CLI
(`claude --help`, v2.1.220) lists `fable` as a recognized `--model` alias
alongside `opus`/`sonnet`, not that a real dispatched subagent picks it up. Also not
verified: any cost/quality effect of moving 15 roles from sonnet to opus — expected
direction is higher cost, likely higher quality/fewer retries, but no real campaign
has run against this config yet.
**Note.** A real campaign against this config (ideally the same tasks used for the
L-11 campaigns, for comparability) would be needed to (a) confirm Fable dispatches
actually work end-to-end and (b) measure the real cost/quality tradeoff of the
opus floor-raise. Not spent on as part of this pass — flagging as the natural next
step, same discipline as every other unverified change this session.

## 2026-08-11 — 3.0.0: the thin-layer rebuild (supersedes most open leads)

**Decision, not a lead.** The full benchmark record (four real campaigns,
`docs/BENCHMARKS.md`) converged on one reading: every measured improvement came
from removing Skailr machinery, the multi-agent relay pipeline cost 9–16x vanilla
for equal-or-worse quality, and the only mechanism with proven positive effect
was the blocking Stop hook. 3.0.0 rebuilt the pack around that evidence — 4
agents, 4 commands (+2 aliases), 2 skills, 1 blocking hook. Full rationale and
keep/delete manifest: `docs/DESIGN-3.0.md`; change list: `CHANGELOG.md` §3.0.0.

Effect on standing leads: L-2/L-3/L-4/L-8/L-10/L-11b are subsumed (their
direction — remove overhead, thin the front end, let owners design their own
slices — is now the whole architecture). L-13 (balanced-profile model routing)
is retired: routing itself is gone; agents ship `model: inherit`. L-12a's
grader-convention gap and the `program-rbac` grader bug (PR #14) remain real,
open harness issues unaffected by the rebuild. B-12 (per-agent prompt
tightening) is moot for retired agents; the four 3.0 agents were written fresh.

## L-14 — Re-benchmark 3.0.0 against vanilla — **the next spend, nothing else first**

Same three tasks, both arms, real spend. Bench task YAMLs still send `/yolo` /
`/yolo-program` on the skailr arm — now thin aliases into `/build` / `/program`,
so the harness needs no changes. Predictions to test (from DESIGN-3.0.md):
`/patch` holds its win; `/build` lands ≤2x vanilla cost with equal-or-better
quality via the verifier; `/program` drops far below the 2.x ~10x multiple
(and, per the scope gate, may legitimately route program-rbac to `/build`).
If `/build` can't beat vanilla on quality at ≤2x cost, the next lever is the
verifier rubric, not more orchestration.
