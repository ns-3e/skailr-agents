// DOC: F-011 — telemetry collection + parse/normalize into run.json
// Usage/Cost/Trajectory groups (FR-6, Q1, "per-category cost" non-negotiable).
//
// OTEL MECHANISM CHOICE (documented per brief Q1 fallback clause): this repo
// has never executed a live `claude -p` invocation against a real OTel
// collector (doing so would spend real model budget — see claude.mjs
// top-of-file note), so file-exporter support in installed 2.1.224 is
// UNVERIFIED. Rather than stand up a local OTLP collector process per run
// (an extra long-running service, in tension with the "zero external
// services" NFR, and unverifiable here without spend), this module:
//   1. Still SETS the documented Claude Code telemetry env vars
//      (CLAUDE_CODE_ENABLE_TELEMETRY=1, OTEL_METRICS_EXPORTER=otlp,
//      OTEL_LOGS_EXPORTER=otlp) plus OTEL_RESOURCE_ATTRIBUTES so that IF a
//      given install does emit files/logs, best-effort discovery
//      (readOtelRecords) picks them up from <runDir>/otel/*.json.
//   2. PRIMARY parse path: stream-json `result.usage` (input/output/
//      cache_read/cache_creation) is the one signal `claude.mjs` always has
//      —its own source is "main" only; no subagent/auxiliary/agent-name
//      breakdown is derivable from stream-json alone in this CLI version
//      (no separate agent-attributed event type observed in --help/schema).
//      When no otel/*.json records are found, usage collapses to a single
//      by_source.main record and by_agent stays {} — degraded but never
//      absent (never blocks a run.json write).
//   3. Mock mode is the fully exercised, schema-verified path: it reads the
//      kernel-generated otel/telemetry.json (already split across
//      main/subagent/auxiliary per mock-streamjson contract) directly.
// Flag architect if/when a real campaign confirms file-exporter support so
// this fallback can be promoted to primary.
import fs from "node:fs";
import path from "node:path";
import { validate } from "./schema/validate.mjs";
import { reconstructCost } from "./lib/pricing.mjs";

export function buildTelemetryEnv({ task_id, arm, run_id, skailr_version }) {
  const resourceAttrs = [
    `bench.task=${task_id}`,
    `bench.arm=${arm}`,
    `bench.run_id=${run_id}`,
    `skailr.version=${skailr_version ?? "none"}`,
  ].join(",");
  return {
    CLAUDE_CODE_ENABLE_TELEMETRY: "1",
    OTEL_METRICS_EXPORTER: "otlp",
    OTEL_LOGS_EXPORTER: "otlp",
    OTEL_RESOURCE_ATTRIBUTES: resourceAttrs,
  };
}

const emptyTokens = () => ({ input: 0, output: 0, cache_read: 0, cache_create: 0 });

function addTokens(a, b) {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cache_read: a.cache_read + b.cache_read,
    cache_create: a.cache_create + b.cache_create,
  };
}

/**
 * Best-effort discovery of real OTel output files written under
 * `<runDir>/otel/`. Each file is expected to contain either a single
 * normalized telemetry record or an array of them (mock-streamjson
 * "telemetry" shape). Malformed/absent -> [].
 */
export function readOtelRecords(runDir) {
  const otelDir = path.join(runDir, "otel");
  if (!fs.existsSync(otelDir)) return [];
  const records = [];
  for (const name of fs.readdirSync(otelDir)) {
    if (!name.endsWith(".json")) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(otelDir, name), "utf8"));
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      for (const record of arr) {
        if (validate(record, "mock-telemetry").valid) records.push(record);
      }
    } catch {
      // Unparseable/foreign file under otel/ — ignored, not fatal.
    }
  }
  return records;
}

