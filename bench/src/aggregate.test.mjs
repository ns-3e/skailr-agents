import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  listRunRecords,
  groupByTaskArm,
  aggregateGroup,
  aggregateCampaign,
  getCachedAggregate,
  mulberry32,
  bootstrapCI,
  bootstrapSolveRateCI,
  bootstrapMedianCI,
  median,
  percentile,
  mean,
} from "./aggregate.mjs";

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "bench-aggregate-"));
}

function tok(n) {
  return { input: n, output: n, cache_read: 0, cache_create: 0 };
}

function makeRun({ task_id, arm, rep, solved, quality_score, cost, wall_clock_s = 100, tokens = 1000 }) {
  const tokens_obj = tok(tokens);
  return {
    identity: {
      run_id: `${task_id}_${arm}_rep${rep}`,
      series_id: "series_fixed",
      task_id,
      task_version: "1",
      arm,
      skailr_sha: arm === "skailr" ? "sha123" : null,
      skailr_version: arm === "skailr" ? "1.11.0" : null,
      fixture_sha: "fixsha",
      timestamp: "2026-08-07T00:00:00Z",
    },
    environment: { claude_code_version: "2.1.224", model_id: "claude-sonnet-4-5-20250929", os: "linux", container: null, node_version: "22.22.2" },
    outcome: {
      solved,
      termination_reason: "finish",
      visible_tests: { passed: 5, failed: 0, total: 5 },
      hidden_tests: { passed: solved ? 4 : 2, failed: solved ? 0 : 2, total: 4 },
      regression: { passed: 3, failed: 0, total: 3 },
      critical_failures: [],
    },
    quality: { quality_score, subscores: { functional: quality_score, regression: 100, security: 100, static: 100, scope: 100, maintainability: 100 } },
    time: { wall_clock_s, claude_active_s: wall_clock_s * 0.8, time_to_first_edit_s: 5, grader_s: 1 },
    usage: { tokens: tokens_obj, by_model: {}, by_source: { main: tokens_obj, subagent: tok(0), auxiliary: tok(0) }, by_agent: {} },
    cost: { cost_reported_usd: cost, cost_reconstructed_usd: cost, pricing_table_version: "2026-08" },
    trajectory: { model_requests: 3, tool_calls: 5, failed_tool_calls: 0, retries: 0, compactions: 0 },
    code: { files_read: 2, files_edited: 1, lines_added: 5, lines_removed: 1, diff_bytes: 100 },
    process: { test_executions: 1, test_failures: 0, repair_loops: 0 },
    skailr_diagnostics: null,
    failure_stage: solved ? "none" : "implementation",
  };
}

function writeCampaign(dir, runs) {
  for (const run of runs) {
    const runDir = path.join(dir, run.identity.run_id);
    fs.mkdirSync(runDir, { recursive: true });
    fs.writeFileSync(path.join(runDir, "run.json"), JSON.stringify(run));
  }
}

test("listRunRecords: finds every run.json recursively", () => {
  const dir = mkTmp();
  writeCampaign(dir, [
    makeRun({ task_id: "patch-webhook", arm: "baseline", rep: 0, solved: true, quality_score: 90, cost: 0.1 }),
    makeRun({ task_id: "patch-webhook", arm: "baseline", rep: 1, solved: false, quality_score: 60, cost: 0.1 }),
  ]);
  const records = listRunRecords(dir);
  assert.equal(records.length, 2);
});

test("groupByTaskArm: groups by task_id|arm key", () => {
  const dir = mkTmp();
  writeCampaign(dir, [
    makeRun({ task_id: "patch-webhook", arm: "baseline", rep: 0, solved: true, quality_score: 90, cost: 0.1 }),
    makeRun({ task_id: "patch-webhook", arm: "skailr", rep: 0, solved: true, quality_score: 95, cost: 0.2 }),
  ]);
  const groups = groupByTaskArm(listRunRecords(dir));
  assert.equal(groups.size, 2);
  assert.ok(groups.has("patch-webhook|baseline"));
  assert.ok(groups.has("patch-webhook|skailr"));
});

test("aggregateGroup: known inputs produce expected solve rate / median quality / cost-per-solve", () => {
  const entries = [
    { record: makeRun({ task_id: "t", arm: "baseline", rep: 0, solved: true, quality_score: 80, cost: 1.0 }) },
    { record: makeRun({ task_id: "t", arm: "baseline", rep: 1, solved: true, quality_score: 90, cost: 2.0 }) },
    { record: makeRun({ task_id: "t", arm: "baseline", rep: 2, solved: false, quality_score: 40, cost: 1.0 }) },
    { record: makeRun({ task_id: "t", arm: "baseline", rep: 3, solved: true, quality_score: 100, cost: 1.0 }) },
  ];
  const g = aggregateGroup({ task_id: "t", arm: "baseline", entries });
  assert.equal(g.n, 4);
  assert.equal(g.solved_count, 3);
  assert.equal(g.solve_rate, 0.75);
  // qualities sorted: 40,80,90,100 -> median interpolated between 80 and 90 = 85
  assert.equal(g.quality.median, 85);
  // total cost = 1+2+1+1=5; solved_count=3 -> cost_per_solve = 5/3
  assert.equal(g.cost_per_solve_usd, Math.round((5 / 3) * 1e6) / 1e6);
  assert.ok(g.quality_adjusted_cost_usd > g.cost_per_solve_usd, "quality < 100 inflates quality-adjusted cost");
});

