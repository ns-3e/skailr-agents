// DOC: Mock stream-json + telemetry generator (mock-streamjson contract).
// Lets run→grade→aggregate→report be exercised with zero model spend
// (brief "mock/dry-run mode"; enables AC-1/2/4/5/6/7 in CI). claude.mjs /
// telemetry.mjs (WS-harness-core) MUST normalize real Claude Code output
// into this exact shape so mock and live paths converge downstream.
import fs from "node:fs";
import path from "node:path";
import { validateOrThrow } from "../schema/validate.mjs";
import { atomicWriteJson, ensureDir } from "./fsutil.mjs";

// Recognized flavors. "solved" / "planted-defect" are the two the kernel
// contract requires (AC-4 drives planted-defect: harness/grader treats the
// workspace as functionally passing but with a critical security defect
// baked in — solved must still end up false downstream). "timeout" and
// "crash" are bonus flavors so AC-2 (killed-run recording) is exercisable
// too; harness-core is free to add more without touching this file.
const FLAVORS = new Set(["solved", "planted-defect", "timeout", "crash"]);

function baseTokens(scale = 1) {
  return {
    input: 1200 * scale,
    output: 400 * scale,
    cache_read: 300 * scale,
    cache_create: 150 * scale,
  };
}

/**
 * Build the normalized stream-json event sequence for one mock run.
 * @returns {object[]} events, each validating against schema "mock-event"
 */
export function generateMockEvents({ sessionId, promptId, model, flavor = "solved" }) {
  if (!FLAVORS.has(flavor)) throw new Error(`generateMockEvents: unknown flavor "${flavor}"`);

  const events = [
    { type: "system", subtype: "init", session_id: sessionId, model },
    {
      type: "assistant",
      session_id: sessionId,
      prompt_id: promptId,
      message: { role: "assistant", content: [{ type: "text", text: `Working on the task (flavor=${flavor}).` }] },
    },
    { type: "tool_use", session_id: sessionId, name: "Read", ok: true },
    { type: "tool_use", session_id: sessionId, name: "Edit", ok: true },
  ];

  if (flavor === "solved") {
    events.push({
      type: "result",
      subtype: "success",
      session_id: sessionId,
      is_error: false,
      num_turns: 6,
      total_cost_usd: 0.0421,
      usage: { input_tokens: 1200, output_tokens: 400, cache_read_input_tokens: 300, cache_creation_input_tokens: 150 },
    });
  } else if (flavor === "planted-defect") {
    // Agent believes it finished cleanly (visible tests pass) — the defect
    // is only caught by the hidden grader, never by the agent's own signal.
    events.push({
      type: "tool_use", session_id: sessionId, name: "Bash", ok: true,
    });
    events.push({
      type: "result",
      subtype: "success",
      session_id: sessionId,
      is_error: false,
      num_turns: 8,
      total_cost_usd: 0.0587,
      usage: { input_tokens: 1500, output_tokens: 520, cache_read_input_tokens: 300, cache_creation_input_tokens: 150 },
    });
  } else if (flavor === "timeout") {
    events.push({
      type: "result",
      subtype: "error",
      session_id: sessionId,
      is_error: true,
      num_turns: 4,
      total_cost_usd: 0.0198,
      usage: { input_tokens: 900, output_tokens: 210, cache_read_input_tokens: 100, cache_creation_input_tokens: 0 },
    });
  } else if (flavor === "crash") {
    events.push({
      type: "result",
      subtype: "error",
      session_id: sessionId,
      is_error: true,
      num_turns: 2,
      total_cost_usd: null,
      usage: { input_tokens: 300, output_tokens: 40, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    });
  }

  for (const event of events) validateOrThrow(event, "mock-event");
  return events;
}

/**
 * Build the normalized OTel telemetry records for one mock run, split
 * across main/subagent/auxiliary sources so run.json usage.by_source has
 * something realistic to fold.
 */
export function generateMockTelemetry({ sessionId, promptId, model, flavor = "solved" }) {
  if (!FLAVORS.has(flavor)) throw new Error(`generateMockTelemetry: unknown flavor "${flavor}"`);

  const records = [
    {
      session_id: sessionId, prompt_id: promptId, source: "main", model,
      agent_name: null, skill_name: null,
      tokens: baseTokens(1), tool_calls: 3, failed_tool_calls: 0,
    },
    {
      session_id: sessionId, prompt_id: promptId, source: "subagent", model,
      agent_name: "sub-worker", skill_name: null,
      tokens: baseTokens(0.4), tool_calls: 1, failed_tool_calls: flavor === "crash" ? 1 : 0,
    },
  ];

  if (flavor === "planted-defect") {
    records.push({
      session_id: sessionId, prompt_id: promptId, source: "auxiliary", model,
      agent_name: null, skill_name: "shortcut-taken",
      tokens: baseTokens(0.2), tool_calls: 1, failed_tool_calls: 0,
    });
  }

  for (const record of records) validateOrThrow(record, "mock-telemetry");
  return records;
}

/**
 * Generate + write a full mock run's raw artifacts (events.jsonl +
 * otel/telemetry.json) into `runDir`, mirroring what claude.mjs/telemetry.mjs
 * would capture from a live `claude` invocation. Returns the paths written.
 */
export function writeMockRun(runDir, { sessionId, promptId, model, flavor = "solved" }) {
  ensureDir(runDir);
  const events = generateMockEvents({ sessionId, promptId, model, flavor });
  const telemetry = generateMockTelemetry({ sessionId, promptId, model, flavor });

  const eventsPath = path.join(runDir, "events.jsonl");
  const eventsText = events.map((e) => JSON.stringify(e)).join("\n") + "\n";
  fs.writeFileSync(eventsPath, eventsText, "utf8");

  const telemetryPath = path.join(runDir, "otel", "telemetry.json");
  atomicWriteJson(telemetryPath, telemetry);

  return { eventsPath, telemetryPath, events, telemetry };
}

export const MOCK_FLAVORS = Array.from(FLAVORS);
