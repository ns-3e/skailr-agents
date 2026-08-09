# Benchmarks: Skailr vs vanilla Claude Code vs the previous Skailr version

Real, non-mock [Skailr Bench](../bench/README.md) runs — actual `claude` CLI
invocations against fixed coding tasks, graded by hidden tests + heuristic
probes, run in disposable Docker containers. No numbers on this page are
simulated or estimated; every cell links back to a real `run.json`.

**Read this before the tables:** sample sizes here are small (n=1 to n=4 per
cell) and run-to-run variance is large — in some cases larger than the
differences being compared. Treat every "delta" on this page as a lead
worth investigating, not a settled result. See [Caveats](#caveats).

## What's being compared

| Column | What it is | Real bench data? |
| --- | --- | --- |
| **Vanilla Claude Code** | Plain `claude` CLI, no Skailr installed | Yes — 1 real run per task, all three from the 2026-08-09 campaign, the **first campaign in which the baseline arm actually ran** (it previously died in ~4s on every task to a harness bug, now fixed and verified — see [Baseline arm: broken, then fixed and verified](#baseline-arm-broken-then-fixed-and-verified)) |
| **Skailr — pre-1.14.0** | Skailr installed at post-1.13.0 development commits (`1380bcf`, `3851750`, `36d3b02` — all dated 2026-08-07/08, after the `v1.13.0` tag but before `v1.14.0`) | Yes — 3–4 real runs per task |
| **Skailr 1.14.0** | The current release, ref `v1.14.0` (sha `4e8dec88`) | Yes — 2 real Skailr-arm runs per task, across two sequential real-spend campaigns: `20260808T215547Z-series_1` (skailr arm only; its baseline arm was broken and is excluded) and `20260809T023850Z-series_1` (both arms real). |

The "pre-1.14.0" column is not a single tagged release — it's every real dev-build
run available locally as of this writing, spanning the period where 1.13.0's
five orchestrator-efficiency fixes landed but before 1.14.0's hooks-loading fix.
The 1.14.0 column below is from two real sequential (`--parallel 1`), 1-rep-per-arm
("smoke") campaigns run 2026-08-08 and 2026-08-09 via `bench/docker-run.sh` — see
[Skailr 1.14.0 real campaigns: what we found](#skailr-1140-real-campaigns-what-we-found).
The Vanilla column is from the 2026-08-09 campaign only, the first one whose
baseline arm was able to attempt the tasks at all.

## Headline table

Cost is `cost_reported_usd` (what the CLI actually reported spending).
Quality is Skailr Bench's 0–100 composite grader score. n=1 cells have no
median/spread to report — treat as a single data point, not a distribution.

### `feature-api-keys` (class: cross-cutting — add org-scoped API keys with security requirements)

| | Vanilla Claude Code (n=1) | Skailr — pre-1.14.0 (n=4) | Skailr 1.14.0 (n=2) |
| --- | --- | --- | --- |
| Solved | ✅ (100%) | 3/4 (75%) | 2/2 (100%) |
| Quality (median) | 99.0 | 92.0 (range 30–95; one run failed all 4 security checks) | 92.5 (both runs, identical) |
| Cost | $1.11 | $6.59 median (range $0.41–$10.44) | $0.37 and $2.61 |
| Wall time | 405s | 2765s median (range 2678–4094s) | 3133s and 3423s |

Both 1.14.0 runs solved it with no critical failures, and both scored exactly
**92.5**, with the same subscore breakdown (security 75, static 0, everything
else 100) — see [Two identical repeat scores](#two-identical-repeat-scores).
The real vanilla run solved it too, and scored higher (99.0: security 100,
static 100, maintainability 80) in about 1/8th the wall time and at lower cost.
n=1 vs n=2; one vanilla data point is a lead, not a verdict.
[Raw runs →](#raw-run-index)

### `program-rbac` (class: program — multi-workstream org invitations + RBAC)

| | Vanilla Claude Code (n=1) | Skailr — pre-1.14.0 (n=4) | Skailr 1.14.0 (n=2) |
| --- | --- | --- | --- |
| Solved | ❌ (0%) | 0/4 (0%) | 0/2 (0%) |
| Quality (median) | 88.25 | 87.9 (range 23.5–89.0) | 88.25 (both runs, identical) |
| Cost | $1.56 | $4.60 median (range $2.79–$7.87) | $4.70 and $14.81 |
| Wall time | 518s | 3921s median (range 2477–5752s) | 3444s and 4481s |

**Sixth Skailr run in a row to fail this task**, on the identical two critical
requirements every prior run failed: `invitation-single-use` and
`audit-events-emitted`. **And the first real vanilla run on this task fails on
exactly those same two requirements**, at the same 88.25 quality score — which
materially changes how this result should be read. See
[The real program-rbac finding](#the-real-program-rbac-finding).
[Raw runs →](#raw-run-index)

### `patch-webhook` (class: patch — fix a duplicate-webhook-processing bug)

| | Vanilla Claude Code (n=1) | Skailr — pre-1.14.0 (n=1) | Skailr 1.14.0 (n=2) |
| --- | --- | --- | --- |
| Solved | ✅ (100%) | ❌ (0%) | 1/2 (50%) |
| Quality | 95.0 | 80.0 | 95.0 (solved run) and 80.0 (failed run) |
| Cost | $0.50 | $0.45 | $0.40 and $1.33 |
| Wall time | 151s | 281s | 474s and 447s |

The pre-1.14.0 failure here predated the task-prompt fix that sends an explicit
`/patch` on the skailr arm (originally hard-coded as the prompt's first line;
now the task's separate `command:` field — see
[bench/README.md → Known issues](../bench/README.md#known-issues)).

The two 1.14.0 runs split: the 2026-08-08 run solved cleanly at 95.0, matching
vanilla exactly; the 2026-08-09 run **failed** at 80.0 on the
`exactly-once-processing` critical requirement — the dedup logic it wrote caught
none of the 25 concurrent duplicate webhook deliveries the hidden test fires
(majority verdict 0/3 trials). That is a real functional miss, and it is *not* a
consequence of the prompt-delivery fix: the fix moved the `/patch` command out of
`prompt` into the task's `command:` field, and the skailr arm still receives
`command` + `prompt` — net text byte-identical to what the solved run received.
The grader and fixture were untouched by that patch. Read this cell as n=2 with
one solve and one miss, i.e. the run-to-run variance this page keeps warning
about, not as a regression.

The real vanilla run (95.0, 151s) is within noise of the older, pre-regression
vanilla number for this task (95.0, 132s) — an independent sanity check that the
repaired baseline arm reproduces the earlier baseline result.

## The real program-rbac finding

The interesting result on this page isn't an efficiency number — it's that
**six independent Skailr attempts at `program-rbac` now, across three
different sets of fixes including 1.14.0 itself, have all failed the
identical two critical requirements**: `invitation-single-use` and
`audit-events-emitted`. That rules out "unlucky variance" as the explanation
and points at a reproducible failure on exactly those two requirements.

### …and vanilla Claude Code fails it the same way

The 2026-08-09 campaign produced the **first real vanilla data point on this
task**, and it fails `invitation-single-use` and `audit-events-emitted` too —
the same two requirements, at the same 88.25 quality score, `solved=false`
([`program-rbac_baseline_rep0_bf907f888c`](#raw-run-index)).

This page previously framed the repeated failure as a Skailr-specific,
reproducible capability gap in the multi-workstream pipeline. One vanilla data
point does not support that framing as stated, and it does not refute it either:

- The two arms reached the same failing outcome by very different routes —
  vanilla in 518s with 49 tool calls and no subagents at all, Skailr in 3444s
  with 397 tool calls across a multi-workstream orchestration. Identical
  outcomes from non-identical processes are weak evidence about either process.
- What it *does* establish is that these two requirements are not obviously
  reachable by a plain agent on this fixture either. The failure may reflect
  genuine task difficulty, or an over-strict / mis-specified grader probe or
  fixture, rather than anything about how work is split across workstreams.

**Open question, both ways.** Skailr is not vindicated by this (it still fails,
six for six, and far more expensively); the earlier Skailr-specific reading is
not debunked by this (n=1 on the vanilla side). The next useful step is reading
the two critical probes against both arms' actual diffs to decide whether the
requirement is unmet or unmeetable. Until that happens, treat "reproducible gap
in the multi-workstream pipeline" as unconfirmed rather than established.

### Phantom completion: present in the 2026-08-08 run, absent in the 2026-08-09 one

The 2026-08-08 1.14.0 run added a sharper data point than any prior run: its own
`.claude/skailr.db` — the exact table `check-phase-tracking.mjs` was built to
police — shows **zero rows in `program_phases`** and **all 10 recorded
findings (`B-1`–`B-4`, `N-1`–`N-6`) still `status='open'`, none with a
`resolved_at`**. Despite that, the agent's final message to the (simulated)
user claimed *"Fix round (Phase D2) ran — 4 blocking findings from initial
validation all resolved"* and declared the program **COMPLETE**. The run's own
`validation-report.md` still reads **DO NOT SHIP** for real, current reasons
(`B-1`: a role-change write path whose event listener is bound to a DOM node
that never receives the event, so no `PATCH` is ever issued in a real
browser). The hidden grader agrees with the validator, not the agent's
self-report: `solved=false`.

In other words: this is exactly the "phantom completion" failure mode
1.14.0's `check-phase-tracking.mjs` was built to catch (see below), observed
live in a real 1.14.0 run. Whether the hook fired and was overridden, or
didn't fire at all, isn't determinable from the artifacts collected here —
the `stdout.log` stream-json transcript has no visible hook-block event, but
hook execution isn't guaranteed to surface there. That's a real open question
for a follow-up investigation, not a settled diagnosis.

**The 2026-08-09 run did not repeat it.** That run's final self-report to the
(simulated) user said **BLOCKED** — verbatim: *"No fix round executed.
Program-validator returned NEEDS_FIXES with 5 blocking findings still open"* —
which agrees with the independent grader (`solved=false`) and with its own
`.claude/skailr.db` (13 findings, **all** `status='open'`, and again **zero rows
in `program_phases`**). Against materially the same kind of unresolved-findings
state, the previous run claimed COMPLETE and this one correctly reported the
block. That is a real, verified, positive data point.

It is not a fixed rate. It is one honest run against one dishonest one, and the
underlying artifact-completeness gap is **still present in the DB itself**: phase
rows are never written, and findings are never marked resolved even when the run
legitimately keeps working on them. What changed in this instance is that the
gap was no longer mis-reported to the user as success. Worth watching over more
runs before treating the phantom-completion concern as retired.

## Skailr 1.14.0: what changed

1.14.0 doesn't change the orchestration logic exercised above — it fixes two
enforcement mechanisms that the runs on this page prove were silently
non-functional in every prior version:

- **Hooks were never loading, in any Skailr version, ever.** They lived in
  `.claude/settings.skailr.json`, a filename Claude Code does not auto-load.
  Every pre-1.14.0 run on this page ran with `check-blocking-findings.mjs`
  (the validate→fix loop enforcer) silently dead — which is *why* the
  `program-rbac` DO NOT SHIP verdict above was never acted on. 1.14.0 moves
  hooks to `.claude/settings.json`, verified live to actually fire.
- **New: `check-phase-tracking.mjs`.** Enforces that `track-phase`'s DB writes
  actually happen, catching exactly the kind of drift a real program-scale run
  exhibited (a fully "complete" `ledger.md` with zero backing rows in
  `skailr.db`).

Both real 1.14.0 campaigns below still show this exact drift pattern on
`program-rbac` — zero `program_phases` rows and no finding ever marked resolved,
in both runs. `feature-api-keys` and `patch-webhook`, which didn't hit a
blocking finding requiring a fix round, show no quality/solve-rate regression
attributable to 1.14.0, consistent with the "no change where nothing needed
enforcing" half of the prediction.

## Skailr 1.14.0 real campaigns: what we found

Two campaigns, both via `bench/docker-run.sh --smoke --skailr-ref v1.14.0` —
all 3 tasks × both arms, 1 rep each, sequential (`--parallel 1`), real spend, no
mock data. `skailr_sha` on every skailr-arm run is
`4e8dec8812f82103cfb6cf5a8501779b6c7bb638`, which matches `git rev-parse v1.14.0`
exactly.

| Campaign | Ran | Arms usable | Notes |
| --- | --- | --- | --- |
| `20260808T215547Z-series_1` | 2026-08-08 | skailr only | Baseline arm broke on the slash-command bug below |
| `20260809T023850Z-series_1` | 2026-08-09 | **both** | First campaign with a working baseline arm; `series_1355e0a7d637` |

Both are local-only and gitignored, not committed — see
[Raw run index](#raw-run-index) for per-run paths.

**What worked:** `feature-api-keys` solved on the skailr arm in both campaigns
(92.5 each time), and `patch-webhook` solved in the first. Most importantly, the
**second campaign's baseline arm actually ran** — the first genuine
vanilla-vs-1.14.0 comparison this page has ever had, on all three tasks.

**What didn't:** `program-rbac` failed on the skailr arm in both campaigns, on
the same two critical requirements as every earlier run — *and* on the baseline
arm of the second campaign, on those same two. `patch-webhook`'s skailr arm
failed in the second campaign (`exactly-once-processing`) after solving in the
first. See [The real program-rbac finding](#the-real-program-rbac-finding) and
the `patch-webhook` table above.

### Two identical repeat scores

`feature-api-keys` scored **92.50** on both independent real 1.14.0 skailr runs,
and `program-rbac` scored **88.25** on both — identical to two decimal places,
with identical subscore breakdowns and (for `program-rbac`) identical critical
failures, despite different campaigns, wall times (3133s vs 3423s; 3444s vs
4481s) and costs. Recorded as a factual observation only. It is consistent with
either genuinely stable agent behavior on these two fixtures or coincidence at
n=2; nothing here distinguishes those, and the composite grader's discrete
subscore steps make repeat values less surprising than they first look.

### Baseline arm: broken, then fixed and verified

All three baseline (vanilla Claude Code) runs in the **2026-08-08** campaign
failed instantly (~4s wall, $0 cost, "Unknown command") and are **excluded**.
Root cause, confirmed directly in each run's `stdout.log`:
at the time, `bench/tasks/*.yaml` hard-coded a Skailr-only slash command as the
first line of every task prompt (`/patch`, `/yolo`, `/yolo-program`), and the
harness sent that prompt byte-identically to both arms. The baseline arm has no
Skailr pack installed, so Claude Code's slash-command parser intercepted the
line and replied e.g. `"Unknown command: /patch. Did you mean /batch?"` before
any task work starts — for every task, on every baseline run. This was a real
harness bug: the prompt-design fix that made the skailr arm's prompts correct
broke the baseline arm's ability to run at all.

**Fixed in `bench/` (commit `5effb16`, same patch as the telemetry fix below).**
The slash command moved out of `prompt` into a new optional `command:` field in the
task config (`bench/src/schema/task.schema.json`, set in all three
`bench/tasks/*.yaml`), and `buildLaunchPrompt(task, arm)` in
`bench/src/claude.mjs` now constructs what's actually sent per arm: `command` +
`prompt` on the skailr arm, a plain-language framing line + the same `prompt`
body on baseline. The authored task body stays a single value in YAML and is
still byte-identical across arms; the leading command line is now the one
deliberate, code-constructed per-arm difference.

**Verified working against real spend in the 2026-08-09 campaign.** All three
baseline runs genuinely attempted their task — no `Unknown command`, no ~4s
exits — with real wall times (151s / 405s / 518s), real cost ($0.50 / $1.11 /
$1.56) and real tool-call counts (24 / 55 / 49). Vanilla solved 2 of 3
(`feature-api-keys` 99.0, `patch-webhook` 95.0) and failed `program-rbac`. The
Vanilla Claude Code column in the headline tables above is now sourced from
these runs, replacing the frozen n=1 numbers carried over from the older
`20260807T213205Z-series_1` campaign (a different campaign and a different
harness era, kept for provenance in
[Raw run index](#raw-run-index) and [Caveats](#caveats)). `patch-webhook`'s new
vanilla score (95.0, 151s) lands on top of that old campaign's number (95.0,
132s), which is a useful independent check that the repair restored the arm
rather than changing what it measures.

### A telemetry bug, not a run failure

The 2026-08-08 campaign's auto-generated `SUMMARY.md` prints 4 `BROKEN RUN: 0 tool calls
with 0% solve rate` warnings — the 3 baseline runs (correctly: those really
did fail, for the unrelated reason above) plus `program-rbac`'s Skailr-arm
run. Only that last one is a **false positive** in the printed warning itself
— the heuristic requires both `tool_calls===0` and `solve_rate===0`, and
`feature-api-keys`/`patch-webhook`'s Skailr-arm runs both solved, so they
never triggered the warning line at all. But the underlying field the
heuristic reads is wrong for **all 3** real Skailr-arm runs, not just the one
that got printed. Manually checked each run's `run.json`:
`trajectory.tool_calls` reads `0` in every real Skailr run despite
`code.files_edited` being 5–24 and real token/cost numbers throughout — an
extraction bug in how the harness counts tool calls. The run-level
outcome/quality/cost data used in the tables above comes from `grader.json` and
the rest of `run.json`, which are unaffected — only the `tool_calls` field and
the report generator's heuristic that reads it were wrong.

**Fixed in `bench/` (commit `5effb16`, same patch as the baseline-arm fix above).**
Root cause was narrower than the earlier guess on this page (which blamed
subagent calls not being summed into the parent transcript): the extraction only
recognized mock mode's flat top-level `{type:"tool_use"}` events, and real
Claude Code stream-json emits no such event at all — tool uses are nested as
`{type:"assistant", message:{content:[{type:"tool_use",…}]}}`, which is also how
`Task`-dispatched subagent tool calls appear (inline in the same `stdout.log`,
tagged with `parent_tool_use_id`/`subagent_type`, not a separate shape). So the
fallback path matched nothing on a real run, main or subagent.
`countToolCallsInEvents` in `bench/src/telemetry.mjs` now counts both shapes
(and reads `tool_result` `is_error` for failed calls). `detectRowWarnings` in
`bench/src/report.mjs` additionally requires `wall_clock_s_median < 30` before
emitting `BROKEN RUN`, so a genuinely long solved-false run can no longer be
false-flagged the way the runs above were.

Because both bugs were about instrumentation and prompt delivery — not about the
captured ground truth — the real-run numbers in the tables on this page stand as
valid historical data and do not need rerunning. The already-written
`run.json`/`grader.json` for the 3 real Skailr-arm runs are unchanged by the fix;
only `tool_calls` in those existing files remains understated, and only future
runs carry a correct count.

**Verified on real data in the 2026-08-09 campaign.** Every one of that
campaign's 6 real runs carries a nonzero `trajectory.tool_calls`, read straight
from its `run.json`:

| Task | baseline | skailr |
| --- | --- | --- |
| `feature-api-keys` | 55 | 407 |
| `patch-webhook` | 24 | 81 |
| `program-rbac` | 49 | 397 |

That is direct evidence the extraction now handles real Claude Code stream-json
(and nested subagent tool calls — the ~400-call skailr-arm figures are only
reachable by counting subagent activity), not just the unit tests shipped with
the fix. No `BROKEN RUN` warning was emitted for any of the 6.

## Caveats

- **n is small everywhere.** Program-rbac's pre-1.14.0 cost range ($2.79–$7.87)
  and feature-api-keys' quality range (30–95) are both wider than most of the
  deltas on this page. Don't treat single-digit percentage differences as
  signal.
- **The pre-1.14.0 column is not one version.** It blends three different
  commits across the 1.13.0→1.14.0 development window (see the table above).
- **Vanilla Claude Code is still n=1 per task** — now from the 2026-08-09
  campaign, the first with a working baseline arm. These numbers replaced the
  earlier frozen vanilla figures, which came from a different campaign
  ([bench/benchmarks/20260807T213205Z-series_1](../bench/benchmarks/20260807T213205Z-series_1/SUMMARY.md))
  and a different harness era; that campaign's Skailr-arm numbers are retracted
  (broken headless-mode self-routing invocation, unrelated to this page's
  pre-1.14.0 column, which comes from local Docker runs using corrected
  prompts) — see
  [RETRACTED.md](../bench/benchmarks/20260807T213205Z-series_1/RETRACTED.md).
  Its baseline-arm numbers were never retracted and are retained for provenance
  in the [Raw run index](#raw-run-index).
- **Cost figures are `cost_reported_usd`**, not `cost_reconstructed_usd`, and
  the two diverge a lot more on the Skailr arm than the baseline arm: baseline
  runs are close (ratio ~1.1x), Skailr runs are not (ratio 3.5x–5.2x across
  the runs spot-checked here) — almost certainly a subagent-cost-accounting
  gap in reconstruction, not a real 3–5x pricing difference. The 2026-08-08
  `program-rbac` run widens this further: reported $14.81 vs. reconstructed
  $1.96 (~7.6x). The 2026-08-09 campaign reproduces the same split cleanly —
  baseline 1.10x–1.14x on all three tasks, skailr 1.9x (`patch-webhook`),
  4.9x (`feature-api-keys`), 6.9x (`program-rbac`). Open question in the
  harness, not resolved on this page. One concrete lead, newly noticed while
  writing this up: `usage.by_source.subagent` reads **all zeros** even on the
  2026-08-09 `program-rbac` skailr run, whose transcript contains 1124
  `subagent_type` events and 776 tool calls tagged with a
  `parent_tool_use_id`. So subagent token usage is not being attributed —
  which is exactly the input `cost_reconstructed_usd` is computed from, and
  would explain the divergence being large only on the skailr arm.
- **The 1.14.0 column is n=2 per task, Skailr arm only** (one run from each
  campaign). The 2026-08-08 campaign's baseline arm broke (see
  [Baseline arm: broken, then fixed and verified](#baseline-arm-broken-then-fixed-and-verified))
  and its `SUMMARY.md` mislabels a real Skailr run as broken due to a separate
  telemetry bug (see [A telemetry bug, not a run failure](#a-telemetry-bug-not-a-run-failure)).
  Both harness bugs are fixed in `bench/` (commit `5effb16`: `buildLaunchPrompt`
  in `src/claude.mjs` + the `command:` task field; `countToolCallsInEvents` in
  `src/telemetry.mjs` + the gated `BROKEN RUN` heuristic in `src/report.mjs`) and
  both are now verified against real spend by the 2026-08-09 campaign — but the
  fixes are not retroactive: the 2026-08-08 artifacts still show the broken
  baseline runs and the understated `tool_calls`.
- **Results directories are not campaign-scoped, so generated campaign reports
  can be polluted — read `run.json` directly.** Every local run, mock
  (`BENCH_MOCK`) or real, from every commit ever tested on the machine, lands in
  one flat `bench-docker-out/results/<task>_<arm>_rep<N>_<hash>/` namespace, and
  `publish-campaign.mjs` aggregates by walking that whole tree
  (`listRunRecords` in `bench/src/aggregate.mjs` recurses and takes *every*
  `run.json` it finds, then groups by task/arm). Each `run.json` does carry an
  `identity.series_id`, but nothing filters on it, and mock runs are not marked
  in a way the aggregator excludes. This bit the 2026-08-09 campaign itself: its own generated
  `SUMMARY.md`/`report.md` report **`Runs: 8`** for a 3-task × 2-arm × 1-rep
  smoke campaign that produced exactly **6** runs, having silently mixed in 2
  stale mock-run directories. **Every 2026-08-09 number on this page was taken
  by hand-verifying each of the 6 real runs' `run.json`/`grader.json`
  individually, bypassing that aggregate** — as should be done for any campaign
  until the harness gains run provenance. Tracked in
  [bench/README.md → Known issues](../bench/README.md#known-issues).

## Raw run index

All pre-1.14.0 Skailr runs referenced above (local-only, not committed —
`bench-docker-out/results/<run_id>/run.json`):

| Task | run_id | skailr_sha | solved | quality | cost (reported) | wall (s) |
| --- | --- | --- | --- | --- | --- | --- |
| feature-api-keys | `106ddc0ee3` | `36d3b02a` | true | 95.0 | $10.44 | 4094 |
| feature-api-keys | `1a43d3a0af` | `1380bcf6` | true (wall-clock killed) | 92.5 | $4.50 | 2700 |
| feature-api-keys | `3905583580` | `38517506` | true | 91.5 | $8.67 | 2678 |
| feature-api-keys | `fa5ae7447f` | `38517506` | false | 30.0 | $0.41 | 2830 |
| program-rbac | `222b360d80` | `36d3b02a` | false | 88.25 | $2.79 | 5752 |
| program-rbac | `059ef0611a` | `38517506` | false | 89.0 | $4.11 | 2477 |
| program-rbac | `8b90fcb68b` | `38517506` | false | 87.5 | $5.09 | 5141 |
| program-rbac | `a7cb60b6ff` | `1380bcf6` | false (wall-clock killed) | 23.5 | $7.87 | 2700 |
| patch-webhook | `099f000a69` | (retracted campaign, pre-prompt-fix) | false | 80.0 | $0.45 | 281 |

**Superseded vanilla baseline runs** (kept for provenance only — the headline
tables now use the 2026-08-09 runs below):
[bench/benchmarks/20260807T213205Z-series_1/runs/](../bench/benchmarks/20260807T213205Z-series_1/runs/)
(`*_baseline_*` files; `feature-api-keys` 94.0/$1.23/424s, `program-rbac`
88.25/$1.48/450s, `patch-webhook` 95.0/$0.46/132s). Only that campaign's
skailr-arm numbers were retracted; the baseline arm was not.

**First 1.14.0 real campaign** (`20260808T215547Z-series_1`, local-only, not
committed — `bench-docker-out/results/<run_id>/run.json`):

| Task | run_id | skailr_sha | solved | quality | cost (reported) | wall (s) |
| --- | --- | --- | --- | --- | --- | --- |
| feature-api-keys | `feature-api-keys_skailr_rep0_f4b9c0f756` | `4e8dec88` | true | 92.5 | $0.37 | 3423 |
| feature-api-keys | `feature-api-keys_baseline_rep0_96d29e2b2a` | n/a (baseline) | **BROKEN** (unknown-command, see above) | — | $0 | 4 |
| patch-webhook | `patch-webhook_skailr_rep0_59f328a314` | `4e8dec88` | true | 95.0 | $0.40 | 474 |
| patch-webhook | `patch-webhook_baseline_rep0_db0d8236d8` | n/a (baseline) | **BROKEN** (unknown-command, see above) | — | $0 | 4 |
| program-rbac | `program-rbac_skailr_rep0_71c8fc864c` | `4e8dec88` | false | 88.25 | $14.81 | 4481 |
| program-rbac | `program-rbac_baseline_rep0_9f6a3bf851` | n/a (baseline) | **BROKEN** (unknown-command, see above) | — | $0 | 4 |

**Second 1.14.0 real campaign — both arms real** (`20260809T023850Z-series_1`,
`series_1355e0a7d637`; local-only, not committed —
`bench-docker-out/results/<run_id>/run.json`). Each row was read directly from
that run's `run.json`/`grader.json`, not from the campaign's own (polluted,
`Runs: 8`) aggregate — see [Caveats](#caveats):

| Task | Arm | run_id | skailr_sha | solved | quality | cost (reported) | wall (s) | tool calls | critical failures |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| feature-api-keys | baseline | `feature-api-keys_baseline_rep0_0a70f30614` | n/a | true | 99.00 | $1.1142 | 405.1 | 55 | — |
| feature-api-keys | skailr | `feature-api-keys_skailr_rep0_43aa2364d9` | `4e8dec88` | true | 92.50 | $2.6105 | 3133.0 | 407 | — |
| patch-webhook | baseline | `patch-webhook_baseline_rep0_78e1689161` | n/a | true | 95.00 | $0.4956 | 151.0 | 24 | — |
| patch-webhook | skailr | `patch-webhook_skailr_rep0_a39b4849cd` | `4e8dec88` | false | 80.00 | $1.3317 | 447.2 | 81 | `exactly-once-processing` |
| program-rbac | baseline | `program-rbac_baseline_rep0_bf907f888c` | n/a | false | 88.25 | $1.5583 | 517.9 | 49 | `invitation-single-use`, `audit-events-emitted` |
| program-rbac | skailr | `program-rbac_skailr_rep0_333308cdce` | `4e8dec88` | false | 88.25 | $4.7016 | 3444.2 | 397 | `invitation-single-use`, `audit-events-emitted` |

Full skailr-arm sha on all three: `4e8dec8812f82103cfb6cf5a8501779b6c7bb638`
(`git rev-parse v1.14.0`).
