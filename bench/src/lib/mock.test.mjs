import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { generateMockEvents, generateMockTelemetry, writeMockRun, MOCK_FLAVORS, MOCK_COST_REPORTED_DELTA } from "./mock.mjs";
import { validate } from "../schema/validate.mjs";
import { reconstructCost } from "./pricing.mjs";
import { loadConfig } from "./config.mjs";

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "bench-mock-"));
}

test("mock: supports the two AC-4-required flavors", () => {
  assert.ok(MOCK_FLAVORS.includes("solved"));
  assert.ok(MOCK_FLAVORS.includes("planted-defect"));
});

for (const flavor of ["solved", "planted-defect"]) {
  test(`mock: generateMockEvents("${flavor}") produces schema-valid events`, () => {
    const events = generateMockEvents({ sessionId: "s1", promptId: "p1", model: "claude-sonnet-4-5-20250929", flavor });
    assert.ok(events.length > 0);
    for (const e of events) {
      const { valid, errors } = validate(e, "mock-event");
      assert.equal(valid, true, JSON.stringify(errors));
    }
  });

  test(`mock: generateMockTelemetry("${flavor}") produces schema-valid records`, () => {
    const records = generateMockTelemetry({ sessionId: "s1", promptId: "p1", model: "claude-sonnet-4-5-20250929", flavor });
    assert.ok(records.length > 0);
    for (const r of records) {
      const { valid, errors } = validate(r, "mock-telemetry");
      assert.equal(valid, true, JSON.stringify(errors));
    }
  });
}

test("AC-4: solved flavor terminates with is_error:false success result", () => {
  const events = generateMockEvents({ sessionId: "s1", promptId: "p1", model: "m", flavor: "solved" });
  const result = events.find((e) => e.type === "result");
  assert.equal(result.is_error, false);
  assert.equal(result.subtype, "success");
});

test("AC-4: planted-defect flavor still terminates as a clean success from the agent's own signal (defect only visible to hidden grader)", () => {
  const events = generateMockEvents({ sessionId: "s1", promptId: "p1", model: "m", flavor: "planted-defect" });
  const result = events.find((e) => e.type === "result");
  assert.equal(result.is_error, false);
  assert.equal(result.subtype, "success");
  // The defect is NOT surfaced in the agent-visible stream — that's the
  // point: grading happens externally, never from agent self-report.
});

test("AC-2: timeout flavor terminates with an error result (drives killed-run recording)", () => {
  const events = generateMockEvents({ sessionId: "s1", promptId: "p1", model: "m", flavor: "timeout" });
  const result = events.find((e) => e.type === "result");
  assert.equal(result.is_error, true);
});

test("AC-6: mock reported cost is self-consistent with per-category reconstruction (within documented tolerance)", () => {
  const model = "claude-sonnet-4-5-20250929";
  const { pricing_table } = loadConfig();
  assert.ok(MOCK_COST_REPORTED_DELTA <= 0.05, "delta must stay inside the 5% tolerance band");
  for (const flavor of ["solved", "planted-defect", "timeout"]) {
    // Reconstruct from the SAME telemetry token totals telemetry.mjs sums.
    const total = generateMockTelemetry({ sessionId: "s", promptId: "p", model, flavor })
      .reduce((a, r) => ({
        input: a.input + r.tokens.input, output: a.output + r.tokens.output,
        cache_read: a.cache_read + r.tokens.cache_read, cache_create: a.cache_create + r.tokens.cache_create,
      }), { input: 0, output: 0, cache_read: 0, cache_create: 0 });
    const { cost_reconstructed_usd } = reconstructCost(total, pricing_table, model);
    const reported = generateMockEvents({ sessionId: "s", promptId: "p", model, flavor })
      .find((e) => e.type === "result").total_cost_usd;
    const delta = Math.abs(reported - cost_reconstructed_usd) / cost_reconstructed_usd;
    assert.ok(delta <= 0.05, `${flavor}: |reported-reconstructed| ${(delta * 100).toFixed(2)}% exceeds 5%`);
    assert.ok(delta > 0, `${flavor}: reported should differ slightly from reconstructed (realistic drift)`);
  }
});

test("mock: rejects unknown flavor", () => {
  assert.throws(() => generateMockEvents({ sessionId: "s1", promptId: "p1", model: "m", flavor: "bogus" }));
  assert.throws(() => generateMockTelemetry({ sessionId: "s1", promptId: "p1", model: "m", flavor: "bogus" }));
});

test("mock: writeMockRun writes events.jsonl (one JSON object per line) + otel/telemetry.json", () => {
  const dir = mkTmp();
  const { eventsPath, telemetryPath } = writeMockRun(dir, {
    sessionId: "s1", promptId: "p1", model: "claude-sonnet-4-5-20250929", flavor: "solved",
  });
  const lines = fs.readFileSync(eventsPath, "utf8").trim().split("\n");
  for (const line of lines) {
    const parsed = JSON.parse(line);
    assert.equal(validate(parsed, "mock-event").valid, true);
  }
  const telemetry = JSON.parse(fs.readFileSync(telemetryPath, "utf8"));
  assert.ok(Array.isArray(telemetry));
  for (const record of telemetry) {
    assert.equal(validate(record, "mock-telemetry").valid, true);
  }
});
