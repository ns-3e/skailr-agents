# Skailr Bench

A self-contained A/B benchmark harness: same task + fixture + model + Claude
Code version + limits → **Arm A** (baseline Claude Code) vs **Arm B**
(Claude Code + Skailr at a pinned SHA). Answers "does Skailr's machinery pay
for its overhead, and is each release better than the last?"

V1 design: JSON files on disk, Node.js/ESM, static reports (HTML+MD+CSV). No
DB, no web dashboard, no SaaS, no external services beyond the model API.

## Overview

- `bench/config.yaml` — pinned environment (`claude_code_version`, exact
  `model` ID, `node_version`), run defaults, and the per-category pricing
  table. The harness fails fast if the live environment doesn't match.
- `bench/tasks/*.yaml` — one task definition per benchmark task (prompt,
  fixture ref, grader ref, limits, `critical_requirements`).
- `bench/fixtures/<task>/` — offline TS git repos with passing visible
  tests. <!-- TODO(WS-fixtures): populate patch-webhook, feature-api-keys, program-rbac -->
- `bench/graders/<task>/` — hidden tests + `rubric.yaml` + `grade.mjs`
  entrypoint, kept outside/unreachable from fixtures.
  <!-- TODO(WS-graders): populate the three hidden graders -->
- `bench/src/` — the harness itself.
  <!-- TODO(WS-harness-core): run.mjs, claude.mjs, telemetry.mjs -->
  <!-- TODO(WS-grade-analytics): grade.mjs, aggregate.mjs, report.mjs, verify-isolation.mjs -->
- `bench/results/` — gitignored, per-run output (`run.json` + artifacts).
- `bench/results-synthetic/` — committed two-version synthetic campaign
  datasets that drive `bench:compare`/`bench:report` deterministically.
  <!-- TODO(WS-grade-analytics): populate synthetic campaigns -->

## Quickstart

```bash
cd bench
npm ci

# Run a campaign: N repetitions of a task across both arms.
npm run bench -- --task patch-webhook --reps 5

# Grade a completed (frozen) campaign's runs.
npm run bench:grade

# Aggregate + compare two series/versions, emit MD+HTML+CSV + promotion verdict.
npm run bench:compare -- --baseline <series_id_a> --candidate <series_id_b>

# Ad-hoc report over already-graded results.
npm run bench:report

# Assert the isolation invariant: no grader path reachable from any fixture.
npm run bench:verify-isolation

# Kernel unit tests (schema/lib) — zero external deps, node:test only.
npm test
```

Mock/dry-run mode (`bench/src/lib/mock.mjs`) lets the whole
run→grade→aggregate→report pipeline execute with zero model spend — this is
how AC-1/2/4/5/6/7 are exercised in CI before any real campaign runs.

## Architecture

```
config.yaml ──┐                                      ┌─→ grade.mjs ─→ aggregate.mjs ─→ report.mjs
              ├─→ run.mjs ─→ claude.mjs / telemetry.mjs ─→ run.json ─┘
tasks/*.yaml ─┘        │
                        └─→ installArm(arm, ref, workspace)  (baseline=no-op | skailr=pinned pack)
```

Every consumer reads/writes contract-shaped JSON validated against
`bench/src/schema/*.schema.json` (byte-equivalent to
`.claude/program/contracts/*.schema.json`) via `bench/src/schema/validate.mjs`.
Shared computations (`series_id`/`run_id` derivation, per-category cost
reconstruction, fs/immutability helpers, the mock generator) live in
`bench/src/lib/**` and are imported by every downstream `.mjs`.

<!-- TODO(WS-harness-core): document the actual FR-4 run lifecycle stages once run.mjs lands -->
<!-- TODO(WS-grade-analytics): document aggregation/report internals once they land -->

## Adding a task

1. Author `bench/fixtures/<task-id>/` — offline TS git repo, passing visible
   tests, a `fixture.manifest.json` per the `fixture-layout` contract, commit
   it, and record the snapshot SHA.
2. Author `bench/graders/<task-id>/` — hidden tests + `rubric.yaml` +
   `grade.mjs` entrypoint emitting `grader.json` per the `grader-json`
   contract. Must NOT be path-reachable from the fixture.
3. Author `bench/tasks/<task-id>.yaml` per the `task-config` contract:
   `id`, `version`, `class`, `fixture`, `fixture_sha`, `grader`, `prompt`
   (byte-identical across arms), `limits`, `setup`, `critical_requirements`
   (shared ID vocabulary with the fixture manifest and grader output).
