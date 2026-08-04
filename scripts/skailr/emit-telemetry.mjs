#!/usr/bin/env node
/**
 * emit-telemetry.mjs — Skailr telemetry CLI + lib. Zero external deps.
 *
 * Subcommands (every one exits 0 ALWAYS — AC-16):
 *   new-id                    print a UUIDv4, never writes a file.
 *   span-start <flags>        self-gate (AC-17); write one span.start line iff enabled;
 *                             print a handle JSON to stdout (or {"disabled":true}).
 *   span-end   --handle <j>   write one span.end line reusing the handle's identity;
 *                             no-op when handle.disabled===true.
 *
 * Contract (flags, handle shape, record & hashing rules) is frozen in
 * .claude/tmp/spec.md → "API Contract" + "Record & hashing rules". Do not deviate.
 *
 * Every internal fault is swallowed: process exits 0, at most one `telemetry:` line
 * on stderr, never a partial/oversized line on disk.
 */
import {
  existsSync, mkdirSync, openSync, writeSync, closeSync, readSync, statSync,
  readFileSync,
} from "node:fs";
import { join, basename } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";

const MAX_FILE = 100 * 1024 * 1024; // 100 MiB rotation threshold (AC-12)
const MAX_LINE = 64 * 1024; // 64 KiB serialized line ceiling (AC-13)
const MAX_ATTR_KEYS = 32; // AC-21
const MAX_ATTR_BYTES = 1024; // 1 KiB serialized attrs (AC-21)
const TAIL = 256 * 1024; // emit_seq tail-scan window (AC-15)

// ---------- gating (AC-17) ----------
function isEnabled() {
  try {
    const p = join(process.cwd(), ".claude", "settings.skailr.json");
    if (existsSync(p)) {
      const s = JSON.parse(readFileSync(p, "utf8"));
      if (s && s.telemetry && typeof s.telemetry.enabled === "boolean") {
        return s.telemetry.enabled; // explicit disable/enable always wins
      }
    }
  } catch {
    /* malformed settings → fall through to presence check */
  }
  return existsSync(join(process.cwd(), ".skailr"));
}

