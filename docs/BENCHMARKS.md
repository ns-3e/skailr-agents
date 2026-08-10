# Benchmarks: Skailr vs vanilla Claude Code vs the previous Skailr version

Real, non-mock [Skailr Bench](../bench/README.md) runs — actual `claude` CLI
invocations against fixed coding tasks, graded by hidden tests + heuristic
probes, run in disposable Docker containers. No numbers on this page are
simulated or estimated; every cell links back to a real `run.json`.

**Read this before the tables:** sample sizes here are small (n=1 to n=4 per
cell) and run-to-run variance is large — in some cases larger than the
differences being compared. Treat every "delta" on this page as a lead
worth investigating, not a settled result. See [Caveats](#caveats).

## 2026-08-09 update: v1.15.0 re-benchmarked — mixed, not a clean win

Everything below this note through "Skailr 1.14.0 real campaigns: what we found" is
the campaign data that motivated a benchmark-driven efficiency pass
(`IMPROVEMENT-BACKLOG.md`, L-1..L-7). What changed, mechanically:

- **De-taxed per-dispatch bookkeeping** (`route-models`, `emit-telemetry`): the routing
  file is now read once per run instead of before every Task; telemetry span wrapping
  now defaults **off** for `/patch` and standalone `/yolo` (`telemetry.scope:
  "program-only"` in `.claude/settings.skailr.json`) since real campaigns showed it
  cost 2 Bash calls per dispatch, across 6-7+ dispatches per feature run, for a signal
  that was itself broken (next point).
- **Guarded inline-fix carve-out for `/patch`**: a bounded, single-owner, non-sensitive
  fix below `fit-test`'s own spawn floor is now implemented by the orchestrator
  directly instead of always spawning an engineer subagent — the likely driver of
  `patch-webhook`'s 3.4x tool-call ratio below. `/yolo`/`/yolo-program` keep the
  dispatch-only rule.
- **Proportional verification/docs in `/yolo`**: `e2e-verifier`/`validator`/
  `program-documenter` now skip (with a logged reason) on single-ticket, non-sensitive,
  non-public-surface features; anything bigger or sensitive keeps the full path
  unconditionally.
- **Two real bugs found and fixed in `bench/` itself while investigating the
  `usage.by_source.subagent`-always-zero caveat below**: a single real `claude -p`
  process (one `spawn()` call, never `--resume`-chained) emits multiple `result`-shaped
  events over its own lifetime — verified on a real transcript, one untagged interim
  status mid-stream plus several tagged `origin:{"kind":"task-notification"}` (one per
  background Task completing), `total_cost_usd` rising monotonically across all of them
  ($2.61 → $12.70 across 7 events) — and `claude.mjs` was selecting the *first* one via
  `.find()`, an early interim status rather than the run's actual outcome (confirmed by
  that event's own result text, `"**YOLO run complete**..."`, only present on the true
  last one), understating `cost_reported_usd` and `usage.tokens` on any run with more
  than one. Fixed to `.findLast()`. The subagent-attribution figure itself stays
  honestly zero-filled — investigated and rejected a naive per-turn-usage-summation fix
  because it overcounts by ~26x (per-turn `usage` is cumulative context size at that
  turn, not an incremental delta); no sound per-source split is derivable from
  stream-json alone.

**Now re-benchmarked**, real spend, `bench/docker-run.sh --smoke --skailr-ref v1.15.0`
(`skailr_sha` `494d1f91`, matches `git rev-parse v1.15.0` exactly), one campaign
(`20260809T170839Z-series_1`), all 3 tasks × both arms × 1 rep. Result is genuinely
mixed, not the clean efficiency win the prediction implied:

- **`patch-webhook`: the predicted win, observed.** Skailr solved it (95.0, tied
  vanilla exactly) and for the first time **beat vanilla on wall time** (273.5s vs
  364.9s) and cost ($0.83 vs $0.96 reported). `cost_reported_usd`/`cost_reconstructed_usd`
  landed at a 1.12x ratio — the tightest a skailr-arm run has ever shown, in line with
  little-to-no subagent work on this run.