4. Run `npm run bench:verify-isolation` — must stay green.

## Reading reports

`bench:compare` emits MD + HTML + CSV: headline solve-rate/quality/cost
table, KPI deltas with bootstrap confidence intervals, Pareto view
(quality-as-objective, efficiency-as-constraint), bottleneck diagnostics
(cost by agent role, failure-stage breakdown, Skailr funnel metrics), and a
promotion verdict. Cross-`series_id` comparisons render a warning banner —
see "series_id" below.

<!-- TODO(WS-grade-analytics): document exact report sections/columns once report.mjs lands -->

## Decisions record

Resolved unilaterally per `.claude/program/brief.md` (YOLO discovery); see
that file for full rationale.

- **Q1 — CLI flags & OTel export.** `claude --help` verification at build
  time is authoritative, centralized in `claude.mjs`/`telemetry.mjs`. OTel
  enabled via `CLAUDE_CODE_ENABLE_TELEMETRY=1` + a per-run OTLP export;
  experiment dimensions injected via `OTEL_RESOURCE_ATTRIBUTES`.
- **Q2 — Skailr install per arm.** Single `installArm(arm, ref, workspace)`.
  `baseline` = no-op. `skailr` = `git archive`/`git clone --depth 1` of the
  skailr repo at the pinned `ref` into the workspace's `.claude/`. Never
  mutates the source repo; never copies any `bench/**` path into the
  workspace (isolation invariant).
- **Q3 — program-rbac UI checks.** No headless browser in V1. UI presence
  verified by file/component/API-level assertions only.
- **Q4 — Skailr diagnostics extraction.** Primary source: Skailr's own
  on-disk artifacts (`.claude/program/*`, `.claude/tmp/*`) copied into
  `results/<run_id>/skailr-artifacts/`. Fallback: OTel resource attributes
  (`agent.name`, `skill.name`, `skailr.version`). Baseline arm ⇒ all
  `skailr_diagnostics` fields null.
- **Exact model IDs only.** `config.yaml` `model` must be an exact, dated
  Anthropic model ID (regex: ends in an 8-digit snapshot date, e.g.
  `claude-sonnet-4-5-20250929`). Floating aliases (`sonnet`, `latest`) are
  refused at config-load time — see `bench/src/lib/config.mjs`.
- **series_id.** Deterministic hash over `(claude_code_version, model_id)`
  (`bench/src/lib/ids.mjs`). Either changing forks the series (AC-7);
  cross-series `bench:compare` output must render a warning banner.
- **Cost reconstruction tolerance (AC-6).** Reconstructed cost is always
  Σ(tokens_category × rate_category) — never `total_tokens × rate`
  (`bench/src/lib/pricing.mjs`). Both `cost_reported_usd` (from stream-json
  `result.total_cost_usd`) and `cost_reconstructed_usd` are stored in
  `run.json` alongside `pricing_table_version`, so drift is always visible.
  Numeric tolerance band: **not yet set** — no real (non-mock) sample has
  been run against a live model yet. Placeholder guidance: treat a delta
  ≤5% of `cost_reported_usd` as expected float/rounding noise; anything
  larger should be investigated before trusting `cost_reconstructed_usd` for
  a comparison. Revise this number the first time a real campaign runs.
- **Package manager.** npm with committed lockfiles (`package-lock.json`) in
  the harness and in each fixture.
- **Test runner.** Built-in `node:test` + `node:assert` everywhere in
  `bench/`, zero external deps, unless a fixture demonstrably needs
  otherwise (documented there if so).
- **Mock/dry-run mode.** `bench/src/lib/mock.mjs` generates canned
  stream-json events + telemetry records for `solved` and `planted-defect`
  flavors (plus `timeout`/`crash` bonus flavors for AC-2), all schema-valid
  against `mock-streamjson.schema.json`.
- **Synthetic campaigns.** `bench/results-synthetic/` (WS-grade-analytics)
  commits pre-baked two-version `run.json` sets so `bench:compare`/
  aggregation/verdict/CI-overlap paths are provable without live spend.

## Kernel test results

`node --test` (56 tests, `bench/src/schema/*.test.mjs` +
`bench/src/lib/*.test.mjs`): all passing as of the kernel freeze. Re-run
`npm test` from `bench/` to reproduce.
