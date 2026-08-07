// DOC: planted-defect self-test (program AC-4). Proves the grader can flip
// solved=false on a critical-requirement violation even though the buggy
// fixture's own visible tests pass and quality would otherwise look high,
// AND that a genuinely fixed workspace yields zero critical failures. Lives
// under bench/graders/** (isolation invariant) — never under bench/fixtures.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REAL_FIXTURE_SRC = path.resolve(__dirname, "../../fixtures/patch-webhook/src");
const GRADE_ENTRY = path.join(__dirname, "grade.mjs");

// Correct fix: an in-flight promise map dedups concurrent calls for the
// same event_id so exactly one "processed" ledger write happens; a
// concurrent racer sees the in-flight promise (set synchronously, before
// any await) and awaits it, returning "duplicate" with the shared result.
const FIXED_LEDGER_TS = `
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

export function ledgerEntryCount(eventId) {
  return ledger.filter((e) => e.eventId === eventId).length;
}

export function ledgerSize() {
  return ledger.length;
}

export function __resetLedgerForTests() {
  ledger.length = 0;
}
`;

function makeWorkspace(flavor) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `patch-webhook-selftest-${flavor}-`));
  fs.cpSync(REAL_FIXTURE_SRC, path.join(dir, "src"), { recursive: true });
  if (flavor === "fixed") {
    fs.writeFileSync(path.join(dir, "src", "ledger.ts"), FIXED_LEDGER_TS, "utf8");
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

test("AC-4: buggy baseline workspace (real fixture, visible tests pass) flips solved=false with the race critical failures reported", () => {
  const dir = makeWorkspace("buggy");
  try {
    const result = runGraderCli(dir);
    assert.equal(result.workspace_frozen, true);
    assert.equal(result.solved, false, "buggy workspace must not be marked solved");
    assert.ok(
      result.critical_failures.includes("exactly-once-processing") ||
        result.critical_failures.includes("no-duplicate-ledger-entry"),
      `expected a race-related critical failure, got ${JSON.stringify(result.critical_failures)}`
    );
    assert.equal(result.solved_inputs.critical_failures_count, result.critical_failures.length);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("AC-4: fixed workspace (in-flight-dedup patch) yields zero critical failures", () => {
  const dir = makeWorkspace("fixed");
  try {
    const result = runGraderCli(dir);
    assert.equal(result.workspace_frozen, true);
    assert.deepEqual(result.critical_failures, []);
    assert.equal(result.solved_inputs.critical_failures_count, 0);
    assert.equal(result.solved, true, "fixed workspace should be graded solved");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
