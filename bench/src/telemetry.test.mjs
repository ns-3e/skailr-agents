import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildTelemetryEnv, readOtelRecords, deriveFallbackTelemetry, foldUsage, foldTrajectory, computeCost, buildTelemetry } from "./telemetry.mjs";
import { writeMockRun } from "./lib/mock.mjs";
import { reconstructCost } from "./lib/pricing.mjs";

const PRICING = {
  version: "2026-08",
  models: {
    "claude-sonnet-4-5-20250929": { input_per_mtok: 3, output_per_mtok: 15, cache_write_per_mtok: 3.75, cache_read_per_mtok: 0.3 },
  },
};

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "bench-telemetry-"));
}

test("telemetry: buildTelemetryEnv injects CLAUDE_CODE_ENABLE_TELEMETRY + OTEL_RESOURCE_ATTRIBUTES with all four dims", () => {
  const env = buildTelemetryEnv({ task_id: "patch-webhook", arm: "skailr", run_id: "r1", skailr_version: "1.2.3" });
  assert.equal(env.CLAUDE_CODE_ENABLE_TELEMETRY, "1");
  assert.match(env.OTEL_RESOURCE_ATTRIBUTES, /bench\.task=patch-webhook/);
  assert.match(env.OTEL_RESOURCE_ATTRIBUTES, /bench\.arm=skailr/);
  assert.match(env.OTEL_RESOURCE_ATTRIBUTES, /bench\.run_id=r1/);
  assert.match(env.OTEL_RESOURCE_ATTRIBUTES, /skailr\.version=1\.2\.3/);
});

test("telemetry: readOtelRecords returns [] when otel/ absent", () => {
  const runDir = mkTmp();
  assert.deepEqual(readOtelRecords(runDir), []);
});

test("telemetry: readOtelRecords parses the mock telemetry blob (mock-streamjson contract)", () => {
  const runDir = mkTmp();
  writeMockRun(runDir, { sessionId: "s1", promptId: "p1", model: "claude-sonnet-4-5-20250929", flavor: "solved" });
  const records = readOtelRecords(runDir);
  assert.ok(records.length >= 2);
  assert.ok(records.some((r) => r.source === "main"));
  assert.ok(records.some((r) => r.source === "subagent"));
});

test("telemetry: deriveFallbackTelemetry builds a single main-source record from result.usage", () => {
  const resultEvent = { usage: { input_tokens: 100, output_tokens: 40, cache_read_input_tokens: 5, cache_creation_input_tokens: 2 } };
  const events = [{ type: "tool_use", name: "Read", ok: true }, { type: "tool_use", name: "Edit", ok: false }];
  const [rec] = deriveFallbackTelemetry({ sessionId: "s1", promptId: "p1", model: "m", resultEvent, events });
  assert.equal(rec.source, "main");
  assert.equal(rec.tokens.input, 100);
  assert.equal(rec.tool_calls, 2);
  assert.equal(rec.failed_tool_calls, 1);
});

test("telemetry: foldUsage sums tokens across records into tokens/by_model/by_source/by_agent, zero-filling unused sources", () => {
  const records = [
    { session_id: "s", prompt_id: "p", source: "main", model: "m1", agent_name: null, skill_name: null, tokens: { input: 10, output: 5, cache_read: 0, cache_create: 0 }, tool_calls: 1, failed_tool_calls: 0 },
    { session_id: "s", prompt_id: "p", source: "subagent", model: "m1", agent_name: "worker", skill_name: null, tokens: { input: 4, output: 2, cache_read: 0, cache_create: 0 }, tool_calls: 1, failed_tool_calls: 0 },
  ];
  const usage = foldUsage(records);
  assert.equal(usage.tokens.input, 14);
  assert.equal(usage.by_model.m1.input, 14);
  assert.equal(usage.by_source.main.input, 10);
  assert.equal(usage.by_source.subagent.input, 4);
  assert.equal(usage.by_source.auxiliary.input, 0);
  assert.equal(usage.by_agent.worker.input, 4);
});

test("telemetry: foldTrajectory counts assistant events + sums tool_calls/failed_tool_calls from records", () => {
  const events = [{ type: "assistant" }, { type: "assistant" }, { type: "tool_use", name: "Read", ok: true }];
  const records = [{ tool_calls: 3, failed_tool_calls: 1 }];
  const traj = foldTrajectory(records, events);
  assert.equal(traj.model_requests, 2);
  assert.equal(traj.tool_calls, 3);
  assert.equal(traj.failed_tool_calls, 1);
});

test("AC-6: computeCost per-category matches kernel pricing.mjs reconstructCost exactly (never total_tokens x single rate)", () => {
  const tokens = { input: 1_000_000, output: 500_000, cache_read: 200_000, cache_create: 100_000 };
  const { cost_reconstructed_usd, pricing_table_version } = computeCost({
    tokens, pricingTable: PRICING, modelId: "claude-sonnet-4-5-20250929", resultEvent: { total_cost_usd: 12.34 },
  });
  const expected = reconstructCost(tokens, PRICING, "claude-sonnet-4-5-20250929");
  assert.equal(cost_reconstructed_usd, expected.cost_reconstructed_usd);
  assert.equal(pricing_table_version, PRICING.version);
});

test("telemetry: computeCost passes through cost_reported_usd (null when absent)", () => {
  const tokens = { input: 0, output: 0, cache_read: 0, cache_create: 0 };
  const withCost = computeCost({ tokens, pricingTable: PRICING, modelId: "claude-sonnet-4-5-20250929", resultEvent: { total_cost_usd: 5 } });
  assert.equal(withCost.cost_reported_usd, 5);
  const noResult = computeCost({ tokens, pricingTable: PRICING, modelId: "claude-sonnet-4-5-20250929", resultEvent: null });
  assert.equal(noResult.cost_reported_usd, null);
});

test("telemetry: buildTelemetry mock-mode path (otel/telemetry.json present) folds into full usage/trajectory/cost, schema-shape-consistent with run.json groups", () => {
  const runDir = mkTmp();
  const { events } = writeMockRun(runDir, { sessionId: "s1", promptId: "p1", model: "claude-sonnet-4-5-20250929", flavor: "solved" });
  const resultEvent = events.find((e) => e.type === "result");
  const out = buildTelemetry({
    runDir, sessionId: "s1", promptId: "p1", model: "claude-sonnet-4-5-20250929",
    resultEvent, events, pricingTable: PRICING, modelId: "claude-sonnet-4-5-20250929",
  });
  assert.ok(out.usage.tokens.input > 0);
  assert.ok(["main", "subagent", "auxiliary"].every((k) => k in out.usage.by_source));
  assert.equal(typeof out.cost.cost_reconstructed_usd, "number");
  assert.equal(out.cost.pricing_table_version, PRICING.version);
});

test("telemetry: buildTelemetry falls back to deriveFallbackTelemetry when no otel/ dir exists (degraded but never absent)", () => {
  const runDir = mkTmp(); // empty — no otel/telemetry.json written
  const resultEvent = { usage: { input_tokens: 50, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } };
  const out = buildTelemetry({
    runDir, sessionId: "s1", promptId: "p1", model: "claude-sonnet-4-5-20250929",
    resultEvent, events: [], pricingTable: PRICING, modelId: "claude-sonnet-4-5-20250929",
  });
  assert.equal(out.usage.tokens.input, 50);
  assert.deepEqual(out.usage.by_agent, {});
});