// DOC: tool-call counting from the raw stream-json event list. Two event
// shapes must both be handled:
//   1. Mock-mode shape (mock.mjs) — flat top-level `{type:"tool_use",ok}`
//      events. Kept for back-compat with existing mock fixtures/tests.
//   2. Real Claude Code stream-json shape (verified 2026-08-08 against a
//      live non-mock run's stdout.log) — there is NO top-level
//      `type:"tool_use"` event at all. Tool-use blocks are nested inside
//      `{type:"assistant", message:{content:[{type:"tool_use",...}]}}`
//      events, and their results as `{type:"user", message:{content:
//      [{type:"tool_result", is_error}]}}`. This is true for BOTH the
//      top-level agent's own tool calls AND every subagent dispatched via
//      the Task/Agent tool — subagent turns appear in the SAME flat
//      stdout.log, distinguished only by a `parent_tool_use_id` +
//      `subagent_type` field on the `assistant` event, not by a different
//      event shape. Counting only shape (1) is why every real Skailr-arm
//      run.json previously reported `trajectory.tool_calls: 0` regardless
//      of real work done (files edited, tokens spent, up to 114 turns) —
//      the fallback path never matched shape (2) at all, main OR subagent.
//      Fixed by counting both shapes.
export function countToolCallsInEvents(events) {
  let toolCalls = 0;
  let failedToolCalls = 0;
  for (const e of events) {
    if (e.type === "tool_use") {
      toolCalls++;
      if (e.ok === false) failedToolCalls++;
      continue;
    }
    const content = e.message?.content;
    if (!Array.isArray(content)) continue;
    if (e.type === "assistant") {
      for (const block of content) {
        if (block && block.type === "tool_use") toolCalls++;
      }
    } else if (e.type === "user") {
      for (const block of content) {
        if (block && block.type === "tool_result" && block.is_error === true) failedToolCalls++;
      }
    }
  }
  return { toolCalls, failedToolCalls };
}

/** Degraded fallback: one "main" telemetry record derived from the
 * stream-json result event's usage block, when no real/mock otel records
 * exist. See top-of-file OTEL MECHANISM CHOICE. */
export function deriveFallbackTelemetry({ sessionId, promptId, model, resultEvent, events = [] }) {
  const usage = resultEvent?.usage || {};
  const { toolCalls, failedToolCalls } = countToolCallsInEvents(events);
  return [
    {
      session_id: sessionId,
      prompt_id: promptId,
      source: "main",
      model,
      agent_name: null,
      skill_name: null,
      tokens: {
        input: usage.input_tokens || 0,
        output: usage.output_tokens || 0,
        cache_read: usage.cache_read_input_tokens || 0,
        cache_create: usage.cache_creation_input_tokens || 0,
      },
      tool_calls: toolCalls,
      failed_tool_calls: failedToolCalls,
    },
  ];
}

/** Fold telemetry records into run.json's `usage` group shape. */
export function foldUsage(records) {
  const tokens = emptyTokens();
  const by_model = {};
  const by_source = { main: emptyTokens(), subagent: emptyTokens(), auxiliary: emptyTokens() };
  const by_agent = {};

  for (const r of records) {
    const t = r.tokens || emptyTokens();
    Object.assign(tokens, addTokens(tokens, t));
    by_model[r.model] = addTokens(by_model[r.model] || emptyTokens(), t);
    if (by_source[r.source]) by_source[r.source] = addTokens(by_source[r.source], t);
    if (r.agent_name) by_agent[r.agent_name] = addTokens(by_agent[r.agent_name] || emptyTokens(), t);
  }

  return { tokens, by_model, by_source, by_agent };
}

/** Fold telemetry + stream-json events into run.json's `trajectory` group. */
export function foldTrajectory(records, events = []) {
  const model_requests = events.filter((e) => e.type === "assistant").length;
  const tool_calls = records.reduce((s, r) => s + (r.tool_calls || 0), 0);
  const failed_tool_calls = records.reduce((s, r) => s + (r.failed_tool_calls || 0), 0);
  const retries = events.filter((e) => e.type === "retry").length;
  const compactions = events.filter((e) => e.type === "compaction" || e.subtype === "compact").length;
  return { model_requests, tool_calls, failed_tool_calls, retries, compactions };
}

/** Compute run.json `cost` group: reported (from stream-json result, may be
 * null) + reconstructed (per-category, kernel pricing.mjs — never
 * total_tokens × rate, AC-6). */
export function computeCost({ tokens, pricingTable, modelId, resultEvent }) {
  const { cost_reconstructed_usd, pricing_table_version } = reconstructCost(tokens, pricingTable, modelId);
  return {
    cost_reported_usd: resultEvent?.total_cost_usd ?? null,
    cost_reconstructed_usd,
    pricing_table_version,
  };
}

/**
 * Composite: given a completed invokeClaude() result + runDir + pricing
 * config, produce the run.json usage/cost/trajectory groups in one call.
 */
export function buildTelemetry({ runDir, sessionId, promptId, model, resultEvent, events, pricingTable, modelId }) {
  let records = readOtelRecords(runDir);
  if (records.length === 0) {
    records = deriveFallbackTelemetry({ sessionId, promptId, model, resultEvent, events });
  }
  const usage = foldUsage(records);
  const trajectory = foldTrajectory(records, events);
  const cost = computeCost({ tokens: usage.tokens, pricingTable, modelId, resultEvent });
  return { usage, trajectory, cost };
}
