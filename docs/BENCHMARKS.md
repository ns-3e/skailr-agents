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
| **Vanilla Claude Code** | Plain `claude` CLI, no Skailr installed | Yes — 1 real run per task |
| **Skailr — pre-1.14.0** | Skailr installed at post-1.13.0 development commits (`1380bcf`, `3851750`, `36d3b02` — all dated 2026-08-07/08, after the `v1.13.0` tag but before `v1.14.0`) | Yes — 3–4 real runs per task |
| **Skailr 1.14.0** | The current release | **Not yet independently benchmarked** — see [Skailr 1.14.0: what changed](#skailr-1140-what-changed) |

The "pre-1.14.0" column is not a single tagged release — it's every real dev-build
run available locally as of this writing, spanning the period where 1.13.0's
five orchestrator-efficiency fixes landed but before 1.14.0's hooks-loading fix.
1.14.0 has not been run through the bench harness yet; running it is the natural
next step (see [Filling the 1.14.0 gap](#filling-the-1140-gap)).

## Headline table

Cost is `cost_reported_usd` (what the CLI actually reported spending).
Quality is Skailr Bench's 0–100 composite grader score. n=1 cells have no
median/spread to report — treat as a single data point, not a distribution.

### `feature-api-keys` (class: cross-cutting — add org-scoped API keys with security requirements)

| | Vanilla Claude Code (n=1) | Skailr — pre-1.14.0 (n=4) |
| --- | --- | --- |
| Solved | ✅ (100%) | 3/4 (75%) |
| Quality (median) | 94.0 | 92.0 (range 30–95; one run failed all 4 security checks) |
| Cost | $1.23 | $6.59 median (range $0.41–$10.44) |
| Wall time | 424s | 2765s median (range 2678–4094s) |

[Raw runs →](#raw-run-index)

### `program-rbac` (class: program — multi-workstream org invitations + RBAC)

| | Vanilla Claude Code (n=1) | Skailr — pre-1.14.0 (n=4) |
| --- | --- | --- |
| Solved | ❌ (0%) | 0/4 (0%) |
| Quality (median) | 88.25 | 87.9 (range 23.5–89.0) |
| Cost | $1.48 | $4.60 median (range $2.79–$7.87) |
| Wall time | 450s | 3921s median (range 2477–5752s) |

Every single Skailr run on this task — pre-fix and post-fix alike, 4 for 4 —
fails the exact same two critical requirements: `invitation-single-use` and
`audit-events-emitted`. That's a reproducible capability gap, not noise. See
[The real program-rbac finding](#the-real-program-rbac-finding).

[Raw runs →](#raw-run-index)

### `patch-webhook` (class: patch — fix a duplicate-webhook-processing bug)

| | Vanilla Claude Code (n=1) | Skailr — pre-1.14.0 (n=1) |
| --- | --- | --- |
| Solved | ✅ (100%) | ❌ (0%) |
| Quality | 95.0 | 80.0 |
| Cost | $0.46 | $0.45 |
| Wall time | 132s | 281s |

**This cell is the weakest data on this page.** The one available Skailr run
predates the task-prompt fix that hard-codes `/patch` in the prompt (see
[bench/README.md → Known issues](../bench/README.md#known-issues)) — it ran
as a plain-language ask and bypassed `/patch`'s mandated engineer-dispatch
discipline entirely. Don't read anything into this number until it's re-run
against the corrected prompt.

## The real program-rbac finding

The interesting result on this page isn't an efficiency number — it's that
**all four independent Skailr attempts at `program-rbac`, across two different
sets of orchestrator-efficiency fixes, failed the identical two critical
requirements.** That rules out "unlucky variance" as the explanation and
points at a real, reproducible capability gap in how the multi-workstream
pipeline handles invitation single-use enforcement and audit-event emission
when they cross workstream boundaries. Also true in every one of those four
runs: the program-validator's real verdict was **DO NOT SHIP** (real blocking
findings — in the most recent run, a governance violation where a frozen
kernel surface changed off-process, failing `check-ownership.mjs`) — and that
verdict was never acted on, because the Stop hook meant to enforce a fix round
couldn't fire in any pre-1.14.0 run. That's exactly the mechanism 1.14.0 was
built to fix.

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

Because both fixes are enforcement/reliability mechanisms rather than changes
to what the engineering agents produce, the honest expectation is: **no
change** to quality/solve-rate on tasks that don't hit a blocking finding, and
a **real fix** on tasks that do — like `program-rbac`, where the fix-and-reverify
round that never happened before now should. That's a testable prediction,
not yet a measured result.

## Filling the 1.14.0 gap

The natural next step is a real campaign at the 1.14.0 tag — same three
tasks, corrected `/patch`/`/yolo`/`/yolo-program` prompts (already fixed),
several reps per task to get past single-run noise. That's real spend
(roughly $5–50/task depending on class, per `bench/tasks/*.yaml`'s
`limits`) and wasn't run as part of cutting this release; ask if you want it
kicked off.

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
  gap in reconstruction, not a real 3–5x pricing difference. Open question in
  the harness, not resolved on this page.

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
