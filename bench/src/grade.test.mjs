import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  computeQualityScore,
  deriveSolved,
  foldGraderIntoRun,
  runGraderProcess,
  gradeRun,
  regradeRun,
} from "./grade.mjs";
import { validate } from "./schema/validate.mjs";

function mkTmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function baseRunRecord(overrides = {}) {
  const tokenCounts = { input: 0, output: 0, cache_read: 0, cache_create: 0 };
  return {
    identity: {
      run_id: "patch-webhook_baseline_rep0_abc1234567",
      series_id: "series_abcdef123456",
      task_id: "patch-webhook",
      task_version: "1",
      arm: "baseline",
      skailr_sha: null,
      skailr_version: null,
      fixture_sha: "deadbeef",
      timestamp: "2026-08-07T00:00:00Z",
    },
    environment: {
      claude_code_version: "2.1.224",
      model_id: "claude-sonnet-4-5-20250929",
      os: "linux",
      container: null,
      node_version: "22.22.2",
    },
    outcome: {
      solved: false,
      termination_reason: "finish",
      visible_tests: { passed: 5, failed: 0, total: 5 },
      hidden_tests: { passed: 0, failed: 0, total: 0 },
      regression: { passed: 0, failed: 0, total: 0 },
      critical_failures: [],
    },
    quality: { quality_score: 0, subscores: { functional: 0, regression: 0, security: 0, static: 0, scope: 0, maintainability: 0 } },
    time: { wall_clock_s: 120, claude_active_s: 90, time_to_first_edit_s: 10, grader_s: 0 },
    usage: {
      tokens: tokenCounts,
      by_model: {},
      by_source: { main: tokenCounts, subagent: tokenCounts, auxiliary: tokenCounts },
      by_agent: {},
    },
    cost: { cost_reported_usd: 0.05, cost_reconstructed_usd: 0.05, pricing_table_version: "2026-08" },
    trajectory: { model_requests: 1, tool_calls: 1, failed_tool_calls: 0, retries: 0, compactions: 0 },
    code: { files_read: 1, files_edited: 1, lines_added: 1, lines_removed: 0, diff_bytes: 10 },
    process: { test_executions: 1, test_failures: 0, repair_loops: 0 },
    skailr_diagnostics: null,
    failure_stage: "unclassified",
    ...overrides,
  };
}

function category(passed, total, cases = []) {
  return { passed, failed: total - passed, total, cases };
}

function baseGraderResult(overrides = {}) {
  return {
    grader_version: "1",
    task_id: "patch-webhook",
    task_version: "1",
    workspace_frozen: true,
    tests: {
      hidden_functional: category(4, 4, [{ id: "hf-1", ok: true }]),
      regression: category(3, 3),
      security: category(2, 2),
      static: category(1, 1),
    },
    subscores: { functional: 100, regression: 100, security: 100, static: 100, scope: 100, maintainability: 100 },
    quality_score: 100,
    critical_failures: [],
    solved: true,
    solved_inputs: { hidden_functional_all_pass: true, critical_failures_count: 0 },
    determinism: { seed: 1, flaky_retries: 0, majority_vote: false },
    failure_stage_hint: null,
    ...overrides,
  };
}

function writeGraderScript(dir, resultObj) {
  fs.mkdirSync(dir, { recursive: true });
  const script = `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(JSON.stringify(resultObj))});\n`;
  fs.writeFileSync(path.join(dir, "grade.mjs"), script, "utf8");
}

test("computeQualityScore: weighted FR-8 rubric sum", () => {
  const score = computeQualityScore({ functional: 100, regression: 100, security: 100, static: 100, scope: 100, maintainability: 100 });
  assert.equal(score, 100);
  const partial = computeQualityScore({ functional: 50, regression: 0, security: 0, static: 0, scope: 0, maintainability: 0 });
  assert.equal(partial, 30); // 50 * 0.6
});

test("computeQualityScore: throws on missing subscore", () => {
  assert.throws(() => computeQualityScore({ functional: 1 }));
});

test("AC-4: deriveSolved is true when hidden_functional all-pass and no critical failures", () => {
  const gr = baseGraderResult();
  const { solved, hidden_functional_all_pass, critical_failures_count } = deriveSolved(gr);
  assert.equal(solved, true);
  assert.equal(hidden_functional_all_pass, true);
  assert.equal(critical_failures_count, 0);
});

test("AC-4: planted-defect flips solved=false even though quality score is high", () => {
  const gr = baseGraderResult({
    critical_failures: ["no-raw-key-storage"],
    subscores: { functional: 95, regression: 95, security: 95, static: 95, scope: 95, maintainability: 95 },
  });
  const { solved } = deriveSolved(gr);
  assert.equal(solved, false);
  const folded = foldGraderIntoRun(baseRunRecord(), gr);
  assert.equal(folded.outcome.solved, false);
  assert.deepEqual(folded.outcome.critical_failures, ["no-raw-key-storage"]);
  assert.ok(folded.quality.quality_score > 90, "quality score stays high despite solved=false");
  const { valid, errors } = validate(folded, "run");
  assert.equal(valid, true, JSON.stringify(errors));
});

test("critical rule overrides score even with zero hidden_functional failures but nonempty critical_failures", () => {
  const gr = baseGraderResult({ critical_failures: ["exactly-once-processing", "api-contract-preserved"] });
  const folded = foldGraderIntoRun(baseRunRecord(), gr);
  assert.equal(folded.outcome.solved, false);
  assert.equal(folded.outcome.critical_failures.length, 2);
});