- **`feature-api-keys`: regressed.** 1.14.0 solved this 2/2 (92.5 both). 1.15.0's single
  real run **failed** (87.05, `hf-authenticate-with-api-key` returns 403 — API-key
  authentication itself doesn't work — plus a security-validation miss on
  `sec-create-missing-name-handled`). Not something this pass predicted or explains; see
  [Skailr 1.15.0 real campaign: what we found](#skailr-1150-real-campaign-what-we-found).
- **`program-rbac`: unchanged.** Seventh Skailr run in a row (and third vanilla run in a
  row) to fail on the identical two critical requirements. Not addressed by this pass, as
  flagged when it shipped.

n=1 per task on the new arm — this is a lead on both the `patch-webhook` win and the
`feature-api-keys` regression, not a settled verdict on either. See
[Caveats](#caveats).

## What's being compared

| Column | What it is | Real bench data? |
| --- | --- | --- |
| **Vanilla Claude Code** | Plain `claude` CLI, no Skailr installed | Yes — 2–3 real runs per task now, across three campaigns (see [Raw run index](#raw-run-index)); the two most recent (2026-08-09, both post the baseline-arm fix) are what the headline tables show |
| **Skailr — pre-1.14.0** | Skailr installed at post-1.13.0 development commits (`1380bcf`, `3851750`, `36d3b02` — all dated 2026-08-07/08, after the `v1.13.0` tag but before `v1.14.0`) | Yes — 3–4 real runs per task |
| **Skailr 1.14.0** | Ref `v1.14.0` (sha `4e8dec88`) | Yes — 2 real Skailr-arm runs per task, across two sequential real-spend campaigns: `20260808T215547Z-series_1` (skailr arm only; its baseline arm was broken and is excluded) and `20260809T023850Z-series_1` (both arms real). |
| **Skailr 1.15.0** | The current release, ref `v1.15.0` (sha `494d1f91`) | Yes — 1 real Skailr-arm run per task, from `20260809T170839Z-series_1` — see [Skailr 1.15.0 real campaign: what we found](#skailr-1150-real-campaign-what-we-found). |

The "pre-1.14.0" column is not a single tagged release — it's every real dev-build
run available locally as of this writing, spanning the period where 1.13.0's
five orchestrator-efficiency fixes landed but before 1.14.0's hooks-loading fix.
The 1.14.0 column is from two real sequential (`--parallel 1`), 1-rep-per-arm
("smoke") campaigns run 2026-08-08 and 2026-08-09 via `bench/docker-run.sh` — see
[Skailr 1.14.0 real campaigns: what we found](#skailr-1140-real-campaigns-what-we-found).
The 1.15.0 column is from one such campaign run 2026-08-09, after the lean pass. The
Vanilla column in the headline tables uses the most recent 2026-08-09 baseline runs
(the same-day run alongside 1.15.0), the second working baseline campaign.

## Headline table

Cost is `cost_reported_usd` (what the CLI actually reported spending).
Quality is Skailr Bench's 0–100 composite grader score. n=1 cells have no
median/spread to report — treat as a single data point, not a distribution.

### `feature-api-keys` (class: cross-cutting — add org-scoped API keys with security requirements)

| | Vanilla Claude Code (n=1) | Skailr — pre-1.14.0 (n=4) | Skailr 1.14.0 (n=2) | Skailr 1.15.0 (n=1) |
| --- | --- | --- | --- | --- |
| Solved | ✅ (100%) | 3/4 (75%) | 2/2 (100%) | ❌ (0%) |
| Quality | 94.0 | 92.0 median (range 30–95; one run failed all 4 security checks) | 92.5 (both runs, identical) | 87.05 |
| Cost | $0.93 | $6.59 median (range $0.41–$10.44) | $0.37 and $2.61 | $9.73 |
| Wall time | 349.8s | 2765s median (range 2678–4094s) | 3133s and 3423s | 2700.9s |

Both 1.14.0 runs solved it with no critical failures, and both scored exactly
**92.5**, with the same subscore breakdown (security 75, static 0, everything
else 100) — see [Two identical repeat scores](#two-identical-repeat-scores).
**The 1.15.0 run regressed: it failed.** `hf-authenticate-with-api-key` returns
403 (API-key authentication itself doesn't work end-to-end) and
`sec-create-missing-name-handled` returns 201 instead of rejecting the request —
see [Skailr 1.15.0 real campaign: what we found](#skailr-1150-real-campaign-what-we-found).
The vanilla run also solved it, at 94.0 (functional 100, security 100, static 0,
maintainability 80) — a different vanilla run than the 99.0 figure earlier
versions of this page cited; see [Caveats](#caveats). n=1 per arm on both the
newest vanilla and 1.15.0 rows — leads, not verdicts.
[Raw runs →](#raw-run-index)

### `program-rbac` (class: program — multi-workstream org invitations + RBAC)

| | Vanilla Claude Code (n=1) | Skailr — pre-1.14.0 (n=4) | Skailr 1.14.0 (n=2) | Skailr 1.15.0 (n=1) |
| --- | --- | --- | --- | --- |
| Solved | ❌ (0%) | 0/4 (0%) | 0/2 (0%) | ❌ (0%) |
| Quality | 88.25 | 87.9 median (range 23.5–89.0) | 88.25 (both runs, identical) | 94.0 |
| Cost | $1.34 | $4.60 median (range $2.79–$7.87) | $4.70 and $14.81 | $12.61 |
| Wall time | 505.95s | 3921s median (range 2477–5752s) | 3444s and 4481s | 3620.4s |

**Seventh Skailr run in a row to fail this task**, on the identical two critical
requirements every prior run failed: `invitation-single-use` and
`audit-events-emitted`. **Third vanilla run in a row to fail it the same way too**,
now at the identical 88.25 quality score on all three vanilla attempts. The 1.15.0
skailr run scores highest of any skailr attempt yet (94.0 — `static` hit 100 for the
first time; every prior skailr run on this task scored 0 on `static`) while still
missing the same two critical checks. See
[The real program-rbac finding](#the-real-program-rbac-finding).
[Raw runs →](#raw-run-index)

### `patch-webhook` (class: patch — fix a duplicate-webhook-processing bug)

| | Vanilla Claude Code (n=1) | Skailr — pre-1.14.0 (n=1) | Skailr 1.14.0 (n=2) | Skailr 1.15.0 (n=1) |
| --- | --- | --- | --- | --- |
| Solved | ✅ (100%) | ❌ (0%) | 1/2 (50%) | ✅ (100%) |
| Quality | 95.0 | 80.0 | 95.0 (solved run) and 80.0 (failed run) | 95.0 |
| Cost | $0.96 | $0.45 | $0.40 and $1.33 | $0.83 |
| Wall time | 364.9s | 281s | 474s and 447s | 273.5s |

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

**The 1.15.0 run solved it and, for the first time, beat vanilla on both wall
time and cost** (273.5s/$0.83 vs vanilla's 364.9s/$0.96 in the same campaign) —
the result the inline-fix carve-out (`IMPROVEMENT-BACKLOG.md` L-2) predicted. n=1
on the new arm; see
[Skailr 1.15.0 real campaign: what we found](#skailr-1150-real-campaign-what-we-found).

This campaign's vanilla run (95.0, 364.9s) scored identically to every prior
vanilla run on this task but took over twice as long as the two before it (151s,
132s) — the run-to-run wall-time variance this page keeps warning about applies
to the baseline arm too, not just skailr.

## The real program-rbac finding

The interesting result on this page isn't an efficiency number — it's that
**seven independent Skailr attempts at `program-rbac` now, across four
different sets of fixes including 1.14.0 and 1.15.0, have all failed the
identical two critical requirements**: `invitation-single-use` and
`audit-events-emitted`. That rules out "unlucky variance" as the explanation
and points at a reproducible failure on exactly those two requirements.

### …and vanilla Claude Code fails it the same way, three times now

The 2026-08-09 campaigns have produced **three real vanilla data points on this
task now** (an earlier run in `20260807T213205Z-series_1`, the 2026-08-09
`bf907f888c` run, and today's `f64b957a86` run alongside 1.15.0), and all three
fail `invitation-single-use` and `audit-events-emitted` — the same two
requirements, at the identical 88.25 quality score every time, `solved=false`
(see [Raw run index](#raw-run-index)).

This page previously framed the repeated failure as a Skailr-specific,
reproducible capability gap in the multi-workstream pipeline. Three consistent
vanilla data points make that framing harder to sustain as stated, though they
don't fully refute it either:

- The two arms reach the same failing outcome by very different routes —
  vanilla in ~500s with ~45-55 tool calls and no subagents at all, Skailr in
  3400-4500s with 380-400+ tool calls across a multi-workstream orchestration.
  Identical outcomes from non-identical processes remain weaker evidence about
  either process than three identical vanilla scores are individually striking.
- What it *does* establish, now more strongly with n=3 on the vanilla side, is
  that these two requirements are not reliably reachable by a plain agent on
  this fixture either. The failure increasingly looks like genuine task
  difficulty or an over-strict / mis-specified grader probe or fixture, rather
  than something specific to how work is split across workstreams.

**Resolved: it was a grader bug, not a capability gap in either arm.**
[A follow-up diagnosis](audits/2026-08-10-program-rbac-diagnosis.md), done
entirely against already-frozen local run artifacts (zero new bench spend),
read the two failing probes against 8 real implementations' actual diffs —
across both arms and every Skailr version tested — and found the same
mechanical cause in every one: `hidden-tests.mjs`'s accept-invitation probe
always called the endpoint unauthenticated and only ever read the invite
token from the create-invitation HTTP response body. Every real
implementation sampled (6/6 checked in detail) reasonably gates accept
behind session auth — the *only* auth pattern this fixture's own
`PUBLIC_API.md` documents — and at least 2/8 never echo the raw token in
that response at all (a deliberate, sound security choice; the token is
delivered only via the mocked email, exactly as the task prompt asked). The
grader never seeded a session for the invitee and never fell back to the
outbox for the token, so accept was structurally unreachable regardless of
how good the implementation was. Seeding an invitee account/session and
adding an email-body token fallback in `bench/graders/program-rbac/{grade,hidden-tests}.mjs`
flips 8 of 12 sampled real runs (across both arms, every Skailr version, and
one dual-mode implementation the old probe also couldn't reach) from
`solved=false` to `solved=true`, while correctly leaving the 4 runs that were
independently known to be wall-clock-killed or broken-before-finishing still
`solved=false` — see the audit doc for the full before/after table. Treat the
"reproducible gap in the multi-workstream pipeline" framing as retired: both
arms could build this feature; the benchmark just couldn't see it.

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

## Skailr 1.15.0: what changed

The lean pass (`IMPROVEMENT-BACKLOG.md` L-1..L-7, full mechanism trace in the
top-of-page note) touches per-dispatch bookkeeping overhead and `/yolo`/`/patch`
verification proportionality — nothing in the validate→fix-loop or
phase-tracking enforcement hooks that 1.14.0 added. `program-rbac`'s repeated
failure traces to those enforcement mechanisms doing their job correctly against
a task the pipeline can't actually finish cleanly (see
[The real program-rbac finding](#the-real-program-rbac-finding)), which 1.15.0
doesn't touch — consistent with the unchanged 7th-for-7th result below. Full
change list: [CHANGELOG.md § 1.15.0](../CHANGELOG.md).

## Skailr 1.15.0 real campaign: what we found

One real campaign, `20260809T170839Z-series_1`, run via
`bench/docker-run.sh --smoke --skailr-ref v1.15.0`, all 3 tasks × both arms × 1
rep, sequential, real spend (~$26.40 total across all 6 runs, `cost_reported_usd`
summed). `skailr_sha` on both skailr-arm runs is
`494d1f913283b39bce9e1677c44cf2bbb2d15848`, which matches `git rev-parse v1.15.0`
exactly. Local-only, gitignored, not committed — see
[Raw run index](#raw-run-index) for per-run paths. Like the 2026-08-09 1.14.0
campaign, this campaign's own generated `SUMMARY.md`/`report.md` mislabels
`Runs: 8` (the same uncorrected results-directory-pollution bug — see
[Caveats](#caveats)); every number below was read from the 6 real runs'
`run.json`/`grader.json` by hand, bypassing that aggregate.

### `patch-webhook`: the predicted win, observed

This is the one task where the campaign matches the prediction cleanly. Skailr
solved it (95.0, tied vanilla exactly) with 37 tool calls — same as this
campaign's vanilla run, down from 81 on the last real 1.14.0 attempt — and beat
vanilla on both wall time (273.5s vs 364.9s) and cost ($0.83 vs $0.96 reported).
`skailr_diagnostics.agents_spawned` reads `0` on this run. This is the first time
in any real campaign on this page that the skailr arm has beaten vanilla on
wall-clock time.

### `feature-api-keys`: an unpredicted regression

1.14.0 solved this task cleanly, twice (92.5 both runs). The single 1.15.0 run
**failed** at 87.05 — one hidden test miss (`hf-authenticate-with-api-key`,
`status=403`: authenticating a request with an API key doesn't actually work)
and one security-subscore miss (`sec-create-missing-name-handled`,
`status=201`: creating a key with a missing name is accepted instead of
rejected, dropping the security subscore to 75/100). Neither failure mode
appears in any prior run of this task, on either arm. Nothing in the L-1..L-7
change list touches request-authentication or input-validation logic, so this
reads as a real functional miss on this particular run rather than a
mechanically-explained consequence of the lean pass — but n=1 means it could
also be ordinary run-to-run variance (this task's pre-1.14.0 quality range was
already 30–95). Worth a repeat run before concluding either way.

### `program-rbac`: unchanged, as expected

Seventh Skailr run in a row to fail on `invitation-single-use` and
`audit-events-emitted` — see
[The real program-rbac finding](#the-real-program-rbac-finding). Notably, this
run scored the highest of any skailr attempt on this task yet (94.0): `static`
hit 100 for the first time (every prior skailr run on this task scored 0 on
`static`), and `maintainability` hit 100. Quality went up while the same two
critical requirements still failed — a reminder that the composite quality
score and the critical-failure gate are measuring different things, and a high
quality score here does not mean the task is closer to solved.

### Cost divergence widened — a consequence of the L-5 fix, not a new bug

`cost_reported_usd` / `cost_reconstructed_usd` ratios this campaign:

| Task | Arm | Reported | Reconstructed | Ratio |
| --- | --- | --- | --- | --- |
| feature-api-keys | baseline | $0.9322 | $0.8332 | 1.12x |
| feature-api-keys | skailr | $9.7299 | $0.1460 | 66.6x |
| patch-webhook | baseline | $0.9589 | $0.8557 | 1.12x |
| patch-webhook | skailr | $0.8268 | $0.7353 | 1.12x |
| program-rbac | baseline | $1.3424 | $1.2186 | 1.10x |
| program-rbac | skailr | $12.6086 | $0.5911 | 21.3x |

Baseline stays tight at ~1.10-1.12x across every task, as it always has. Skailr
is tight too (1.12x) on the one run with no subagent activity
(`patch-webhook`, `agents_spawned: 0`), and wildly divergent (21x, 67x) on the
two runs that spawned 3 subagents each (`tool_calls` 346 and 379). That is the
cleanest within-campaign evidence yet for the standing hypothesis in
[Caveats](#caveats): `usage.by_source.subagent` reads zero, so
`cost_reconstructed_usd` structurally can't see subagent token spend, while
`cost_reported_usd` (via the L-5 `.findLast()` fix, already active for this
campaign) now correctly captures the CLI's true final cumulative
`total_cost_usd`, subagents included. **The gap is larger than any seen in the
1.14.0 campaigns (max ~7.6x there) precisely because L-5 made the reported side
more correct, not less** — 1.14.0's smaller ratios were partly an artifact of
`cost_reported_usd` itself being understated by the first-not-last bug L-5
fixed. `usage.by_source.subagent` itself is still unfixed (L-6, informational,
no sound fix identified) and remains the thing to watch.

## Caveats

- **n is small everywhere.** Program-rbac's pre-1.14.0 cost range ($2.79–$7.87)
  and feature-api-keys' quality range (30–95) are both wider than most of the
  deltas on this page. Don't treat single-digit percentage differences as
  signal.
- **The pre-1.14.0 column is not one version.** It blends three different
  commits across the 1.13.0→1.14.0 development window (see the table above).
- **Vanilla Claude Code is n=1 per task in the headline tables, n=2-3 across all
  campaigns on this page.** The headline tables use the most recent 2026-08-09
  baseline runs (the same-day campaign alongside 1.15.0). Two earlier vanilla
  campaigns exist — the first working-baseline campaign (also 2026-08-09, run
  alongside 1.14.0) and the original
  ([bench/benchmarks/20260807T213205Z-series_1](../bench/benchmarks/20260807T213205Z-series_1/SUMMARY.md)),
  a different harness era whose Skailr-arm numbers are retracted (broken
  headless-mode self-routing invocation, unrelated to this page's pre-1.14.0
  column, which comes from local Docker runs using corrected prompts) — see
  [RETRACTED.md](../bench/benchmarks/20260807T213205Z-series_1/RETRACTED.md).
  Its baseline-arm numbers were never retracted and are retained for provenance
  in the [Raw run index](#raw-run-index). All available vanilla runs are listed
  there; only the newest per task feeds the headline tables.
- **Cost figures are `cost_reported_usd`**, not `cost_reconstructed_usd`, and
  the two diverge a lot more on the Skailr arm than the baseline arm: baseline
  runs are close (ratio ~1.1x), Skailr runs are not — and the gap has gotten
  *bigger* release over release, not smaller. The 2026-08-08 `program-rbac` run:
  reported $14.81 vs. reconstructed $1.96 (~7.6x). The 2026-08-09 1.14.0
  campaign: baseline 1.10x–1.14x on all three tasks, skailr 1.9x
  (`patch-webhook`), 4.9x (`feature-api-keys`), 6.9x (`program-rbac`). The
  2026-08-09 **1.15.0** campaign: baseline still 1.10x-1.12x, skailr 1.12x on
  the one run with no subagents (`patch-webhook`) and **21.3x–66.6x** on the
  two runs that spawned subagents (`program-rbac`, `feature-api-keys`) — see
  [Skailr 1.15.0 real campaign: what we found](#skailr-1150-real-campaign-what-we-found)
  for the full table and why this is L-5's `.findLast()` fix making
  `cost_reported_usd` *more* correct, not a new bug. Root cause, not resolved
  in the harness: `usage.by_source.subagent` reads **all zeros** even on runs
  with hundreds of subagent-tagged tool calls (e.g. the 2026-08-09 1.14.0
  `program-rbac` skailr run: 1124 `subagent_type` events, 776
  `parent_tool_use_id`-tagged tool calls, all attributed zero tokens). So
  subagent token usage is never counted into `cost_reconstructed_usd`, while
  `cost_reported_usd` (the CLI's own `total_cost_usd`) always includes it —
  the divergence tracks how much subagent work a run did, not a Skailr version
  effect.
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
- **The 1.15.0 column is n=1 per task**, both arms, from one 2026-08-09
  campaign (`20260809T170839Z-series_1`) — the smallest sample of any column on
  this page. Treat the `patch-webhook` win and the `feature-api-keys` regression
  both as leads pending a repeat run, not settled results. Note there are now
  **two different real campaigns both dated 2026-08-09** on this page — one
  paired with 1.14.0 (`20260809T023850Z-series_1`), one paired with 1.15.0
  (`20260809T170839Z-series_1`) — distinguished by label/series throughout, not
  by date alone.
- **Results directories are not campaign-scoped, so generated campaign reports
  can be polluted — read `run.json` directly.** Every local run, mock
  (`BENCH_MOCK`) or real, from every commit ever tested on the machine, lands in
  one flat `bench-docker-out/results/<task>_<arm>_rep<N>_<hash>/` namespace, and
  `publish-campaign.mjs` aggregates by walking that whole tree
  (`listRunRecords` in `bench/src/aggregate.mjs` recurses and takes *every*
  `run.json` it finds, then groups by task/arm). Each `run.json` does carry an
  `identity.series_id`, but nothing filters on it, and mock runs are not marked
  in a way the aggregator excludes. This bit **both** 2026-08-09 campaigns: each
  one's own generated `SUMMARY.md`/`report.md` reports **`Runs: 8`** for a
  3-task × 2-arm × 1-rep smoke campaign that produced exactly **6** runs, having
  silently mixed in 2 stale directories from a prior run (real, real-but-older,
  or mock, depending on what happened to be sitting in `results/` at the time).
  **Every 2026-08-09 number on this page — for both the 1.14.0 and the 1.15.0
  campaign — was taken by hand-verifying each of the 6 real runs'
  `run.json`/`grader.json` individually, bypassing that aggregate** — as should
  be done for any campaign until the harness gains run provenance. Still not
  fixed as of 1.15.0; tracked in
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

**1.15.0 real campaign — both arms real** (`20260809T170839Z-series_1`,
`series_1355e0a7d637`; local-only, not committed —
`bench-docker-out/results/<run_id>/run.json`). Each row was read directly from
that run's `run.json`/`grader.json`, not from the campaign's own (polluted,
`Runs: 8`) aggregate — see [Caveats](#caveats):

| Task | Arm | run_id | skailr_sha | solved | quality | cost (reported) | cost (reconstructed) | wall (s) | tool calls | critical failures |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| feature-api-keys | baseline | `feature-api-keys_baseline_rep0_3dce128372` | n/a | true | 94.00 | $0.9322 | $0.8332 | 349.8 | 43 | — |
| feature-api-keys | skailr | `feature-api-keys_skailr_rep0_72b42ecd07` | `494d1f91` | false | 87.05 | $9.7299 | $0.1460 | 2700.9 | 346 | none (hidden-test miss: `hf-authenticate-with-api-key`) |
| patch-webhook | baseline | `patch-webhook_baseline_rep0_7da59f27f7` | n/a | true | 95.00 | $0.9589 | $0.8557 | 364.9 | 37 | — |
| patch-webhook | skailr | `patch-webhook_skailr_rep0_305187a1b1` | `494d1f91` | true | 95.00 | $0.8268 | $0.7353 | 273.5 | 37 | — |
| program-rbac | baseline | `program-rbac_baseline_rep0_f64b957a86` | n/a | false | 88.25 | $1.3424 | $1.2186 | 505.95 | 44 | `invitation-single-use`, `audit-events-emitted` |
| program-rbac | skailr | `program-rbac_skailr_rep0_e72ca38f75` | `494d1f91` | false | 94.00 | $12.6086 | $0.5911 | 3620.4 | 379 | `invitation-single-use`, `audit-events-emitted` |

Full skailr-arm sha on both: `494d1f913283b39bce9e1677c44cf2bbb2d15848`
(`git rev-parse v1.15.0`). Total real spend across all 6 runs (`cost_reported_usd`
summed): ~$26.40, well under the campaign's `--max-campaign-usd 250` guard (raised
from the harness default of 100 to clear this campaign's $230 worst-case ceiling —
`program-rbac`'s and `feature-api-keys`' per-task `max_budget_usd` overrides of $50
each, × 2 arms, dominate that ceiling; actual spend landed far below it, consistent
with every prior campaign on this page).
