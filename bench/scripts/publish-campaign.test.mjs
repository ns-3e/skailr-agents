import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { publishCampaign } from "./publish-campaign.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BENCH_ROOT = path.resolve(HERE, "..");
const SYNTH = path.join(BENCH_ROOT, "results-synthetic", "v1.12.0");

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "bench-publish-"));
}

test("publishCampaign distills a campaign into a committable dir", () => {
  const out = mkTmp();
  const { dir, label, meta } = publishCampaign({
    resultsDir: SYNTH,
    outRoot: out,
    label: "test-campaign",
    now: "2026-08-07T18:43:30Z",
  });

  assert.equal(label, "test-campaign");
  assert.equal(dir, path.join(out, "test-campaign"));

  // Core artifacts exist.
  for (const f of ["aggregate.json", "report.md", "report.html", "report.csv", "SUMMARY.md", "meta.json"]) {
    assert.ok(fs.existsSync(path.join(dir, f)), `missing ${f}`);
  }
  // Raw run.json stats copied.
  const runs = fs.readdirSync(path.join(dir, "runs")).filter((f) => f.endsWith(".json"));
  assert.ok(runs.length >= 6, `expected copied run.json files, got ${runs.length}`);

  // Both arms represented in metadata.
  assert.deepEqual(meta.arms, ["baseline", "skailr"]);
  assert.ok(meta.tasks.length >= 1);
  assert.equal(meta.n_runs, runs.length);

  // SUMMARY names both arms; report is embedded.
  const summary = fs.readFileSync(path.join(dir, "SUMMARY.md"), "utf8");
  assert.match(summary, /baseline/);
  assert.match(summary, /skailr/);

  // Index + latest pointer written.
  assert.ok(fs.existsSync(path.join(out, "index.md")));
  const latest = JSON.parse(fs.readFileSync(path.join(out, "latest.json"), "utf8"));
  assert.equal(latest.label, "test-campaign");

  fs.rmSync(out, { recursive: true, force: true });
});

test("publishCampaign refuses an empty results dir", () => {
  const empty = mkTmp();
  const out = mkTmp();
  assert.throws(() => publishCampaign({ resultsDir: empty, outRoot: out }), /no run\.json/);
  fs.rmSync(empty, { recursive: true, force: true });
  fs.rmSync(out, { recursive: true, force: true });
});

test("publishCampaign --campaign-id scopes publishing to only the matching campaign's runs, ignoring foreign runs in the same results dir (Known issues repro)", () => {
  const resultsDir = mkTmp();
  const out = mkTmp();

  function writeRun(runId, { task_id, arm, campaign_id }) {
    const runDir = path.join(resultsDir, runId);
    fs.mkdirSync(runDir, { recursive: true });
    const run = {
      identity: {
        run_id: runId, series_id: "series_fixed", task_id, task_version: "1", arm,
        skailr_sha: arm === "skailr" ? "sha123" : null, skailr_version: arm === "skailr" ? "1.11.0" : null,
        fixture_sha: "fixsha", timestamp: "2026-08-09T00:00:00Z",
        ...(campaign_id ? { campaign_id } : {}),
      },
      environment: { claude_code_version: "2.1.224", model_id: "claude-sonnet-4-5-20250929", os: "linux", container: null, node_version: "22.22.2" },
      outcome: { solved: true, termination_reason: "finish", visible_tests: { passed: 1, failed: 0, total: 1 }, hidden_tests: { passed: 1, failed: 0, total: 1 }, regression: { passed: 1, failed: 0, total: 1 }, critical_failures: [] },
      quality: { quality_score: 90, subscores: { functional: 90, regression: 100, security: 100, static: 100, scope: 100, maintainability: 100 } },
      time: { wall_clock_s: 100, claude_active_s: 80, time_to_first_edit_s: 5, grader_s: 1 },
      usage: { tokens: { input: 100, output: 100, cache_read: 0, cache_create: 0 }, by_model: {}, by_source: { main: { input: 100, output: 100, cache_read: 0, cache_create: 0 }, subagent: { input: 0, output: 0, cache_read: 0, cache_create: 0 }, auxiliary: { input: 0, output: 0, cache_read: 0, cache_create: 0 } }, by_agent: {} },
      cost: { cost_reported_usd: 0.1, cost_reconstructed_usd: 0.1, pricing_table_version: "2026-08" },
      trajectory: { model_requests: 1, tool_calls: 1, failed_tool_calls: 0, retries: 0, compactions: 0 },
      code: { files_read: 1, files_edited: 1, lines_added: 1, lines_removed: 0, diff_bytes: 10 },
      process: { test_executions: 1, test_failures: 0, repair_loops: 0 },
      skailr_diagnostics: null,
      failure_stage: "none",
    };
    fs.writeFileSync(path.join(runDir, "run.json"), JSON.stringify(run));
  }

  // This campaign's own runs (a 3-task x 2-arm x 1-rep smoke campaign => 6 runs).
  const tasks = ["patch-webhook", "feature-api-keys", "program-rbac"];
  for (const task_id of tasks) {
    for (const arm of ["baseline", "skailr"]) {
      writeRun(`${task_id}_${arm}_rep0_real`, { task_id, arm, campaign_id: "campaign_smoke_real" });
    }
  }
  // Stale foreign runs from an earlier invocation sharing the same dir.
  writeRun("patch-webhook_baseline_rep1_stale", { task_id: "patch-webhook", arm: "baseline", campaign_id: "campaign_old" });
  writeRun("feature-api-keys_skailr_rep1_stale", { task_id: "feature-api-keys", arm: "skailr", campaign_id: "campaign_old" });

  const { dir, meta } = publishCampaign({
    resultsDir, outRoot: out, label: "scoped-campaign", now: "2026-08-09T00:00:00Z",
    campaignId: "campaign_smoke_real",
  });

  assert.equal(meta.n_runs, 6, "published campaign must report exactly this campaign's 6 runs, not 8");
  const runs = fs.readdirSync(path.join(dir, "runs")).filter((f) => f.endsWith(".json"));
  assert.equal(runs.length, 6);

  const agg = JSON.parse(fs.readFileSync(path.join(dir, "aggregate.json"), "utf8"));
  assert.equal(agg.n_runs, 6, "aggregate.json must also be scoped to this campaign's runs");

  const summary = fs.readFileSync(path.join(dir, "SUMMARY.md"), "utf8");
  assert.match(summary, /Runs: 6/);

  fs.rmSync(resultsDir, { recursive: true, force: true });
  fs.rmSync(out, { recursive: true, force: true });
});
