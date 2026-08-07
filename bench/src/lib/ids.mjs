// DOC: Deterministic ID derivation (run-json contract). series_id forks
// whenever claude_code_version or model_id changes (AC-7) — cross-series
// compares must render a warning banner (report.mjs, WS-grade-analytics).
import { createHash } from "node:crypto";

function sha256Hex(input) {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * series_id = deterministic hash over (claude_code_version, model_id).
 * Any change to either input forks the series (AC-7).
 */
export function deriveSeriesId({ claude_code_version, model_id }) {
  if (!claude_code_version || !model_id) {
    throw new Error("deriveSeriesId requires claude_code_version and model_id");
  }
  const digest = sha256Hex(`series_id/v1|${claude_code_version}|${model_id}`);
  return `series_${digest.slice(0, 12)}`;
}

/**
 * run_id = deterministic hash over (task_id, arm, rep, series_id, timestamp),
 * prefixed with a human-readable stem for log/dir scanning.
 */
export function deriveRunId({ task_id, arm, rep, series_id, timestamp }) {
  if (!task_id || !arm || rep === undefined || rep === null || !series_id || !timestamp) {
    throw new Error("deriveRunId requires task_id, arm, rep, series_id, timestamp");
  }
  const digest = sha256Hex(`run_id/v1|${task_id}|${arm}|${rep}|${series_id}|${timestamp}`);
  return `${task_id}_${arm}_rep${rep}_${digest.slice(0, 10)}`;
}
