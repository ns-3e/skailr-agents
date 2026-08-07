# Skailr Bench

A self-contained A/B benchmark harness. Same task + fixture + model + Claude
Code version + limits → **Arm A** (baseline Claude Code) vs **Arm B** (Claude
Code + Skailr installed at a pinned git ref). It answers one question: *does
Skailr's machinery pay for its overhead, and is each release better than the
last?*

V1 design philosophy: **JSON files on disk, Node.js/ESM (`.mjs`), static
reports (HTML + MD + CSV).** No database, no web dashboard, no SaaS, no
external services beyond the Anthropic model API. Schemas are kept clean enough
to migrate to DuckDB/SQLite later (not built — see [V2 / not yet built](#v2--not-yet-built)).

> ⚠️ **Read [Security](#-security) before running a real (non-mock) campaign.**
> The real run path invokes Claude Code headless with
> `--dangerously-skip-permissions` against a throwaway workspace on the host,
> with **no container sandbox**. Use mock mode (below) for everything that
> doesn't need live model output.

## Overview

- **Two arms, one difference.** Prompt, fixture, model, Claude Code version and
  limits are byte-identical across arms. The *only* variable is whether the
  Skailr pack is installed into the agent's workspace. `baseline` installs
  nothing; `skailr` materializes the pack at a pinned ref.
- **Hidden external grading.** Correctness is decided by graders that run
  *outside* the agent's workspace and are never path-reachable from it. The
  agent's own final message never decides `solved`.
- **Everything reconstructable from disk.** Each run emits a schema-validated
  `run.json` plus a full artifact set. Reports are generated statically from
  those files; nothing is stored in a service.

## Requirements

- **Node 22+** (`engines.node >= 22`; harness uses `node:test`, `node:assert`
  and other stdlib only).
- **git** (fixture checkout + `installArm` uses `git archive`).
- **Claude Code** — pinned to `claude_code_version` in `config.yaml` (verified
  `2.1.224`). Only needed for *real* runs; mock mode needs no CLI and no spend.
- **Zero runtime npm dependencies.** `package.json` `dependencies` and
  `devDependencies` are both empty. `npm ci` exists only to honor committed
  lockfiles; there is nothing to download for the harness itself.

## Quickstart (mock mode — no model spend)

Mock mode drives the entire `run → grade → aggregate → report` pipeline with
canned `stream-json` + telemetry, so you can exercise everything without a
Claude Code install or a dollar of spend. **Start here.** All acceptance
criteria in V1 are proven this way (see [What is / isn't proven](#what-is--isnt-proven)).

```bash
cd bench
npm ci                                  # honors lockfile; nothing to download

# Run a mock campaign: patch-webhook, both arms, 5 reps each (10 runs).
BENCH_MOCK=1 npm run bench -- --task patch-webhook --reps 5

# Compare two committed synthetic campaigns → MD + HTML + CSV + promotion verdict.
npm run bench:compare v1.11.0 v1.12.0

# Single-campaign report over already-graded results.
npm run bench:report -- --campaign v1.12.0

# Assert the isolation invariant (no grader path reachable from any fixture).
npm run bench:verify-isolation

# Kernel + harness unit tests (node:test only, zero external deps).
npm test
```

`bench:compare`/`bench:report` need no model spend at all — they read the
committed `results-synthetic/` datasets. `BENCH_MOCK=1` is the switch for
`bench` (the campaign runner); set it via env, as above.

## CLI reference (FR-11)

Every command below is wired in `package.json` `scripts`. Pass flags after `--`
so npm forwards them.

### `npm run bench` — run a campaign (`src/run.mjs`)

| Flag | Meaning | Default |
|---|---|---|
| `--task <id>` | task to run (`patch-webhook`, `feature-api-keys`, `program-rbac`) | all tasks in `tasks/` if omitted |
| `--variant baseline\|skailr` | run a single arm | both arms |
| `--skailr-ref <git-ref>` | ref the `skailr` arm installs from | — |
| `--reps <n>` | repetitions per arm | `config.defaults.repetitions` (5) |
| `--smoke` | force 1 rep (fast pipeline check) | off |
| `--max-campaign-usd <n>` | cost guard: refuse if worst-case spend (Σ per-run `max_budget_usd` × arms × reps) exceeds this | `100` |
| `--parallel <n>` | run N runs concurrently | `1` (sequential) |

Set `BENCH_MOCK=1` in the environment for a spend-free run. In real mode the
harness fails fast if live `claude --version` / `node --version` don't match
`config.yaml`.

### `npm run bench:grade -- --run <run_id>` — re-grade (`src/grade.mjs`)

Re-runs the grader against an **already-completed, frozen** run and writes
`grader.v2.json` (+ `run.v2.json`). It **never invokes the agent** — no burned
spend on grader iteration — and never overwrites the original `grader.json`.
Optional: `--workspace <path>`, `--grader-dir <path>`, `--results-dir <path>`.
The run's frozen workspace is persisted at `results/<run_id>/workspace/`, so
`--run <id>` works with no extra flags.

### `npm run bench:compare <ref-A> <ref-B>` — version comparison (`src/report.mjs compare`)

Aggregates two campaigns and emits MD + HTML + CSV with a promotion verdict.
`ref-A`/`ref-B` may be bare labels (resolved under `results-synthetic/`, then
`results/`) or paths. A bogus ref exits non-zero with `campaign not found`.

### `npm run bench:report -- --campaign <id>` — single-campaign report (`src/report.mjs`)

Headline + KPIs + diagnostics for one campaign; no comparison or verdict.

### `npm run bench:verify-isolation` — isolation invariant (`src/verify-isolation.mjs`)

Asserts no grader path is reachable from any fixture. Optional positional
`<fixturesRoot> <gradersRoot>` (default `bench/fixtures`, `bench/graders`).

### `npm test` — `node --test`

Kernel + harness unit tests, `node:test`/`node:assert` only. ~188 tests pass on
a clean tree; after a real campaign `node --test` also discovers the fixtures'
visible tests inside persisted `results/<id>/workspace/` snapshots (also green).

## Running real campaigns in CI (self-hosted)

Real (non-mock) runs launch Claude Code headless with `--dangerously-skip-permissions`,
which the CLI refuses under root — so they can't run in the default root container.
The [`bench-smoke` workflow](../.github/workflows/bench-smoke.yml)
(`workflow_dispatch`) runs a real campaign on a **self-hosted, non-root runner**
and pushes the results to `main`:

1. Runs a smoke campaign — 1 rep × all tasks × both arms (baseline + skailr@ref).
2. Runs `scripts/publish-campaign.mjs` to distill raw runs into committable
   stats/metrics under [`benchmarks/`](benchmarks/) (`SUMMARY.md`, `report.*`,
   `aggregate.json`, `meta.json`, `runs/<run_id>.json`).
3. Commits + pushes the campaign to `main`.

**Auth is a Claude Code subscription token, not an API key:** run
`claude setup-token` on an authenticated machine and store the value as the repo
secret `CLAUDE_CODE_OAUTH_TOKEN` (or `claude login` on the runner). Inputs let
you set `skailr_ref` (default `HEAD` = latest `main`), `reps`, and
`max_campaign_usd`. Runner must have Node 22 + a matching `claude` CLI on PATH
and must **not** run as root.

To publish a campaign you ran elsewhere: `node scripts/publish-campaign.mjs
--results-dir <dir>` writes into `benchmarks/<timestamp>-<series>/`.

## Architecture

### Tree

```
bench/
  config.yaml            pinned env + defaults + per-category pricing table (FR-1)
  package.json           the 5 FR-11 scripts; zero deps
  tasks/*.yaml           one per task: prompt, fixture ref, grader ref, limits,
                         critical_requirements  (patch-webhook, feature-api-keys, program-rbac)
  fixtures/<task>/       offline TS repos (plain files + .fixture-sha + fixture.manifest.json),
                         passing visible tests
  graders/<task>/        hidden-tests + rubric.yaml + grade.mjs (+ lib/) — kept
                         OUTSIDE and unreachable from fixtures
  src/
    run.mjs              campaign orchestration + per-run lifecycle (FR-4)
    claude.mjs           headless Claude Code invocation + mock (FR-5, Q1)
    telemetry.mjs        OTel env + stream-json usage parse (FR-6, Q1)
    grade.mjs            grader exec + score fold + re-grade (FR-8)
    aggregate.mjs        median/P25/P75/solve-rate/bootstrap-CI (FR-9)
    report.mjs           compare + verdict + Pareto + diagnostics (FR-10)
    verify-isolation.mjs isolation invariant checker (NFR)
    lib/                 ids, config, pricing, fsutil, yaml, mock (shared, imported everywhere)
    schema/*.schema.json byte-equivalent to .claude/program/contracts/*.schema.json
    schema/validate.mjs  the single validator every consumer calls
  results/               gitignored — per-run output (run.json + artifacts + workspace snapshot)
  results-synthetic/     committed campaigns: v1.11.0, v1.12.0 (same series),
                         cross-series-v2 (different series) — drive compare/report deterministically
```

### Run lifecycle (FR-4 stages, in order, logged to `lifecycle.log`)

`clean-fixture+checkout` → `setup` → `install-arm` → `launch-claude` →
(`terminate:<reason>` if killed) → `visible-tests` → `freeze-workspace` →
`extract-skailr-diagnostics` → `run-grader` → `capture-diff` →
`persist-workspace-snapshot` → `write-run-json` → `mark-immutable`.

Fixtures ship as **plain files** (nested `.git` removed) with a `.fixture-sha`.
Checkout copies the fixture into an isolated temp workspace, verifies
`.fixture-sha == task.fixture_sha` (hard error on mismatch), then
`git init` + baseline commit so `capture-diff` has a base. Completed run dirs
are read-only by convention; killed/crashed/timed-out runs are still graded and
recorded with a `termination_reason`, never silently dropped.

### FR-5 artifact set (per run dir)

`run.json`, `result.json`, `events.jsonl`, `otel/telemetry.json`, `git.diff`,
`stdout.log`, `stderr.log`, `grader.json`, `environment.json`, `lifecycle.log`,
and `workspace/` (frozen snapshot, `.git` excluded). The `skailr` arm also gets
`skailr-artifacts/`.

### Isolation model

Graders are never copied into or made path-reachable from the agent workspace.
`installArm` never ships any `bench/**` path. `bench:verify-isolation` proves
0 leaks across all fixtures and is CI-runnable.

### Arms + `installArm(arm, ref, workspace)`

- `baseline` — no-op (nothing installed).
- `skailr` — `git archive` an **allowlist** of the pack at the pinned `ref`
  into the workspace's `.claude/` (see [Q2](#decisions-record)). Resolves
  ref→sha, is idempotent, never mutates the source repo, and returns the exact
  `installed_paths` set (used to floor diagnostics — see Q4).

### Telemetry (FR-6, Q1)

`launch-claude` sets `CLAUDE_CODE_ENABLE_TELEMETRY=1`,
`OTEL_METRICS_EXPORTER=otlp`, `OTEL_LOGS_EXPORTER=otlp` and
`OTEL_RESOURCE_ATTRIBUTES` carrying `bench.task`, `bench.arm`, `bench.run_id`,
`skailr.version`. **Primary** token/cost source is the `stream-json`
`result.usage` block; OTel is a best-effort resilience path (wired but not yet
validated against a live collector — no real invocation has run). See
[What is / isn't proven](#what-is--isnt-proven).

## Adding a task / fixture / grader

Three seams, all contract-shaped:

1. **Fixture** — `bench/fixtures/<task-id>/`: an offline TS repo with passing
   visible tests, a `fixture.manifest.json` per the `fixture-layout` contract,
   plain files (no nested `.git`), and a `.fixture-sha` recording the snapshot.
   `fixture_sha` snapshots work over plain files: the harness verifies
   `.fixture-sha == task.fixture_sha` on checkout and refuses on mismatch.
2. **Grader** — `bench/graders/<task-id>/`: hidden tests + `rubric.yaml` +
   `grade.mjs`. Invoked as `node <graderDir>/grade.mjs <frozenWorkspaceAbs>`
   with cwd=graderDir; it prints **one** `grader.json` to STDOUT and exits 0.
   Output must satisfy the `grader-json` contract. It must **not** be
   path-reachable from the fixture.
3. **Task** — `bench/tasks/<task-id>.yaml` per the `task-config` contract:
   `id`, `version`, `class`, `fixture`, `fixture_sha`, `grader`, `prompt`
   (byte-identical across arms — block scalars preserved), `limits`, `setup`,
   `critical_requirements`.
4. Run `npm run bench:verify-isolation` — must stay green.

**`critical_requirements` vocabulary** is a shared ID set across the task YAML,
the fixture manifest, and the grader output. `solved = (hidden functional tests
pass) AND (zero critical_requirements failures)`. Any critical failure ⇒
`solved=false` regardless of quality score.

## Reading reports

`bench:compare` emits MD + HTML + CSV with these sections:

- **Headline Table** — one row per (task, arm, version): solve rate, quality,
  cost, wall time.
- **Top KPIs** — per-arm aggregates across tasks with **bootstrap confidence
  intervals**; deltas report **CI overlap** so you can see whether a difference
  is distinguishable from noise.
- **Promotion Verdict** — `ACCEPT` / `REJECT` / `INCONCLUSIVE`. **ACCEPT rule
  (all four must hold):** (1) solve rate not regressed (`B ≥ A`); (2) median
  quality floor (`B ≥ A − 1`); (3) no task-class quality regression `> 5`;
  (4) improved *something* (cost/solve, wall/solve, solve rate, or quality).
  Otherwise REJECT. INCONCLUSIVE when no task matches under the `skailr` arm.
- **Pareto Frontier** — quality-as-objective, cost/solve-as-constraint, across
  all stored sibling versions.
- **Diagnostics** — cost by agent role, failure-stage breakdown, Skailr funnel
  metrics — everything derivable from `run.json` fields.
- **Cross-series warning banner** — comparing two campaigns with different
  `series_id` renders a prominent WARNING banner (see [series_id](#series_id)).

## Decisions record

Resolved unilaterally per `.claude/program/brief.md` (YOLO discovery). Verified
against the shipped code below.

- **Q1 — CLI flags & OTel.** Flag handling is centralized in `claude.mjs`
  (nowhere else hardcodes a flag), verified against `claude --help` v2.1.224 on
  2026-08-07. Real flags used: `-p`/`--print`, `--model <exact-id>`,
  `--output-format stream-json`, `--max-budget-usd <amount>`,
  `--session-id <uuid>`, `--dangerously-skip-permissions`; the prompt is a
  positional argv element (spawn, no shell — no injection risk). OTel via the
  env vars listed under [Telemetry](#telemetry-fr-6-q1).
  **Drift from the brief's assumed flag set:** the brief assumed a `--max-turns`
  cap; **no such flag exists** in this CLI version. Turn limiting is therefore
  *not* flag-enforced — the only hard controls are `--max-budget-usd` (native)
  and the harness's wall-clock timeout (SIGTERM→SIGKILL). `termination_reason:
  "turns"` is a post-hoc heuristic (final `num_turns ≥ config max_turns`), not a
  live-enforced cut. `config.defaults.max_turns` is recorded but not enforced by
  the CLI.
- **Q2 — Skailr install per arm.** Single `installArm(arm, ref, workspace)`.
  `baseline` = no-op. `skailr` = `git archive` at the pinned ref of an
  **allowlist mirroring `install.sh`** (authoritative): root `CLAUDE.md`;
  `scripts/skailr`, `scripts/hooks`; `.claude/{agents,commands,teams/registry.md,
  skills,program/schemas,settings.skailr.json,intake.md,model-routing.json}`;
  the template channel files; plus empty `.claude/{tmp,program,repo}`. It
  **never** ships `.claude/experts/`, `bench/**`, or the source repo's program
  runtime (ledger/brief/plan/contracts/workstreams). The shipped set equals
  install.sh's set. Never mutates the source repo.
- **Q3 — program-rbac UI checks.** No headless browser in V1. UI presence is
  verified by file/component/API-level assertions only (route/handler exists,
  component mounted, API wired). Accepted V1 limitation.
- **Q4 — Skailr diagnostics.** Primary source: Skailr's own **net-new** on-disk
  artifacts under `.claude/program`/`.claude/tmp` in the workspace, **excluding**
  the `installed_paths` shipped by `installArm` (so shipped pack docs never
  count as agent signal). Fallback: OTel resource attributes (`agent.name`,
  `skill.name`, `skailr.version`). Baseline arm ⇒ all `skailr_diagnostics`
  fields null.
- **Exact model IDs only.** `config.yaml` `model` must be an exact, dated
  Anthropic model ID (ends in an 8-digit snapshot date, e.g.
  `claude-sonnet-4-5-20250929`). Floating aliases (`sonnet`, `latest`) are
  refused at config load (`src/lib/config.mjs`).
- **Package manager.** npm with committed lockfiles in the harness and each
  fixture.
- **Test runner.** `node:test` + `node:assert` everywhere, zero external deps.
- **Mock mode.** `src/lib/mock.mjs` generates schema-valid `stream-json` +
  telemetry for `solved` and `planted-defect` flavors (plus `timeout`/`crash`
  for AC-2).

## Cost reconstruction

Both figures are stored in `run.json` alongside `pricing_table_version`, so
drift is always visible:

- `cost_reported_usd` — from `stream-json` `result.total_cost_usd`.
- `cost_reconstructed_usd` — **always** `Σ (tokens_category × rate_category)`
  per the `config.yaml` pricing table, **never** `total_tokens × a single rate`
  (`src/lib/pricing.mjs`).

**Documented tolerance = 2%**, validated on the mock sample: `mock.mjs`
deliberately makes reported cost differ from the per-category reconstruction by
`+2%` (`reported=0.014641`, `reconstructed=0.014354`, delta `2.00%`), asserted
by `mock.test.mjs`. This tolerance has **only** been validated against mock
data — no real campaign has run against a live model. Revise the band the first
time a live campaign is priced. Bump `pricing_table.version` whenever rates
change so historical runs stay attributable to the table that priced them.

## series_id

`series_id = series_<sha256("series_id/v1|<claude_code_version>|<model_id>")[:12]>`
(`src/lib/ids.mjs`). Changing **either** the Claude Code version **or** the
model ID forks the series (AC-7). `bench:compare` across two series renders a
cross-series WARNING banner in MD and HTML; those comparisons are not
apples-to-apples. `run_id = <task>_<arm>_rep<n>_<hash10>`.

## ⚠️ Security

The **real (non-mock)** run path invokes Claude Code headless with
`--dangerously-skip-permissions`. This is *necessary* for unattended
benchmarking (there is no human to approve tool prompts), and it is confined to
the real-invocation `args` in `claude.mjs` — the mock path never reaches it.

But it means the agent runs with **all permission prompts bypassed**, against a
throwaway per-run fixture workspace **on the host, with no container sandbox by
default.** Consequences:

- **Run only trusted fixtures.** A malicious fixture/task could get the agent to
  execute arbitrary commands on your machine.
- **Run in a disposable / isolated environment** (a VM, a CI runner, a
  throwaway container you launch yourself) for any real campaign.
- **`container_image` does not sandbox you in V1.** The field is recorded into
  `run.json`, but containerized execution is **not implemented** — if you set
  it, the harness **fails fast** at campaign start (`container_image set … but
  container execution is not implemented in V1; unset it or run V2`). Leave it
  `null` for V1. Isolation today rests solely on the disposable temp workspace
  + model-API-only network access.

Mock mode has none of these concerns — it spawns nothing and needs no CLI.

## What is / isn't proven

Per the brief's success criteria: AC-1 and AC-2 require *real* `claude` runs
that don't execute in CI (they'd spend real budget). V1 success = the harness
is **correct and runnable**, proven via **mock mode** + committed
**synthetic campaigns**:

- Proven in mock / synthetic: AC-1 (10 valid run dirs, full FR-5 artifact set),
  AC-2 (killed run graded + recorded with `termination_reason`), AC-3
  (0 isolation leaks), AC-4 (planted defect flips `solved=false`, quality high),
  AC-5 (compare → all sections + verdict), AC-6 (both cost fields +
  `pricing_table_version`, 2% delta), AC-7 (model change forks series + banner).
- **Not yet exercised against live spend:** the real Claude Code invocation
  (`claude.mjs` real path) and live OTel export. The real-mode code path is
  identical in shape to the mock path but has never been run against a real
  model. Treat first-real-campaign as the moment to confirm live flags, OTel
  output, and the cost tolerance band.

## V2 / not yet built

Designed-for but explicitly **not** in V1:

- SWE-bench / SWE-bench-Live suite integration.
- LLM-judged maintainability/subjective scoring (rubric hook exists; capped
  ≤15% when implemented).
- Nightly / release CI campaigns (only a documented smoke-run command exists).
- DuckDB / SQLite results store (schemas are migration-clean; the store is not
  built).
- Containerized execution (`container_image` is fail-fast today).
- Any model/provider other than Anthropic Claude via Claude Code.