test("foldGraderIntoRun: hidden_functional failures also flip solved=false", () => {
  const gr = baseGraderResult({ tests: { ...baseGraderResult().tests, hidden_functional: category(2, 4) } });
  const folded = foldGraderIntoRun(baseRunRecord(), gr);
  assert.equal(folded.outcome.solved, false);
  assert.deepEqual(folded.outcome.hidden_tests, { passed: 2, failed: 2, total: 4 });
});

test("foldGraderIntoRun preserves visible_tests/termination_reason from the harness-recorded run", () => {
  const run = baseRunRecord({ outcome: { ...baseRunRecord().outcome, visible_tests: { passed: 9, failed: 0, total: 9 } } });
  const folded = foldGraderIntoRun(run, baseGraderResult());
  assert.deepEqual(folded.outcome.visible_tests, { passed: 9, failed: 0, total: 9 });
  assert.equal(folded.outcome.termination_reason, "finish");
});

test("gradeRun: invokes grader child process out-of-band, writes grader.json + run.json", () => {
  const runDir = mkTmp("bench-grade-run-");
  const workspaceDir = mkTmp("bench-grade-ws-");
  const graderDir = mkTmp("bench-grade-grader-");
  fs.writeFileSync(path.join(runDir, "run.json"), JSON.stringify(baseRunRecord()));
  writeGraderScript(graderDir, baseGraderResult());

  const { runRecord } = gradeRun({ runDir, workspaceDir, graderDir });
  assert.equal(runRecord.outcome.solved, true);
  assert.equal(runRecord.quality.quality_score, 100);

  const writtenRun = JSON.parse(fs.readFileSync(path.join(runDir, "run.json"), "utf8"));
  const writtenGrader = JSON.parse(fs.readFileSync(path.join(runDir, "grader.json"), "utf8"));
  assert.equal(writtenRun.outcome.solved, true);
  assert.equal(writtenGrader.grader_version, "1");
  assert.ok(writtenRun.time.grader_s >= 0);
});

test("runGraderProcess: grader dir/entrypoint is invoked with workspace path as sole arg, out-of-band", () => {
  const workspaceDir = mkTmp("bench-grade-ws2-");
  const graderDir = mkTmp("bench-grade-grader2-");
  fs.writeFileSync(
    path.join(graderDir, "grade.mjs"),
    `#!/usr/bin/env node\nconst ws = process.argv[2];\nprocess.stdout.write(JSON.stringify({ ws }));\n`,
    "utf8"
  );
  const result = runGraderProcess(graderDir, workspaceDir);
  assert.equal(result.ws, workspaceDir);
});

test("re-grade: writes grader.v2.json + run.v2.json WITHOUT touching original run.json/grader.json (immutability)", () => {
  const runDir = mkTmp("bench-regrade-run-");
  const workspaceDir = mkTmp("bench-regrade-ws-");
  const graderDirV1 = mkTmp("bench-regrade-grader1-");
  const graderDirV2 = mkTmp("bench-regrade-grader2-");

  fs.writeFileSync(path.join(runDir, "run.json"), JSON.stringify(baseRunRecord()));
  writeGraderScript(graderDirV1, baseGraderResult());
  // First-time grade.
  gradeRun({ runDir, workspaceDir, graderDir: graderDirV1 });
  const originalRunBytes = fs.readFileSync(path.join(runDir, "run.json"), "utf8");
  const originalGraderBytes = fs.readFileSync(path.join(runDir, "grader.json"), "utf8");

  // Re-grade with a DIFFERENT grader result (simulates a rubric fix).
  writeGraderScript(
    graderDirV2,
    baseGraderResult({ critical_failures: ["no-duplicate-ledger-entry"], quality_score: 40 })
  );
  const { runRecord } = regradeRun({ runDir, workspaceDir, graderDir: graderDirV2 });

  assert.equal(runRecord.outcome.solved, false);
  assert.equal(fs.readFileSync(path.join(runDir, "run.json"), "utf8"), originalRunBytes, "run.json must not change");
  assert.equal(fs.readFileSync(path.join(runDir, "grader.json"), "utf8"), originalGraderBytes, "grader.json must not change");

  assert.ok(fs.existsSync(path.join(runDir, "grader.v2.json")));
  assert.ok(fs.existsSync(path.join(runDir, "run.v2.json")));
  const v2Run = JSON.parse(fs.readFileSync(path.join(runDir, "run.v2.json"), "utf8"));
  assert.equal(v2Run.outcome.solved, false);
  assert.deepEqual(v2Run.outcome.critical_failures, ["no-duplicate-ledger-entry"]);
});

test("gradeRun refuses to fold when grader reports workspace_frozen=false", () => {
  const runDir = mkTmp("bench-grade-frozen-");
  const workspaceDir = mkTmp("bench-grade-frozen-ws-");
  const graderDir = mkTmp("bench-grade-frozen-grader-");
  fs.writeFileSync(path.join(runDir, "run.json"), JSON.stringify(baseRunRecord()));
  writeGraderScript(graderDir, baseGraderResult({ workspace_frozen: false }));
  assert.throws(() => gradeRun({ runDir, workspaceDir, graderDir }), /workspace_frozen/);
});
