import test from "node:test";
import assert from "node:assert/strict";
import { deriveSeriesId, deriveRunId } from "./ids.mjs";

test("ids: deriveSeriesId is deterministic for identical inputs", () => {
  const a = deriveSeriesId({ claude_code_version: "2.1.224", model_id: "claude-sonnet-4-5-20250929" });
  const b = deriveSeriesId({ claude_code_version: "2.1.224", model_id: "claude-sonnet-4-5-20250929" });
  assert.equal(a, b);
});

test("AC-7: deriveSeriesId forks when model_id changes", () => {
  const a = deriveSeriesId({ claude_code_version: "2.1.224", model_id: "claude-sonnet-4-5-20250929" });
  const b = deriveSeriesId({ claude_code_version: "2.1.224", model_id: "claude-opus-4-5-20250929" });
  assert.notEqual(a, b);
});

test("AC-7: deriveSeriesId forks when claude_code_version changes", () => {
  const a = deriveSeriesId({ claude_code_version: "2.1.224", model_id: "claude-sonnet-4-5-20250929" });
  const b = deriveSeriesId({ claude_code_version: "2.2.0", model_id: "claude-sonnet-4-5-20250929" });
  assert.notEqual(a, b);
});

test("ids: deriveSeriesId throws on missing inputs", () => {
  assert.throws(() => deriveSeriesId({ claude_code_version: "2.1.224" }));
});

test("ids: deriveRunId is deterministic and readable", () => {
  const args = { task_id: "patch-webhook", arm: "baseline", rep: 1, series_id: "series_abc", timestamp: "2026-08-07T00:00:00Z" };
  const a = deriveRunId(args);
  const b = deriveRunId(args);
  assert.equal(a, b);
  assert.match(a, /^patch-webhook_baseline_rep1_[0-9a-f]{10}$/);
});

test("ids: deriveRunId differs across arms/reps for otherwise-equal inputs", () => {
  const base = { task_id: "patch-webhook", series_id: "series_abc", timestamp: "2026-08-07T00:00:00Z" };
  const a = deriveRunId({ ...base, arm: "baseline", rep: 1 });
  const b = deriveRunId({ ...base, arm: "skailr", rep: 1 });
  const c = deriveRunId({ ...base, arm: "baseline", rep: 2 });
  assert.notEqual(a, b);
  assert.notEqual(a, c);
});

test("ids: deriveRunId throws on missing inputs", () => {
  assert.throws(() => deriveRunId({ task_id: "t", arm: "baseline", series_id: "s", timestamp: "t" }));
});
