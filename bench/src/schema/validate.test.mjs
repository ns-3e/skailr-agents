import test from "node:test";
import assert from "node:assert/strict";
import { validate, validateOrThrow } from "./validate.mjs";

const tokenCounts = { input: 1, output: 2, cache_read: 0, cache_create: 0 };
const testCounts = { passed: 1, failed: 0, total: 1 };

function validRun() {
  return {
    identity: {
      run_id: "r1",
      series_id: "s1",
      task_id: "patch-webhook",
      task_version: "1",
      arm: "baseline",
      skailr_sha: null,
      skailr_version: null,
      fixture_sha: "abc123",
      timestamp: "2026-08-07T12:00:00Z",
    },
    environment: {
      claude_code_version: "2.1.224",
      model_id: "claude-sonnet-4-5-20250929",
      os: "linux",
      container: null,
      node_version: "22.22.2",
    },
    outcome: {
      solved: true,
      termination_reason: "finish",
      visible_tests: testCounts,
      hidden_tests: testCounts,
      regression: testCounts,
      critical_failures: [],
    },
    quality: {
      quality_score: 90,
      subscores: { functional: 90, regression: 90, security: 90, static: 90, scope: 90, maintainability: 90 },
    },
    time: { wall_clock_s: 10, claude_active_s: 8, time_to_first_edit_s: 2, grader_s: 1 },
    usage: {
      tokens: tokenCounts,
      by_model: { "claude-sonnet-4-5-20250929": tokenCounts },
      by_source: { main: tokenCounts, subagent: tokenCounts, auxiliary: tokenCounts },
      by_agent: {},
    },
    cost: { cost_reported_usd: 0.01, cost_reconstructed_usd: 0.0099, pricing_table_version: "2026-08" },
    trajectory: { model_requests: 1, tool_calls: 1, failed_tool_calls: 0, retries: 0, compactions: 0 },
    code: { files_read: 1, files_edited: 1, lines_added: 1, lines_removed: 0, diff_bytes: 10 },
    process: { test_executions: 1, test_failures: 0, repair_loops: 0 },
    skailr_diagnostics: null,
    failure_stage: "none",
  };
}

test("AC schema: valid run.json accepts", () => {
  const { valid, errors } = validate(validRun(), "run");
  assert.equal(valid, true, JSON.stringify(errors));
});

test("AC schema: run.json rejects missing required group", () => {
  const bad = validRun();
  delete bad.cost;
  const { valid, errors } = validate(bad, "run");
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.includes("cost")));
});

test("AC schema: run.json rejects bad enum (termination_reason)", () => {
  const bad = validRun();
  bad.outcome.termination_reason = "oops";
  const { valid } = validate(bad, "run");
  assert.equal(valid, false);
});

test("AC schema: run.json rejects additional properties", () => {
  const bad = validRun();
  bad.identity.extra_field = "nope";
  const { valid } = validate(bad, "run");
  assert.equal(valid, false);
});

test("AC schema: valid config.yaml (parsed) accepts", () => {
  const cfg = {
    claude_code_version: "2.1.224",
    model: "claude-sonnet-4-5-20250929",
    node_version: "22.x",
    container_image: null,
    defaults: { max_turns: 200, max_budget_usd: 10, wall_clock_timeout_min: 45, repetitions: 5 },
    pricing_table: {
      version: "2026-08",
      models: {
        "claude-sonnet-4-5-20250929": {
          input_per_mtok: 3,
          output_per_mtok: 15,
          cache_write_per_mtok: 3.75,
          cache_read_per_mtok: 0.3,
        },
      },
    },
  };
  const { valid, errors } = validate(cfg, "config");
  assert.equal(valid, true, JSON.stringify(errors));
});

test("AC schema: config rejects floating model type mismatch", () => {
  const cfg = { claude_code_version: "x", model: 123, node_version: "22.x", container_image: null, defaults: { max_turns: 1, max_budget_usd: 1, wall_clock_timeout_min: 1, repetitions: 1 }, pricing_table: { version: "v", models: {} } };
  const { valid } = validate(cfg, "config");
  assert.equal(valid, false);
});

