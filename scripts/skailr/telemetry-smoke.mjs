#!/usr/bin/env node
/**
 * telemetry-smoke.mjs — executable proof for emit-telemetry.mjs (AC-9..16).
 *
 * Runs span-start + span-end against a scratch temp dir (never the real repo's
 * .skailr/), re-reads the written lines, INDEPENDENTLY recomputes event_hash and
 * asserts byte-equality, asserts LF-termination with no partial line, asserts the
 * filename/date pattern, and asserts emit_seq increments across a second pair.
 *
 * Exit 0 on all-pass; non-zero with a clear message on any mismatch.
 */
import { mkdtempSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, "emit-telemetry.mjs");
const EMITTER = "smoke";

function fail(msg) {
  console.error(`SMOKE FAIL: ${msg}`);
  process.exit(1);
}
function assert(cond, msg) {
  if (!cond) fail(msg);
}

// Independent re-implementation of JCS + event_hash (must match the CLI byte-for-byte).
function jcs(v) {
  if (v === null) return "null";
  const t = typeof v;
  if (t === "string") return JSON.stringify(v);
  if (t === "number") {
    if (!Number.isInteger(v)) throw new Error("non-integer in subset");
    return String(v);
  }
  if (t === "boolean") return v ? "true" : "false";
  if (Array.isArray(v)) return "[" + v.map(jcs).join(",") + "]";
  const keys = Object.keys(v).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + jcs(v[k])).join(",") + "}";
}
const SUBSET_KEYS = [
  "v", "emit_seq", "ts", "event_type", "trace_id", "span_id", "parent_span_id",
  "hierarchy_path", "agent_role", "agent_name", "model", "tokens_in", "tokens_out",
  "cache_read_tokens", "cache_write_tokens", "status", "corrects_event_hash",
];
function recomputeHash(rec) {
  const sub = {};
  for (const k of SUBSET_KEYS) sub[k] = rec[k];
  return "sha256:" + createHash("sha256").update(jcs(sub), "utf8").digest("hex");
}

function run(cwd, args) {
  return execFileSync("node", [CLI, ...args], { cwd, encoding: "utf8" });
}

// Run a start/end pair; return { start, end } handle+parsed. Writes into cwd/.skailr.
function pair(cwd, traceId) {
  const out = run(cwd, [
    "span-start",
    "--emitter-id", EMITTER,
    "--trace-id", traceId,
    "--agent-role", "data",
    "--ticket", "T-001",
    "--program", "Telemetry Prog",
    "--attrs", '{"k":1}',
  ]).trim();
  const handle = JSON.parse(out);
  assert(handle.disabled === false, `span-start returned disabled handle: ${out}`);
  run(cwd, ["span-end", "--handle", JSON.stringify(handle), "--status", "ok"]);
  return handle;
}

function readLog(cwd) {
  const dir = join(cwd, ".skailr", "telemetry");
  const files = readdirSync(dir);
  assert(files.length === 1, `expected exactly one telemetry file, got ${files.join(",")}`);
  const name = files[0];
  // AC-9: <YYYY-MM-DD>-<emitter-id>.jsonl
  assert(
    /^\d{4}-\d{2}-\d{2}-smoke\.jsonl$/.test(name),
    `filename does not match date-emitter pattern: ${name}`
  );
  const raw = readFileSync(join(dir, name), "utf8");
  // AC-10/11: file terminates with LF; no partial trailing line.
  assert(raw.endsWith("\n"), "file does not end with LF (partial line risk)");
  assert(!/\n\s*\n$/.test(raw), "trailing blank line present");
  const lines = raw.slice(0, -1).split("\n");
  return lines;
}

function checkLine(line) {
  assert(!line.includes("\r"), "line contains CR");
  const rec = JSON.parse(line); // one JSON object per line (AC-10)
  assert(rec.v === 1, `v is not literal int 1: ${rec.v}`);
  assert(!Array.isArray(rec), "record is an array");
  const got = rec.event_hash;
  const want = recomputeHash(rec);
  assert(got === want, `event_hash mismatch\n  stored: ${got}\n  recomputed: ${want}`);
  return rec;
}

function main() {
  const cwd = mkdtempSync(join(tmpdir(), "skailr-smoke-"));
  mkdirSync(join(cwd, ".skailr"), { recursive: true }); // enable emission (AC-17)

  const traceId = run(cwd, ["new-id"]).trim();
  assert(/^[0-9a-f-]{36}$/.test(traceId), `new-id did not print a UUID: ${traceId}`);

  // Pair 1
  pair(cwd, traceId);
  let lines = readLog(cwd);
  assert(lines.length === 2, `expected 2 lines after first pair, got ${lines.length}`);
  const r1s = checkLine(lines[0]);
  const r1e = checkLine(lines[1]);
  assert(r1s.event_type === "span.start", "line 1 not span.start");
  assert(r1e.event_type === "span.end", "line 2 not span.end");
  assert(r1s.span_id === r1e.span_id, "span_id mismatch between start/end");
  assert(r1e.duration_ms === Date.parse(r1e.end_ts) - Date.parse(r1e.start_ts), "duration_ms != end-start");
  assert(r1e.duration_ms >= 0, "negative duration_ms");
  // AC-15: monotonic per emitter/day file
  assert(r1s.emit_seq === 1, `first emit_seq expected 1, got ${r1s.emit_seq}`);
  assert(r1e.emit_seq === 2, `second emit_seq expected 2, got ${r1e.emit_seq}`);
  // AC-18: token/cost fields null, never fabricated
  for (const k of ["tokens_in", "tokens_out", "cache_read_tokens", "cache_write_tokens", "cost_usd"]) {
    assert(r1e[k] === null, `${k} should be null (AC-18)`);
  }

  // Pair 2 — emit_seq must keep climbing in the same file.
  pair(cwd, traceId);
  lines = readLog(cwd);
  assert(lines.length === 4, `expected 4 lines after second pair, got ${lines.length}`);
  const r2s = checkLine(lines[2]);
  const r2e = checkLine(lines[3]);
  assert(r2s.emit_seq === 3, `pair-2 start emit_seq expected 3, got ${r2s.emit_seq}`);
  assert(r2e.emit_seq === 4, `pair-2 end emit_seq expected 4, got ${r2e.emit_seq}`);
  assert(r2s.emit_seq > r1e.emit_seq, "emit_seq did not increase across pairs");

  console.log("SMOKE PASS: 4 records, event_hash reproducible, LF-terminated, emit_seq monotonic.");
  process.exit(0);
}

main();
