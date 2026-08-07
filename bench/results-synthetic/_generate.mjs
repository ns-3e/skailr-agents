#!/usr/bin/env node
// DOC: Generator for the committed synthetic campaign datasets (F-024).
// Re-run manually (`node bench/results-synthetic/_generate.mjs`) if the
// narrative below changes; output is committed, this script is not invoked
// at test time. Drives bench:compare/aggregate/verdict/CI/banner
// deterministically (AC-5/6/7) without spending real model $$.
//
// Layout:
//   v1.11.0/          — "incumbent" skailr release + its baseline control
//   v1.12.0/          — "candidate" skailr release (should ACCEPT vs v1.11.0)
//   cross-series-v2/  — same tasks, DIFFERENT model_id -> forks series_id,
//                        drives the AC-7 cross-series WARNING banner
//
// v1.12.0/patch-webhook/skailr/rep3 is a PLANTED DEFECT (AC-4 at the
// analytics layer): hidden_functional all-pass + high quality subscores,
// but a critical_requirements failure flips solved=false.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { atomicWriteJson, ensureDir } from "../src/lib/fsutil.mjs";
import { deriveSeriesId, deriveRunId } from "../src/lib/ids.mjs";
import { reconstructCost } from "../src/lib/pricing.mjs";
import { generateMockEvents, generateMockTelemetry } from "../src/lib/mock.mjs";
import { validateOrThrow } from "../src/schema/validate.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;

// Local pricing table used only to compute cost_reconstructed_usd for the
// synthetic dataset generation itself. NOTE: bench/config.yaml (the pinned,
// real pricing table report.mjs reads at runtime) intentionally does NOT
// carry a "claude-sonnet-4-6-20260201" entry — report.mjs's subagent-cost
// diagnostic degrades gracefully (returns null) for that cross-series
// sample, which is itself part of what the cross-series test exercises.
const PRICING_TABLE = {
  version: "2026-08",
  models: {
    "claude-sonnet-4-5-20250929": { input_per_mtok: 3.0, output_per_mtok: 15.0, cache_write_per_mtok: 3.75, cache_read_per_mtok: 0.3 },
    "claude-sonnet-4-6-20260201": { input_per_mtok: 3.5, output_per_mtok: 17.0, cache_write_per_mtok: 4.0, cache_read_per_mtok: 0.35 },
  },
};

const CRITICAL_REQS = {
  "patch-webhook": ["exactly-once-processing", "api-contract-preserved", "no-duplicate-ledger-entry"],
  "feature-api-keys": ["no-cross-org-access", "no-raw-key-storage", "revoked-keys-rejected", "hash-not-exposed"],
  "program-rbac": ["cross-org-isolation", "last-admin-protected", "invitation-single-use", "audit-events-emitted"],
};

function sumTokens(records) {
  return records.reduce(
    (acc, r) => ({
      input: acc.input + r.tokens.input,
      output: acc.output + r.tokens.output,
      cache_read: acc.cache_read + r.tokens.cache_read,
      cache_create: acc.cache_create + r.tokens.cache_create,
    }),
    { input: 0, output: 0, cache_read: 0, cache_create: 0 }
  );
}

function tokensBySource(records, source) {
  const rec = records.filter((r) => r.source === source);
  return sumTokens(rec.length ? rec : [{ tokens: { input: 0, output: 0, cache_read: 0, cache_create: 0 } }]);
}

function scaleTokens(t, factor) {
  return {
    input: Math.round(t.input * factor),
    output: Math.round(t.output * factor),
    cache_read: Math.round(t.cache_read * factor),
    cache_create: Math.round(t.cache_create * factor),
  };
}