// ---------- slugs & derivations ----------
function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-");
}
function slugEmitter(s) {
  let x = String(s)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-");
  if (!x) x = "default";
  return x.slice(0, 32); // [a-z0-9-]{1,32} (AC-9)
}
function deriveRepo() {
  try {
    const url = execFileSync("git", ["remote", "get-url", "origin"], {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    if (url) {
      let b = url.split("/").pop().split(":").pop().replace(/\.git$/, "");
      if (b) return b;
    }
  } catch {
    /* no git / no remote → cwd basename */
  }
  return basename(process.cwd());
}
function nowTs() {
  return new Date().toISOString(); // RFC 3339 UTC, ms precision, Z (EC-10)
}
function utcDate() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD, UTC (AC-9)
}
function telemetryDir() {
  return join(process.cwd(), ".skailr", "telemetry");
}

// ---------- hierarchy_path (AC-8 / EC-9) ----------
function buildHierarchy({ portfolio, repo, program, workstream, feature, ticket, spanId }) {
  const levels = [
    ["portfolio", portfolio],
    ["repo", repo],
    ["program", program],
    ["workstream", workstream],
    ["feature", feature],
    ["ticket", ticket],
  ];
  const segs = [];
  const mirror = { repo: null, program: null, workstream: null, feature: null };
  for (const [label, val] of levels) {
    if (val === undefined || val === null || val === "") continue;
    const s = slugify(String(val));
    if (!s) continue; // never emit a level with an empty value
    segs.push(`${label}:${s}`);
    if (label in mirror) mirror[label] = s;
  }
  segs.push(`agent-run:${String(spanId).toLowerCase()}`);
  return { path: segs.join("/"), mirror };
}

// ---------- JCS canonicalization + event_hash (AC-14) ----------
function jcsCanon(value) {
  if (value === null) return "null";
  const t = typeof value;
  if (t === "string") return JSON.stringify(value); // RFC 8785 string escaping
  if (t === "number") {
    if (!Number.isInteger(value)) throw new Error("non-integer number in identity subset");
    return String(value);
  }
  if (t === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return "[" + value.map(jcsCanon).join(",") + "]";
  if (t === "object") {
    // Object.keys().sort() compares by UTF-16 code unit — RFC 8785 key order.
    const keys = Object.keys(value).sort();
    return "{" + keys.map((k) => JSON.stringify(k) + ":" + jcsCanon(value[k])).join(",") + "}";
  }
  throw new Error("unsupported type in identity subset");
}
// identity_subset = exactly these 17 fields (spec.md "Record & hashing rules").
function identitySubset(id) {
  return {
    v: id.v,
    emit_seq: id.emit_seq,
    ts: id.ts,
    event_type: id.event_type,
    trace_id: id.trace_id,
    span_id: id.span_id,
    parent_span_id: id.parent_span_id,
    hierarchy_path: id.hierarchy_path,
    agent_role: id.agent_role,
    agent_name: id.agent_name,
    model: id.model,
    tokens_in: id.tokens_in,
    tokens_out: id.tokens_out,
    cache_read_tokens: id.cache_read_tokens,
    cache_write_tokens: id.cache_write_tokens,
    status: id.status,
    corrects_event_hash: id.corrects_event_hash,
  };
}
function computeEventHash(id) {
  const canon = jcsCanon(identitySubset(id));
  return "sha256:" + createHash("sha256").update(canon, "utf8").digest("hex");
}

// ---------- emit_seq scan (AC-15 / EC-14) ----------
function scanEmitSeq(file) {
  if (!existsSync(file)) return 0;
  const size = statSync(file).size;
  if (size === 0) return 0;
  const readLen = Math.min(size, TAIL);
  const fd = openSync(file, "r");
  const buf = Buffer.alloc(readLen);
  try {
    readSync(fd, buf, 0, readLen, size - readLen);
  } finally {
    closeSync(fd);
  }
  const lines = buf.toString("utf8").split("\n");
  if (size > readLen) lines.shift(); // drop a partial leading line
  let max = 0;
  for (let ln of lines) {
    ln = ln.replace(/\r$/, "").trim(); // tolerate CRLF
    if (!ln) continue;
    try {
      const o = JSON.parse(ln); // a partial trailing line just fails → skipped
      if (Number.isInteger(o.emit_seq) && o.emit_seq > max) max = o.emit_seq;
    } catch {
      /* partial / corrupt line ignored */
    }
  }
  return max;
}

// ---------- rotation (AC-12) ----------
function rotationTarget(dir, date, emitterId) {
  const base = join(dir, `${date}-${emitterId}.jsonl`);
  if (!existsSync(base) || statSync(base).size < MAX_FILE) return base;
  for (let k = 1; ; k++) {
    const f = join(dir, `${date}-${emitterId}-${k}.jsonl`);
    if (!existsSync(f) || statSync(f).size < MAX_FILE) return f;
  }
}

// ---------- attrs safety (AC-21) ----------
function parseAttrs(str) {
  if (!str) return {};
  try {
    const o = JSON.parse(str);
    if (o && typeof o === "object" && !Array.isArray(o)) return o;
  } catch {
    /* unparseable attrs → empty */
  }
  return {};
}
function truncateAttrs(attrs) {
  let entries = Object.entries(attrs);
  if (entries.length > MAX_ATTR_KEYS) entries = entries.slice(0, MAX_ATTR_KEYS);
  // drop lowest-priority (last-added) keys until ≤1KiB serialized
  while (entries.length && Buffer.byteLength(JSON.stringify(Object.fromEntries(entries)), "utf8") > MAX_ATTR_BYTES) {
    entries.pop();
  }
  return Object.fromEntries(entries);
}

// ---------- record assembly + atomic write (AC-10/11/13) ----------
function orderedRecord(id, present, eventHash, attrs) {
  // Top-level key order per request.md record shape. `v` is the literal int 1.
  return {
    v: 1,
    event_hash: eventHash,
    emit_seq: id.emit_seq,
    ts: id.ts,
    start_ts: present.start_ts,
    end_ts: present.end_ts,
    duration_ms: present.duration_ms,
    event_type: id.event_type,
    trace_id: id.trace_id,
    span_id: id.span_id,
    parent_span_id: id.parent_span_id,
    hierarchy_path: id.hierarchy_path,
    repo: present.repo,
    program: present.program,
    workstream: present.workstream,
    feature: present.feature,
    ticket: present.ticket,
    agent_role: id.agent_role,
    agent_name: id.agent_name,
    model: id.model,
    tokens_in: null,
    tokens_out: null,
    cache_read_tokens: null,
    cache_write_tokens: null,
    cost_usd: null, // AC-18: never fabricated
    price_table_version: null,
    status: id.status,
    corrects_event_hash: id.corrects_event_hash,
    error: present.error,
    attrs,
  };
}
function writeLine(file, record) {
  let line = JSON.stringify(record);
  if (Buffer.byteLength(line, "utf8") + 1 > MAX_LINE) {
    record.attrs = {}; // drop attrs entirely (AC-13) — does not affect event_hash
    line = JSON.stringify(record);
    if (Buffer.byteLength(line, "utf8") + 1 > MAX_LINE) {
      throw new Error("line exceeds 64KiB after dropping attrs; write skipped");
    }
  }
  // single atomic O_APPEND writeSync of the full line + newline (AC-11)
  const fd = openSync(file, "a");
  try {
    writeSync(fd, Buffer.from(line + "\n", "utf8"));
  } finally {
    closeSync(fd);
  }
}
function assembleAndWrite({ emitterId, id, present, attrs }) {
  const dir = telemetryDir();
  mkdirSync(dir, { recursive: true }); // EC-1
  const file = rotationTarget(dir, utcDate(), emitterId);
  id.emit_seq = scanEmitSeq(file) + 1; // 1 + max (0 if new/empty) — AC-15
  const eventHash = computeEventHash(id);
  writeLine(file, orderedRecord(id, present, eventHash, attrs));
}

// ---------- arg parsing ----------
function parseArgs(argv) {
  const o = {};
  for (let i = 3; i < argv.length; i++) {
    const t = argv[i];
    if (!t.startsWith("--")) continue;
    const key = t.slice(2);
    const nx = argv[i + 1];
    if (nx !== undefined && !nx.startsWith("--")) {
      o[key] = nx;
      i++;
    } else {
      o[key] = "";
    }
  }
  return o;
}
function req(a, name) {
  if (!a[name]) throw new Error(`missing required --${name}`);
  return a[name];
}

// ---------- subcommands ----------
function cmdSpanStart(a) {
  if (!isEnabled()) return { disabled: true }; // AC-17 — no file
  const emitterId = slugEmitter(req(a, "emitter-id"));
  const traceId = req(a, "trace-id");
  const agentRole = req(a, "agent-role");
  const agentName = a["agent-name"] || agentRole;
  const portfolio = a["portfolio"] || "default";
  const repoRaw = a["repo"] || deriveRepo();
  const parentSpanId = a["parent-span-id"] ? a["parent-span-id"] : null; // AC-5
  const model = a["model"] || null;
  const ticketDeclared = a["ticket"] || null;
  const spanId = randomUUID();
  const now = nowTs();
  const h = buildHierarchy({
    portfolio,
    repo: repoRaw,
    program: a["program"],
    workstream: a["workstream"],
    feature: a["feature"],
    ticket: ticketDeclared,
    spanId,
  });
  const id = {
    v: 1,
    emit_seq: 0,
    ts: now,
    event_type: "span.start",
    trace_id: traceId,
    span_id: spanId,
    parent_span_id: parentSpanId,
    hierarchy_path: h.path,
    agent_role: agentRole,
    agent_name: agentName,
    model,
    tokens_in: null,
    tokens_out: null,
    cache_read_tokens: null,
    cache_write_tokens: null,
    status: "ok",
    corrects_event_hash: null,
  };
  const present = {
    start_ts: now,
    end_ts: null,
    duration_ms: null,
    repo: h.mirror.repo,
    program: h.mirror.program,
    workstream: h.mirror.workstream,
    feature: h.mirror.feature,
    ticket: ticketDeclared, // declared case in the record field
    error: null,
  };
  assembleAndWrite({ emitterId, id, present, attrs: truncateAttrs(parseAttrs(a["attrs"])) });
  // handle — passed verbatim to span-end
  return {
    disabled: false,
    span_id: spanId,
    start_ts: now,
    trace_id: traceId,
    parent_span_id: parentSpanId,
    hierarchy_path: h.path,
    repo: h.mirror.repo,
    program: h.mirror.program,
    workstream: h.mirror.workstream,
    feature: h.mirror.feature,
    ticket: ticketDeclared,
    agent_role: agentRole,
    agent_name: agentName,
    model,
    emitter_id: emitterId,
    portfolio: slugify(portfolio),
  };
}

function cmdSpanEnd(a) {
  const raw = a["handle"];
  if (!raw) return;
  let h;
  try {
    h = JSON.parse(raw);
  } catch {
    return; // unparseable handle → no-op
  }
  if (!h || h.disabled === true) return; // gated by the handle
  const now = nowTs();
  const start = h.start_ts;
  const duration = Date.parse(now) - Date.parse(start); // exact ms (AC-2)
  const status = a["status"] || "ok";
  let error = null;
  if (status === "error" || status === "timeout") {
    error = {
      code: a["error-code"] || "E_UNKNOWN",
      message: a["error-message"] || "no message provided",
    }; // AC-3 — schema requires both fields as non-null strings whenever status is error/timeout
  }
  const id = {
    v: 1,
    emit_seq: 0,
    ts: now,
    event_type: "span.end",
    trace_id: h.trace_id,
    span_id: h.span_id,
    parent_span_id: h.parent_span_id ?? null,
    hierarchy_path: h.hierarchy_path,
    agent_role: h.agent_role,
    agent_name: h.agent_name,
    model: h.model ?? null,
    tokens_in: null,
    tokens_out: null,
    cache_read_tokens: null,
    cache_write_tokens: null,
    status,
    corrects_event_hash: null,
  };
  const present = {
    start_ts: start,
    end_ts: now,
    duration_ms: duration,
    repo: h.repo ?? null,
    program: h.program ?? null,
    workstream: h.workstream ?? null,
    feature: h.feature ?? null,
    ticket: h.ticket ?? null,
    error,
  };
  assembleAndWrite({
    emitterId: slugEmitter(h.emitter_id || ""),
    id,
    present,
    attrs: truncateAttrs(parseAttrs(a["attrs"])),
  });
}

// ---------- entrypoint: always exit 0 (AC-16) ----------
function main() {
  const cmd = process.argv[2];
  let handle = null;
  try {
    if (cmd === "new-id") {
      process.stdout.write(randomUUID() + "\n");
    } else if (cmd === "span-start") {
      handle = cmdSpanStart(parseArgs(process.argv));
      process.stdout.write(JSON.stringify(handle) + "\n");
    } else if (cmd === "span-end") {
      cmdSpanEnd(parseArgs(process.argv));
    } else {
      process.stderr.write(`telemetry: unknown subcommand ${cmd == null ? "" : cmd}\n`);
    }
  } catch (e) {
    process.stderr.write(`telemetry: ${e && e.message ? e.message : String(e)}\n`);
    // keep the caller path uniform: span-start always yields a handle on stdout
    if (cmd === "span-start" && handle === null) process.stdout.write('{"disabled":true}\n');
  }
  process.exit(0);
}

main();