test("AC schema: valid task.yaml accepts", () => {
  const task = {
    id: "patch-webhook",
    version: "1",
    class: "patch",
    fixture: "bench/fixtures/patch-webhook",
    fixture_sha: "abc123",
    grader: "bench/graders/patch-webhook",
    prompt: "Fix the bug.",
    setup: ["npm ci"],
    critical_requirements: ["exactly-once-processing"],
  };
  const { valid, errors } = validate(task, "task");
  assert.equal(valid, true, JSON.stringify(errors));
});

test("AC schema: task.yaml rejects bad class enum", () => {
  const task = { id: "x", version: "1", class: "bogus", fixture: "f", fixture_sha: "s", grader: "g", prompt: "p", setup: [], critical_requirements: [] };
  const { valid } = validate(task, "task");
  assert.equal(valid, false);
});

test("AC schema: valid grader.json accepts", () => {
  const cat = { passed: 1, failed: 0, total: 1, cases: [{ id: "c1", ok: true }] };
  const grader = {
    grader_version: "1",
    task_id: "patch-webhook",
    task_version: "1",
    workspace_frozen: true,
    tests: { hidden_functional: cat, regression: cat, security: cat, static: cat },
    subscores: { functional: 100, regression: 100, security: 100, static: 100, scope: 100, maintainability: 100 },
    quality_score: 100,
    critical_failures: [],
    solved: true,
    solved_inputs: { hidden_functional_all_pass: true, critical_failures_count: 0 },
    determinism: { seed: 1, flaky_retries: 0, majority_vote: false },
    failure_stage_hint: null,
  };
  const { valid, errors } = validate(grader, "grader");
  assert.equal(valid, true, JSON.stringify(errors));
});

test("AC schema: grader.json rejects workspace_frozen:false (const)", () => {
  const cat = { passed: 1, failed: 0, total: 1, cases: [] };
  const grader = {
    grader_version: "1", task_id: "t", task_version: "1", workspace_frozen: false,
    tests: { hidden_functional: cat, regression: cat, security: cat, static: cat },
    subscores: { functional: 0, regression: 0, security: 0, static: 0, scope: 0, maintainability: 0 },
    quality_score: 0, critical_failures: [], solved: false,
    solved_inputs: { hidden_functional_all_pass: false, critical_failures_count: 0 },
    determinism: { seed: 1, flaky_retries: 0, majority_vote: false }, failure_stage_hint: null,
  };
  const { valid } = validate(grader, "grader");
  assert.equal(valid, false);
});

test("AC schema: valid fixture-layout accepts", () => {
  const manifest = {
    task_id: "patch-webhook", class: "patch", root_dirs: ["src"],
    visible_test_cmd: "npm test", setup_cmd: ["npm ci"],
    entrypoints: { service: "src/index.ts" },
    critical_requirements: ["exactly-once-processing"],
  };
  const { valid, errors } = validate(manifest, "fixture-layout");
  assert.equal(valid, true, JSON.stringify(errors));
});

test("AC schema: mock-event oneOf accepts system/init and result shapes", () => {
  const initEvent = { type: "system", subtype: "init", session_id: "s1", model: "m1" };
  assert.equal(validate(initEvent, "mock-event").valid, true);
  const resultEvent = {
    type: "result", subtype: "success", session_id: "s1", is_error: false, num_turns: 3,
    total_cost_usd: 0.02,
    usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  };
  assert.equal(validate(resultEvent, "mock-event").valid, true);
});

test("AC schema: mock-event rejects event matching zero oneOf branches", () => {
  const bogus = { type: "bogus" };
  assert.equal(validate(bogus, "mock-event").valid, false);
});

test("AC schema: mock-telemetry accepts normalized record", () => {
  const record = {
    session_id: "s1", prompt_id: "p1", source: "main", model: "m1",
    agent_name: null, skill_name: null, tokens: tokenCounts, tool_calls: 1, failed_tool_calls: 0,
  };
  assert.equal(validate(record, "mock-telemetry").valid, true);
});

test("validateOrThrow throws with joined message on invalid input", () => {
  assert.throws(() => validateOrThrow({}, "run"), /failed schema validation/);
});

test("validateOrThrow returns the object unchanged when valid", () => {
  const run = validRun();
  assert.equal(validateOrThrow(run, "run"), run);
});