function buildRun({
  task_id,
  arm,
  rep,
  claude_code_version,
  model_id,
  skailr_sha,
  skailr_version,
  flavor,
  solved,
  quality_score,
  critical_failures,
  termination_reason,
  hidden_tests,
  regression,
  visible_tests,
  wall_clock_s,
  scale,
  timestampOffsetMin,
}) {
  const series_id = deriveSeriesId({ claude_code_version, model_id });
  const timestamp = new Date(Date.UTC(2026, 6, 1, 0, timestampOffsetMin)).toISOString();
  const run_id = deriveRunId({ task_id, arm, rep, series_id, timestamp });
  const sessionId = `${run_id}_session`;

  const events = generateMockEvents({ sessionId, promptId: `${run_id}_prompt`, model: model_id, flavor });
  const telemetry = generateMockTelemetry({ sessionId, promptId: `${run_id}_prompt`, model: model_id, flavor }).map((r) => ({
    ...r,
    tokens: scaleTokens(r.tokens, scale),
  }));
  const resultEvent = events.find((e) => e.type === "result");
  const tokens = sumTokens(telemetry);
  const by_source = {
    main: tokensBySource(telemetry, "main"),
    subagent: tokensBySource(telemetry, "subagent"),
    auxiliary: tokensBySource(telemetry, "auxiliary"),
  };
  const { cost_reconstructed_usd, pricing_table_version } = reconstructCost(tokens, PRICING_TABLE, model_id);

  const subscore = quality_score;
  const run = {
    identity: {
      run_id,
      series_id,
      task_id,
      task_version: "1",
      arm,
      skailr_sha: arm === "skailr" ? skailr_sha : null,
      skailr_version: arm === "skailr" ? skailr_version : null,
      fixture_sha: `fixsha_${task_id}`,
      timestamp,
    },
    environment: { claude_code_version, model_id, os: "linux", container: null, node_version: "22.22.2" },
    outcome: {
      solved,
      termination_reason,
      visible_tests,
      hidden_tests,
      regression,
      critical_failures,
    },
    quality: {
      quality_score,
      subscores: { functional: subscore, regression: subscore, security: subscore, static: subscore, scope: subscore, maintainability: subscore },
    },
    time: { wall_clock_s, claude_active_s: Math.round(wall_clock_s * 0.85), time_to_first_edit_s: termination_reason === "finish" ? 8 : null, grader_s: 1.5 },
    usage: { tokens, by_model: { [model_id]: tokens }, by_source, by_agent: { "sub-worker": by_source.subagent } },
    cost: { cost_reported_usd: resultEvent?.total_cost_usd ?? null, cost_reconstructed_usd, pricing_table_version },
    trajectory: {
      model_requests: 3,
      tool_calls: telemetry.reduce((s, r) => s + r.tool_calls, 0),
      failed_tool_calls: telemetry.reduce((s, r) => s + r.failed_tool_calls, 0),
      retries: termination_reason === "finish" ? 0 : 1,
      compactions: arm === "skailr" ? 1 : 0,
    },
    code: { files_read: 4, files_edited: 2, lines_added: 30, lines_removed: 5, diff_bytes: 900 },
    process: { test_executions: 2, test_failures: solved ? 0 : 1, repair_loops: solved ? 0 : 1 },
    skailr_diagnostics:
      arm === "skailr"
        ? {
            agents_spawned: 3,
            inter_agent_messages: 12,
            blockers: solved ? 0 : 1,
            contract_events: 2,
            gate_failures: solved ? 0 : 1,
            validator_findings: solved ? 1 : 2,
          }
        : null,
    failure_stage: solved ? "none" : termination_reason === "wall_clock_kill" ? "budget_timeout" : "implementation",
  };
  validateOrThrow(run, "run");
  return run;
}

// Per-task, per-arm, per-version rep specs. n=5 reps each (matches
// config.yaml defaults.repetitions).
function repSpecs({ version, quality, solved, cost_scale }) {
  return quality.map((q, i) => ({
    rep: i,
    quality_score: q,
    solved: solved[i],
    scale: cost_scale[i],
  }));
}

const NARRATIVE = {
  "patch-webhook": {
    baseline: { quality: [45, 50, 55, 40, 60], solved: [false, true, false, false, true], cost_scale: [0.9, 1.0, 0.95, 0.85, 1.05] },
    "v1.11.0": { quality: [70, 75, 80, 55, 50], solved: [true, true, true, false, false], cost_scale: [1.6, 1.7, 1.8, 1.4, 1.5] },
    "v1.12.0": { quality: [88, 90, 85, 95, 92], solved: [true, true, true, true, "planted-defect"], cost_scale: [1.1, 1.2, 1.15, 1.25, 1.2] },
  },
  "feature-api-keys": {
    baseline: { quality: [42, 48, 52, 38, 58], solved: [false, true, false, false, true], cost_scale: [0.9, 1.0, 0.95, 0.85, 1.05] },
    "v1.11.0": { quality: [68, 72, 78, 52, 48], solved: [true, true, true, false, false], cost_scale: [1.6, 1.7, 1.8, 1.4, 1.5] },
    "v1.12.0": { quality: [84, 88, 82, 90, 40], solved: [true, true, true, true, false], cost_scale: [1.1, 1.2, 1.15, 1.25, 1.3] },
  },
  "program-rbac": {
    baseline: { quality: [40, 46, 50, 36, 56], solved: [false, true, false, false, true], cost_scale: [0.9, 1.0, 0.95, 0.85, 1.05] },
    "v1.11.0": { quality: [60, 65, 70, 55, 68], solved: [true, true, false, false, true], cost_scale: [1.6, 1.7, 1.8, 1.4, 1.5] },
    "v1.12.0": { quality: [62, 68, 72, 58, 70], solved: [true, true, true, false, true], cost_scale: [1.15, 1.2, 1.25, 1.3, 1.2] },
  },
};