test("aggregateGroup: zero solved runs -> cost_per_solve is null, not Infinity/NaN", () => {
  const entries = [{ record: makeRun({ task_id: "t", arm: "baseline", rep: 0, solved: false, quality_score: 10, cost: 1.0 }) }];
  const g = aggregateGroup({ task_id: "t", arm: "baseline", entries });
  assert.equal(g.cost_per_solve_usd, null);
  assert.equal(g.quality_adjusted_cost_usd, null);
});

test("mulberry32 + bootstrapCI: deterministic given fixed seed", () => {
  const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  const ci1 = bootstrapCI(values, mean, { resamples: 1000, seed: 42 });
  const ci2 = bootstrapCI(values, mean, { resamples: 1000, seed: 42 });
  assert.deepEqual(ci1, ci2);
  // Different seed can differ (not required, but sanity: CI bounds are finite numbers).
  assert.ok(Number.isFinite(ci1.lo) && Number.isFinite(ci1.hi));
  assert.ok(ci1.lo <= ci1.hi);
});

test("bootstrapCI: >=1000 resamples by default and CI brackets plausible range of the data", () => {
  const values = [1, 2, 3, 4, 5];
  const ci = bootstrapCI(values, mean, { seed: 7 });
  assert.equal(ci.resamples, 1000);
  assert.ok(ci.lo >= Math.min(...values) - 1e-9);
  assert.ok(ci.hi <= Math.max(...values) + 1e-9);
});

test("bootstrapSolveRateCI / bootstrapMedianCI wrap bootstrapCI correctly", () => {
  const solved = [true, true, false, true, false];
  const ci = bootstrapSolveRateCI(solved, { seed: 1 });
  assert.ok(ci.lo >= 0 && ci.hi <= 1);
  const mci = bootstrapMedianCI([10, 20, 30], { seed: 1 });
  assert.ok(mci.lo <= mci.hi);
});

test("median/percentile/mean basic sanity", () => {
  assert.equal(median([1, 2, 3]), 2);
  assert.equal(mean([1, 2, 3]), 2);
  assert.equal(percentile([1, 2, 3, 4], 25), 1.75);
});

test("aggregateCampaign: full campaign dir groups multiple task/arm combos and records series_ids", () => {
  const dir = mkTmp();
  writeCampaign(dir, [
    makeRun({ task_id: "patch-webhook", arm: "baseline", rep: 0, solved: true, quality_score: 80, cost: 1 }),
    makeRun({ task_id: "patch-webhook", arm: "skailr", rep: 0, solved: true, quality_score: 90, cost: 1.2 }),
    makeRun({ task_id: "feature-api-keys", arm: "baseline", rep: 0, solved: false, quality_score: 50, cost: 2 }),
  ]);
  const agg = aggregateCampaign(dir);
  assert.equal(agg.n_runs, 3);
  assert.equal(agg.groups.length, 3);
  assert.deepEqual(agg.series_ids, ["series_fixed"]);
});

test("getCachedAggregate: reuses cached result when run count unchanged (reusable baseline campaign)", () => {
  const dir = mkTmp();
  writeCampaign(dir, [makeRun({ task_id: "t", arm: "baseline", rep: 0, solved: true, quality_score: 80, cost: 1 })]);
  const first = getCachedAggregate(dir);
  const cachePath = path.join(dir, ".aggregate-cache.json");
  assert.ok(fs.existsSync(cachePath));
  // Mutate the cache file directly to a sentinel value; if getCachedAggregate
  // truly reuses it (n_runs matches), the sentinel must come back unchanged.
  const cached = JSON.parse(fs.readFileSync(cachePath, "utf8"));
  cached.sentinel = "reused";
  fs.writeFileSync(cachePath, JSON.stringify(cached));
  const second = getCachedAggregate(dir);
  assert.equal(second.sentinel, "reused");
  assert.equal(first.n_runs, second.n_runs);
});

test("getCachedAggregate: recomputes when run count changes (cache invalidation)", () => {
  const dir = mkTmp();
  writeCampaign(dir, [makeRun({ task_id: "t", arm: "baseline", rep: 0, solved: true, quality_score: 80, cost: 1 })]);
  getCachedAggregate(dir);
  writeCampaign(dir, [makeRun({ task_id: "t", arm: "baseline", rep: 1, solved: true, quality_score: 80, cost: 1 })]);
  const second = getCachedAggregate(dir);
  assert.equal(second.n_runs, 2);
});
