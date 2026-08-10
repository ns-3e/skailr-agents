// DOC: reference-implementation self-test (mirrors patch-webhook's AC-4
// pattern). Proves the grader can flip solved=false on the real, shipped
// (feature-not-yet-built) fixture, AND that a correct implementation of the
// GET /webhooks/:event_id/status endpoint yields zero critical failures.
// Lives under bench/graders/** (isolation invariant) — never under
// bench/fixtures.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REAL_FIXTURE_SRC = path.resolve(__dirname, "../../fixtures/feature-status-lookup/src");
const GRADE_ENTRY = path.join(__dirname, "grade.mjs");

// Correct implementation: adds a `getStoredResult` lookup to ledger.ts and a
// GET /webhooks/:event_id/status route to server.ts. Dedup/processing logic
// is untouched, so the existing POST contract is byte-for-byte preserved.
const IMPLEMENTED_LEDGER_TS = `
export const ledger = [];
const inFlight = new Map();

function findEntry(eventId) {
  return ledger.find((e) => e.eventId === eventId);
}

async function doProcessing(event) {
  await new Promise((resolve) => setTimeout(resolve, 10));
  return { amount: event.amount, currency: event.currency, receivedAt: Date.now() };
}

async function processNew(event) {
  const result = await doProcessing(event);
  ledger.push({ eventId: event.event_id, result, processedAt: Date.now() });
  return { event_id: event.event_id, status: "processed", result };
}

export async function processEvent(event) {
  const existing = findEntry(event.event_id);
  if (existing) {
    return { event_id: event.event_id, status: "duplicate", result: existing.result };
  }
  if (inFlight.has(event.event_id)) {
    const outcome = await inFlight.get(event.event_id);
    return { event_id: event.event_id, status: "duplicate", result: outcome.result };
  }
  const p = processNew(event);
  inFlight.set(event.event_id, p);
  try {
    return await p;
  } finally {
    inFlight.delete(event.event_id);
  }
}

export function getStoredResult(eventId) {
  const entry = findEntry(eventId);
  if (!entry) return undefined;
  return { event_id: entry.eventId, status: "processed", result: entry.result };
}

export function ledgerEntryCount(eventId) {
  return ledger.filter((e) => e.eventId === eventId).length;
}

export function ledgerSize() {
  return ledger.length;
}

export function __resetLedgerForTests() {
  ledger.length = 0;
  inFlight.clear();
}
`;

const IMPLEMENTED_SERVER_TS = `
import http from "node:http";
import { processEvent, getStoredResult } from "./ledger.ts";

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => { data += chunk; });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(payload);
}

function isValidEvent(value) {
  if (typeof value !== "object" || value === null) return false;
  const v = value;
  return typeof v.event_id === "string" && v.event_id.length > 0 && typeof v.amount === "number" && typeof v.currency === "string";
}

async function handleWebhookPost(req, res) {
  let raw;
  try {
    raw = await readBody(req);
  } catch {
    sendJson(res, 400, { error: "invalid_body" });
    return;
  }
  let parsed;
  try {
    parsed = raw.length === 0 ? {} : JSON.parse(raw);
  } catch {
    sendJson(res, 400, { error: "invalid_json" });
    return;
  }
  if (!isValidEvent(parsed)) {
    sendJson(res, 400, { error: "invalid_event", detail: "event_id, amount, currency are required" });
    return;
  }
  const outcome = await processEvent(parsed);
  sendJson(res, 200, outcome);
}

function handleStatusGet(req, res, eventId) {
  if (!eventId) {
    sendJson(res, 400, { error: "invalid_event", detail: "event_id is required" });
    return;
  }
  const stored = getStoredResult(eventId);
  if (!stored) {
    sendJson(res, 404, { error: "not_found" });
    return;
  }
  sendJson(res, 200, stored);
}

export async function handleRequest(req, res) {
  if (req.method === "POST" && req.url === "/webhooks") {
    await handleWebhookPost(req, res);
    return;
  }
  if (req.method === "GET" && req.url && req.url.startsWith("/webhooks/")) {
    const m = req.url.match(/^\\/webhooks\\/([^/]*)\\/status$/);
    if (m) {
      handleStatusGet(req, res, decodeURIComponent(m[1]));
      return;
    }
  }
  sendJson(res, 404, { error: "not_found" });
}

export function createServer() {
  return http.createServer((req, res) => {
    handleRequest(req, res).catch(() => {
      sendJson(res, 500, { error: "internal_error" });
    });
  });
}

const isMain = process.argv[1] && process.argv[1].endsWith("server.ts");
if (isMain) {
  const port = Number(process.env.PORT) || 3000;
  createServer().listen(port, () => {
    console.log(\`feature-status-lookup fixture listening on :\${port}\`);
  });
}
`;

function makeWorkspace(flavor) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `feature-status-lookup-selftest-${flavor}-`));
  fs.cpSync(REAL_FIXTURE_SRC, path.join(dir, "src"), { recursive: true });
  if (flavor === "implemented") {
    fs.writeFileSync(path.join(dir, "src", "ledger.ts"), IMPLEMENTED_LEDGER_TS, "utf8");
    fs.writeFileSync(path.join(dir, "src", "server.ts"), IMPLEMENTED_SERVER_TS, "utf8");
  }
  return dir;
}

function runGraderCli(workspaceDir) {
  const res = spawnSync(process.execPath, [GRADE_ENTRY, workspaceDir], {
    cwd: __dirname,
    encoding: "utf8",
    timeout: 60000,
  });
  assert.equal(res.status, 0, `grader exited nonzero: ${res.stderr}`);
  return JSON.parse(res.stdout);
}

test("real shipped fixture (feature not yet built) flips solved=false with the expected critical failure reported", () => {
  const dir = makeWorkspace("unimplemented");
  try {
    const result = runGraderCli(dir);
    assert.equal(result.workspace_frozen, true);
    assert.equal(result.solved, false, "unimplemented workspace must not be marked solved");
    assert.ok(
      result.critical_failures.includes("get-status-endpoint-implemented"),
      `expected get-status-endpoint-implemented to fail, got ${JSON.stringify(result.critical_failures)}`
    );
    assert.equal(result.solved_inputs.critical_failures_count, result.critical_failures.length);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("correct implementation yields zero critical failures and solved=true", () => {
  const dir = makeWorkspace("implemented");
  try {
    const result = runGraderCli(dir);
    assert.equal(result.workspace_frozen, true);
    assert.deepEqual(result.critical_failures, []);
    assert.equal(result.solved_inputs.critical_failures_count, 0);
    assert.equal(result.solved, true, "correct implementation should be graded solved");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