function buildCampaign({ version, claude_code_version, model_id, skailr_sha, skailr_version, offsetBase }) {
  const runs = [];
  let offset = offsetBase;
  for (const task_id of Object.keys(NARRATIVE)) {
    for (const arm of ["baseline", "skailr"]) {
      const key = arm === "baseline" ? "baseline" : version;
      const spec = NARRATIVE[task_id][key];
      for (let rep = 0; rep < spec.quality.length; rep++) {
        offset += 1;
        const solvedRaw = spec.solved[rep];
        const isPlantedDefect = solvedRaw === "planted-defect";
        const solved = isPlantedDefect ? false : !!solvedRaw;
        const flavor = isPlantedDefect ? "planted-defect" : solved ? "solved" : rep % 2 === 0 ? "timeout" : "solved";
        const termination_reason = isPlantedDefect ? "finish" : solved ? "finish" : flavor === "timeout" ? "wall_clock_kill" : "finish";
        const hiddenAllPass = solved || isPlantedDefect; // planted-defect: hidden tests pass, critical fails
        const hidden_tests = hiddenAllPass ? { passed: 10, failed: 0, total: 10 } : { passed: 6, failed: 4, total: 10 };
        const regression = hiddenAllPass ? { passed: 8, failed: 0, total: 8 } : { passed: 5, failed: 3, total: 8 };
        const visible_tests = termination_reason === "finish" ? { passed: 6, failed: 0, total: 6 } : { passed: 3, failed: 3, total: 6 };
        const critical_failures = isPlantedDefect ? [CRITICAL_REQS[task_id][CRITICAL_REQS[task_id].length - 1]] : [];

        runs.push(
          buildRun({
            task_id,
            arm,
            rep,
            claude_code_version,
            model_id,
            skailr_sha,
            skailr_version,
            flavor,
            solved,
            quality_score: spec.quality[rep],
            critical_failures,
            termination_reason,
            hidden_tests,
            regression,
            visible_tests,
            wall_clock_s: arm === "skailr" ? 300 - spec.quality[rep] : 400 - spec.quality[rep] * 0.5,
            scale: spec.cost_scale[rep],
            timestampOffsetMin: offset,
          })
        );
      }
    }
  }
  return runs;
}

function writeCampaign(label, runs) {
  const dir = path.join(ROOT, label);
  for (const run of runs) {
    const runDir = path.join(dir, run.identity.run_id);
    ensureDir(runDir);
    atomicWriteJson(path.join(runDir, "run.json"), run);
  }
  console.log(`Wrote ${runs.length} run.json records to ${dir}`);
}

const v1_11_0 = buildCampaign({
  version: "v1.11.0",
  claude_code_version: "2.1.224",
  model_id: "claude-sonnet-4-5-20250929",
  skailr_sha: "sha_v1_11_0_aaaaaaa",
  skailr_version: "1.11.0",
  offsetBase: 0,
});
const v1_12_0 = buildCampaign({
  version: "v1.12.0",
  claude_code_version: "2.1.224",
  model_id: "claude-sonnet-4-5-20250929",
  skailr_sha: "sha_v1_12_0_bbbbbbb",
  skailr_version: "1.12.0",
  offsetBase: 100,
});
// Cross-series: same narrative shape as v1.11.0, but a DIFFERENT model_id ->
// forks series_id (AC-7). Trimmed to one task x both arms to keep the
// committed fixture small.
const crossSeriesNarrative = { "patch-webhook": NARRATIVE["patch-webhook"] };
function buildCrossSeries() {
  const saved = NARRATIVE["feature-api-keys"];
  const saved2 = NARRATIVE["program-rbac"];
  delete NARRATIVE["feature-api-keys"];
  delete NARRATIVE["program-rbac"];
  const runs = buildCampaign({
    version: "v1.11.0",
    claude_code_version: "2.1.224",
    model_id: "claude-sonnet-4-6-20260201",
    skailr_sha: "sha_v1_11_0_aaaaaaa",
    skailr_version: "1.11.0",
    offsetBase: 200,
  });
  NARRATIVE["feature-api-keys"] = saved;
  NARRATIVE["program-rbac"] = saved2;
  return runs;
}
const crossSeries = buildCrossSeries();

writeCampaign("v1.11.0", v1_11_0);
writeCampaign("v1.12.0", v1_12_0);
writeCampaign("cross-series-v2", crossSeries);
