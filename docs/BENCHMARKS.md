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
| **Vanilla Claude Code** | Plain `claude` CLI, no Skailr installed | Yes — 1 real run per task (unchanged since the previous version of this page; the harness bug that broke the newer baseline runs is now fixed, but no fresh baseline campaign has been run — see [Baseline arm broke in the 1.14.0 campaign](#baseline-arm-broke-in-the-1140-campaign)) |
| **Skailr — pre-1.14.0** | Skailr installed at post-1.13.0 development commits (`1380bcf`, `3851750`, `36d3b02` — all dated 2026-08-07/08, after the `v1.13.0` tag but before `v1.14.0`) | Yes — 3–4 real runs per task |
| **Skailr 1.14.0** | The current release, ref `v1.14.0` (sha `4e8dec88`) | Yes — 1 real Skailr-arm run per task, sequential campaign `20260808T215547Z-series_1`. **The baseline arm of this same campaign is broken and excluded** (harness bug, since fixed — not yet re-run) — see below. |

The "pre-1.14.0" column is not a single tagged release — it's every real dev-build
run available locally as of this writing, spanning the period where 1.13.0's
five orchestrator-efficiency fixes landed but before 1.14.0's hooks-loading fix.
The 1.14.0 column below is from one real sequential (`--parallel 1`), 1-rep-per-arm
("smoke") campaign run 2026-08-08 via `bench/docker-run.sh` — see
[Skailr 1.14.0 real campaign: what we found](#skailr-1140-real-campaign-what-we-found).

## Headline table

Cost is `cost_reported_usd` (what the CLI actually reported spending).
Quality is Skailr Bench's 0–100 composite grader score. n=1 cells have no
median/spread to report — treat as a single data point, not a distribution.

### `feature-api-keys` (class: cross-cutting — add org-scoped API keys with security requirements)

| | Vanilla Claude Code (n=1) | Skailr — pre-1.14.0 (n=4) | Skailr 1.14.0 (n=1) |
| --- | --- | --- | --- |
| Solved | ✅ (100%) | 3/4 (75%) | ✅ (100%) |
| Quality (median) | 94.0 | 92.0 (range 30–95; one run failed all 4 security checks) | 92.5 |
| Cost | $1.23 | $6.59 median (range $0.41–$10.44) | $0.37 |
| Wall time | 424s | 2765s median (range 2678–4094s) | 3423s |

The single 1.14.0 run solved it with no critical failures, security subscore
75/100 (not 100 — see the run's `grader.json` for the specific miss). n=1;
don't read a trend into one run. [Raw runs →](#raw-run-index)

### `program-rbac` (class: program — multi-workstream org invitations + RBAC)

| | Vanilla Claude Code (n=1) | Skailr — pre-1.14.0 (n=4) | Skailr 1.14.0 (n=1) |
| --- | --- | --- | --- |
| Solved | ❌ (0%) | 0/4 (0%) | ❌ (0%) |
| Quality (median) | 88.25 | 87.9 (range 23.5–89.0) | 88.25 |
| Cost | $1.48 | $4.60 median (range $2.79–$7.87) | $14.81 |
| Wall time | 450s | 3921s median (range 2477–5752s) | 4481s |

**Fifth Skailr run in a row to fail this task**, and it fails the identical two
critical requirements every prior run failed: `invitation-single-use` and
`audit-events-emitted`. Cost is the highest yet recorded on this page — see
[The real program-rbac finding](#the-real-program-rbac-finding), now updated
with what this run's on-disk state reveals. [Raw runs →](#raw-run-index)

### `patch-webhook` (class: patch — fix a duplicate-webhook-processing bug)

| | Vanilla Claude Code (n=1) | Skailr — pre-1.14.0 (n=1) | Skailr 1.14.0 (n=1) |
| --- | --- | --- | --- |
| Solved | ✅ (100%) | ❌ (0%) | ✅ (100%) |
| Quality | 95.0 | 80.0 | 95.0 |
| Cost | $0.46 | $0.45 | $0.40 |
| Wall time | 132s | 281s | 474s |

The pre-1.14.0 failure here predated the task-prompt fix that sends an explicit
`/patch` on the skailr arm (originally hard-coded as the prompt's first line;
now the task's separate `command:` field — see
[bench/README.md → Known issues](../bench/README.md#known-issues)).
With that fix in place, the 1.14.0 run against the corrected prompt solves it
cleanly, matching vanilla's quality score exactly. n=1 either way.

## The real program-rbac finding

The interesting result on this page isn't an efficiency number — it's that
**five independent Skailr attempts at `program-rbac` now, across three
different sets of fixes including 1.14.0 itself, have all failed the
identical two critical requirements**: `invitation-single-use` and
`audit-events-emitted`. That rules out "unlucky variance" as the explanation
and points at a real, reproducible capability gap in how the multi-workstream
pipeline handles invitation single-use enforcement and audit-event emission
when they cross workstream boundaries.

The 1.14.0 run adds a sharper data point than any prior run: its own
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

The real 1.14.0 campaign below shows this exact drift pattern still occurring
on `program-rbac` — the fix these two mechanisms target is not yet visible in
the one real run available. `feature-api-keys` and `patch-webhook`, which
didn't hit a blocking finding requiring a fix round, show no quality/solve-rate
regression, consistent with the "no change where nothing needed enforcing"
half of the prediction.

## Skailr 1.14.0 real campaign: what we found

Ran 2026-08-08 via `bench/docker-run.sh --smoke --skailr-ref v1.14.0` — all 3
tasks × both arms, 1 rep each, sequential (`--parallel 1`), real spend, no
mock data. Campaign: `bench/benchmarks/20260808T215547Z-series_1` (gitignored
locally, not committed — see [Raw run index](#raw-run-index) for per-run
paths). `skailr_sha` in the run metadata (`4e8dec88...`) matches `git rev-parse
v1.14.0` exactly.

**What worked:** both `feature-api-keys` and `patch-webhook` solved on the
skailr arm, at quality parity with (or matching) vanilla — see the headline
tables above. `patch-webhook` in particular confirms the `/patch`-prompt fix
holds: it failed before the fix, solves cleanly now.

**What didn't:** `program-rbac` reproduces the exact same capability gap as
every prior run — see [The real program-rbac finding](#the-real-program-rbac-finding)
above.

### Baseline arm broke in the 1.14.0 campaign

All three baseline (vanilla Claude Code) runs in this campaign failed
instantly (~4s wall, $0 cost, "Unknown command") and are **excluded** — the
Vanilla Claude Code column above is unchanged from the previous version of
this page. Root cause, confirmed directly in each run's `stdout.log`:
at the time, `bench/tasks/*.yaml` hard-coded a Skailr-only slash command as the
first line of every task prompt (`/patch`, `/yolo`, `/yolo-program`), and the
harness sent that prompt byte-identically to both arms. The baseline arm has no
Skailr pack installed, so Claude Code's slash-command parser intercepted the
line and replied e.g. `"Unknown command: /patch. Did you mean /batch?"` before
any task work starts — for every task, on every baseline run. This was a real
harness bug: the prompt-design fix that made the skailr arm's prompts correct
broke the baseline arm's ability to run at all.

**Fixed in `bench/` (uncommitted, same patch as the telemetry fix below).** The
slash command moved out of `prompt` into a new optional `command:` field in the
task config (`bench/src/schema/task.schema.json`, set in all three
`bench/tasks/*.yaml`), and `buildLaunchPrompt(task, arm)` in
`bench/src/claude.mjs` now constructs what's actually sent per arm: `command` +
`prompt` on the skailr arm, a plain-language framing line + the same `prompt`
body on baseline. The authored task body stays a single value in YAML and is
still byte-identical across arms; the leading command line is now the one
deliberate, code-constructed per-arm difference.

The fix has **not** been exercised against real spend yet — a fresh
baseline-arm campaign is the natural next step, and until it runs the Vanilla
Claude Code column on this page stays frozen at its pre-existing n=1 value, not
re-verified against 1.14.0.

### A telemetry bug, not a run failure

The campaign's auto-generated `SUMMARY.md` prints 4 `BROKEN RUN: 0 tool calls
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

**Fixed in `bench/` (uncommitted, same patch as the baseline-arm fix above).**
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
runs will carry a correct count.

## Caveats

- **n is small everywhere.** Program-rbac's pre-1.14.0 cost range ($2.79–$7.87)
  and feature-api-keys' quality range (30–95) are both wider than most of the
  deltas on this page. Don't treat single-digit percentage differences as
  signal.
- **The pre-1.14.0 column is not one version.** It blends three different
  commits across the 1.13.0→1.14.0 development window (see the table above).
- **Vanilla Claude Code is n=1 per task**, from the one real (non-retracted)
  baseline arm data available — see
  [bench/benchmarks/20260807T213205Z-series_1](../bench/benchmarks/20260807T213205Z-series_1/SUMMARY.md).
  Its Skailr-arm numbers are retracted (broken headless-mode self-routing
  invocation, unrelated to this page's pre-1.14.0 column, which comes from
  local Docker runs using corrected prompts) — see
  [RETRACTED.md](../bench/benchmarks/20260807T213205Z-series_1/RETRACTED.md).
- **Cost figures are `cost_reported_usd`**, not `cost_reconstructed_usd`, and
  the two diverge a lot more on the Skailr arm than the baseline arm: baseline
  runs are close (ratio ~1.1x), Skailr runs are not (ratio 3.5x–5.2x across
  the runs spot-checked here) — almost certainly a subagent-cost-accounting
  gap in reconstruction, not a real 3–5x pricing difference. The 1.14.0
  `program-rbac` run widens this further: reported $14.81 vs. reconstructed
  $1.96 (~7.6x). Open question in the harness, not resolved on this page.
- **The 1.14.0 column is n=1 per task, Skailr arm only** — the baseline arm of
  that same campaign broke (see
  [Baseline arm broke in the 1.14.0 campaign](#baseline-arm-broke-in-the-1140-campaign))
  and its `SUMMARY.md` mislabels 3 of 4 real Skailr runs as broken due to a
  separate telemetry bug (see [A telemetry bug, not a run failure](#a-telemetry-bug-not-a-run-failure)).
  Both harness bugs are now fixed in `bench/` (uncommitted:
  `buildLaunchPrompt` in `src/claude.mjs` + the `command:` task field;
  `countToolCallsInEvents` in `src/telemetry.mjs` + the gated `BROKEN RUN`
  heuristic in `src/report.mjs`), but the fixes are not retroactive: this
  campaign's already-captured artifacts still show the broken baseline runs and
  the understated `tool_calls`, so read the 1.14.0 numbers on this page from
  `run.json`/`grader.json` directly, not from the campaign's own generated
  report. No campaign has been run against the fixed harness yet.

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

Vanilla Claude Code baseline runs: [bench/benchmarks/20260807T213205Z-series_1/runs/](../bench/benchmarks/20260807T213205Z-series_1/runs/) (`*_baseline_*` files).

**1.14.0 real campaign** (`20260808T215547Z-series_1`, local-only, not
committed — `bench-docker-out/results/<run_id>/run.json`):

| Task | run_id | skailr_sha | solved | quality | cost (reported) | wall (s) |
| --- | --- | --- | --- | --- | --- | --- |
| feature-api-keys | `feature-api-keys_skailr_rep0_f4b9c0f756` | `4e8dec88` | true | 92.5 | $0.37 | 3423 |
| feature-api-keys | `feature-api-keys_baseline_rep0_96d29e2b2a` | n/a (baseline) | **BROKEN** (unknown-command, see above) | — | $0 | 4 |
| patch-webhook | `patch-webhook_skailr_rep0_59f328a314` | `4e8dec88` | true | 95.0 | $0.40 | 474 |
| patch-webhook | `patch-webhook_baseline_rep0_db0d8236d8` | n/a (baseline) | **BROKEN** (unknown-command, see above) | — | $0 | 4 |
| program-rbac | `program-rbac_skailr_rep0_71c8fc864c` | `4e8dec88` | false | 88.25 | $14.81 | 4481 |
| program-rbac | `program-rbac_baseline_rep0_9f6a3bf851` | n/a (baseline) | **BROKEN** (unknown-command, see above) | — | $0 | 4 |
