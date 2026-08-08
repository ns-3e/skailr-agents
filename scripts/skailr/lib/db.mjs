// DOC: SQLite-backed coordination state for skailr-agents runs (node:sqlite —
// no new npm dependency, keeps the pack's zero-runtime-deps posture). This is
// the single source of truth for MACHINE-CHECKED facts (phase status, gate
// results, findings, ownership, tickets, contract versions) that hooks and
// scripts need to query reliably. Narrative content (research.md prose,
// finding explanations, story ACs' rationale) stays in markdown — this layer
// only owns the structured/queryable side, and render* functions regenerate
// the existing markdown/JSON views from it so today's readers (agents that
// `cat ledger.md`, scripts like check-ownership.mjs) need no changes.
//
// One DB file per run tree, at <cwd>/.claude/skailr.db — shared by both
// standalone /yolo features and /yolo-program runs (a program's nested
// per-workstream features write into the same file, scoped by feature_id /
// program_id foreign keys) so there is never an ambiguity about which DB a
// nested feature should use.
import fs from "node:fs";
import path from "node:path";

// node:sqlite is stable enough for this use (bounded to skailr's own runtime
// state, not a general-purpose consumer-facing dependency) but still emits
// an ExperimentalWarning on every process — silence just that one so it
// doesn't spam agent transcripts, hook stderr, and CI logs on every call.
const _origEmitWarning = process.emitWarning.bind(process);
process.emitWarning = (warning, ...rest) => {
  const type = typeof rest[0] === "string" ? rest[0] : rest[0]?.type;
  if (type === "ExperimentalWarning" && String(warning).includes("SQLite")) return;
  return _origEmitWarning(warning, ...rest);
};
const { DatabaseSync } = await import("node:sqlite");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS programs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'discovering',
  brief_confirmed_at TEXT,
  plan_approved_at TEXT,
  contracts_frozen_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS program_phases (
  program_id TEXT NOT NULL,
  phase TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  commit_sha TEXT,
  completed_at TEXT,
  PRIMARY KEY (program_id, phase)
);

CREATE TABLE IF NOT EXISTS workstreams (
  id TEXT PRIMARY KEY,
  program_id TEXT NOT NULL,
  team TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS features (
  id TEXT PRIMARY KEY,
  program_id TEXT,
  workstream_id TEXT,
  mode TEXT NOT NULL DEFAULT 'yolo',
  status TEXT NOT NULL DEFAULT 'in_progress',
  artifact_root TEXT NOT NULL,
  request TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS feature_phases (
  feature_id TEXT NOT NULL,
  phase TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT,
  completed_at TEXT,
  PRIMARY KEY (feature_id, phase)
);

CREATE TABLE IF NOT EXISTS contracts (
  contract_id TEXT NOT NULL,
  program_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'frozen',
  path TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (contract_id, program_id)
);

CREATE TABLE IF NOT EXISTS contract_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_id TEXT NOT NULL,
  program_id TEXT NOT NULL,
  from_version INTEGER NOT NULL,
  to_version INTEGER NOT NULL,
  by TEXT NOT NULL,
  reason TEXT NOT NULL,
  at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ownership_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  program_id TEXT,
  feature_id TEXT,
  owner TEXT NOT NULL,
  team TEXT,
  workstream TEXT,
  glob TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS kernel_globs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  program_id TEXT NOT NULL,
  glob TEXT NOT NULL,
  frozen INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tickets (
  id TEXT NOT NULL,
  feature_id TEXT NOT NULL,
  title TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  claimed_by TEXT,
  blocked_by TEXT,
  resolution TEXT,
  PRIMARY KEY (id, feature_id)
);

CREATE TABLE IF NOT EXISTS acceptance_criteria (
  id TEXT NOT NULL,
  feature_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'AC',
  text TEXT NOT NULL,
  PRIMARY KEY (id, feature_id)
);

CREATE TABLE IF NOT EXISTS ticket_acceptance_criteria (
  ticket_id TEXT NOT NULL,
  ac_id TEXT NOT NULL,
  feature_id TEXT NOT NULL,
  PRIMARY KEY (ticket_id, ac_id, feature_id)
);

CREATE TABLE IF NOT EXISTS findings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref TEXT NOT NULL,
  feature_id TEXT,
  program_id TEXT,
  blocking INTEGER NOT NULL DEFAULT 0,
  severity TEXT,
  location TEXT,
  summary TEXT NOT NULL,
  owner TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS channel_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel TEXT NOT NULL,
  program_id TEXT,
  feature_id TEXT,
  type TEXT NOT NULL,
  from_role TEXT NOT NULL,
  from_scope TEXT,
  to_role TEXT NOT NULL,
  ref_msg_id INTEGER,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS telemetry_spans (
  span_id TEXT PRIMARY KEY,
  parent_span_id TEXT,
  trace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  attrs TEXT
);
`;

export function dbPath(cwd) {
  return path.join(cwd, ".claude", "skailr.db");
}

export function openDb(cwd) {
  const p = dbPath(cwd);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const db = new DatabaseSync(p);
  db.exec(SCHEMA);
  return db;
}

function nowIso() {
  return new Date().toISOString();
}

// Matches ledger.template.md / feature-progress.template.md's default rows —
// seeded as "pending" at init so a render always shows the full lifecycle,
// not just the phases someone has explicitly touched so far (a phase that's
// simply absent from the table reads very differently from one shown
// "pending", and downstream readers like ledger-status.mjs/feature-status.mjs
// expect the full row set to exist).
const DEFAULT_PROGRAM_PHASES = ["A_kernel", "B_workstreams", "C_integration", "D_validation", "E_documentation"];
const DEFAULT_FEATURE_PHASES = ["research", "story", "spec", "build", "verify", "validate", "docs"];

// ---------------------------------------------------------------------------
// Programs
// ---------------------------------------------------------------------------
export function upsertProgram(db, { id, status }) {
  const now = nowIso();
  db.prepare(
    `INSERT INTO programs (id, status, created_at, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`
  ).run(id, status || "discovering", now, now);
  const seed = db.prepare(
    `INSERT OR IGNORE INTO program_phases (program_id, phase, status) VALUES (?, ?, 'pending')`
  );
  for (const phase of DEFAULT_PROGRAM_PHASES) seed.run(id, phase);
}

export function setProgramGate(db, id, gate, atField) {
  db.prepare(`UPDATE programs SET ${atField} = ?, updated_at = ? WHERE id = ?`).run(nowIso(), nowIso(), id);
}

export function setProgramPhase(db, programId, phase, status, { commitSha } = {}) {
  const now = nowIso();
  db.prepare(
    `INSERT INTO program_phases (program_id, phase, status, commit_sha, completed_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(program_id, phase) DO UPDATE SET
       status = excluded.status, commit_sha = COALESCE(excluded.commit_sha, program_phases.commit_sha),
       completed_at = excluded.completed_at`
  ).run(programId, phase, status, commitSha || null, status === "done" ? now : null);
  db.prepare(`UPDATE programs SET updated_at = ? WHERE id = ?`).run(now, programId);
}

export function getProgram(db, id) {
  const program = db.prepare(`SELECT * FROM programs WHERE id = ?`).get(id);
  if (!program) return null;
  const phases = db.prepare(`SELECT * FROM program_phases WHERE program_id = ? ORDER BY rowid`).all(id);
  return { ...program, phases };
}

// ---------------------------------------------------------------------------
// Features
// ---------------------------------------------------------------------------
export function upsertFeature(db, { id, programId, workstreamId, mode, status, artifactRoot, request }) {
  const now = nowIso();
  db.prepare(
    `INSERT INTO features (id, program_id, workstream_id, mode, status, artifact_root, request, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       status = excluded.status, artifact_root = excluded.artifact_root, updated_at = excluded.updated_at`
  ).run(id, programId || null, workstreamId || null, mode || "yolo", status || "in_progress", artifactRoot, request || null, now, now);
  const seed = db.prepare(
    `INSERT OR IGNORE INTO feature_phases (feature_id, phase, status) VALUES (?, ?, 'pending')`
  );
  for (const phase of DEFAULT_FEATURE_PHASES) seed.run(id, phase);
}

export function setFeaturePhase(db, featureId, phase, status, notes) {
  const now = nowIso();
  db.prepare(
    `INSERT INTO feature_phases (feature_id, phase, status, notes, completed_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(feature_id, phase) DO UPDATE SET
       status = excluded.status, notes = COALESCE(excluded.notes, feature_phases.notes),
       completed_at = excluded.completed_at`
  ).run(featureId, phase, status, notes || null, status === "complete" ? now : null);
  db.prepare(`UPDATE features SET updated_at = ? WHERE id = ?`).run(now, featureId);
}

export function getFeature(db, id) {
  const feature = db.prepare(`SELECT * FROM features WHERE id = ?`).get(id);
  if (!feature) return null;
  const phases = db.prepare(`SELECT * FROM feature_phases WHERE feature_id = ? ORDER BY rowid`).all(id);
  return { ...feature, phases };
}

// ---------------------------------------------------------------------------
// Contracts
// ---------------------------------------------------------------------------
export function freezeContract(db, { contractId, programId, version, path: contractPath }) {
  const now = nowIso();
  db.prepare(
    `INSERT INTO contracts (contract_id, program_id, version, status, path, updated_at)
     VALUES (?, ?, ?, 'frozen', ?, ?)
     ON CONFLICT(contract_id, program_id) DO UPDATE SET
       version = excluded.version, path = excluded.path, updated_at = excluded.updated_at`
  ).run(contractId, programId, version, contractPath || null, now);
}

export function bumpContract(db, { contractId, programId, fromVersion, toVersion, by, reason }) {
  const now = nowIso();
  db.prepare(
    `UPDATE contracts SET version = ?, updated_at = ? WHERE contract_id = ? AND program_id = ?`
  ).run(toVersion, now, contractId, programId);
  db.prepare(
    `INSERT INTO contract_changes (contract_id, program_id, from_version, to_version, by, reason, at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(contractId, programId, fromVersion, toVersion, by, reason, now);
}

export function listContracts(db, programId) {
  return db.prepare(`SELECT * FROM contracts WHERE program_id = ? ORDER BY contract_id`).all(programId);
}

export function listContractChanges(db, programId) {
  return db.prepare(`SELECT * FROM contract_changes WHERE program_id = ? ORDER BY id`).all(programId);
}

// ---------------------------------------------------------------------------
// Ownership
// ---------------------------------------------------------------------------
// Additive — one INSERT per call. Use for `ownership add` (repeatable, one
// rule per glob) so successive calls accumulate rather than clobber.
export function addOwnershipRule(db, { programId, featureId, owner, team, workstream, glob }) {
  db.prepare(
    `INSERT INTO ownership_rules (program_id, feature_id, owner, team, workstream, glob) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(programId || null, featureId || null, owner, team || null, workstream || null, glob);
}

// Replace-all — clears the existing set for this scope first. Use for bulk
// `ownership set --file` (the caller supplies the complete ruleset in one
// call), never for accumulating one rule at a time.
export function replaceOwnershipRules(db, { programId, featureId, rules }) {
  db.prepare(`DELETE FROM ownership_rules WHERE program_id IS ? AND feature_id IS ?`).run(programId || null, featureId || null);
  const stmt = db.prepare(
    `INSERT INTO ownership_rules (program_id, feature_id, owner, team, workstream, glob) VALUES (?, ?, ?, ?, ?, ?)`
  );
  for (const r of rules) stmt.run(programId || null, featureId || null, r.owner, r.team || null, r.workstream || null, r.glob);
}

export function clearOwnershipRules(db, { programId, featureId } = {}) {
  db.prepare(`DELETE FROM ownership_rules WHERE program_id IS ? AND feature_id IS ?`).run(programId || null, featureId || null);
}

export function listOwnershipRules(db, { programId, featureId } = {}) {
  if (featureId) return db.prepare(`SELECT * FROM ownership_rules WHERE feature_id = ?`).all(featureId);
  if (programId) return db.prepare(`SELECT * FROM ownership_rules WHERE program_id = ?`).all(programId);
  return db.prepare(`SELECT * FROM ownership_rules`).all();
}

export function setKernelGlobs(db, programId, globs, frozen) {
  db.prepare(`DELETE FROM kernel_globs WHERE program_id = ?`).run(programId);
  const stmt = db.prepare(`INSERT INTO kernel_globs (program_id, glob, frozen) VALUES (?, ?, ?)`);
  for (const g of globs) stmt.run(programId, g, frozen ? 1 : 0);
}

export function listKernelGlobs(db, programId) {
  return db.prepare(`SELECT * FROM kernel_globs WHERE program_id = ?`).all(programId);
}

// ---------------------------------------------------------------------------
// Tickets
// ---------------------------------------------------------------------------
export function upsertTicket(db, { id, featureId, title, role, status, blockedBy }) {
  db.prepare(
    `INSERT INTO tickets (id, feature_id, title, role, status, blocked_by)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id, feature_id) DO UPDATE SET
       title = excluded.title, role = excluded.role, status = excluded.status,
       blocked_by = excluded.blocked_by`
  ).run(id, featureId, title, role, status || "open", JSON.stringify(blockedBy || []));
}

export function claimTicket(db, id, featureId, claimedBy) {
  db.prepare(`UPDATE tickets SET status = 'claimed', claimed_by = ? WHERE id = ? AND feature_id = ?`).run(claimedBy, id, featureId);
}

export function resolveTicket(db, id, featureId, resolution) {
  db.prepare(`UPDATE tickets SET status = 'resolved', resolution = ? WHERE id = ? AND feature_id = ?`).run(resolution || null, id, featureId);
}

export function listTickets(db, featureId) {
  return db.prepare(`SELECT * FROM tickets WHERE feature_id = ? ORDER BY id`).all(featureId).map((t) => ({
    ...t,
    blocked_by: t.blocked_by ? JSON.parse(t.blocked_by) : [],
  }));
}

// ---------------------------------------------------------------------------
// Acceptance criteria + ticket linkage (the AC/EC <-> ticket <-> file graph)
// ---------------------------------------------------------------------------
export function upsertAcceptanceCriterion(db, { id, featureId, kind, text }) {
  db.prepare(
    `INSERT INTO acceptance_criteria (id, feature_id, kind, text) VALUES (?, ?, ?, ?)
     ON CONFLICT(id, feature_id) DO UPDATE SET kind = excluded.kind, text = excluded.text`
  ).run(id, featureId, kind || "AC", text);
}

export function linkTicketToAC(db, { ticketId, acId, featureId }) {
  db.prepare(
    `INSERT OR IGNORE INTO ticket_acceptance_criteria (ticket_id, ac_id, feature_id) VALUES (?, ?, ?)`
  ).run(ticketId, acId, featureId);
}

export function getACLineage(db, featureId, acId) {
  const ac = db.prepare(`SELECT * FROM acceptance_criteria WHERE id = ? AND feature_id = ?`).get(acId, featureId);
  if (!ac) return null;
  const tickets = db
    .prepare(
      `SELECT t.* FROM tickets t
       JOIN ticket_acceptance_criteria j ON j.ticket_id = t.id AND j.feature_id = t.feature_id
       WHERE j.ac_id = ? AND j.feature_id = ?`
    )
    .all(acId, featureId)
    .map((t) => ({ ...t, blocked_by: t.blocked_by ? JSON.parse(t.blocked_by) : [] }));
  return { ac, tickets };
}

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------
export function addFinding(db, { ref, featureId, programId, blocking, severity, location, summary, owner }) {
  db.prepare(
    `INSERT INTO findings (ref, feature_id, program_id, blocking, severity, location, summary, owner, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(ref, featureId || null, programId || null, blocking ? 1 : 0, severity || null, location || null, summary, owner || null, nowIso());
}

export function resolveFinding(db, ref, scope) {
  const now = nowIso();
  if (scope.featureId) {
    db.prepare(`UPDATE findings SET status = 'fixed', resolved_at = ? WHERE ref = ? AND feature_id = ?`).run(now, ref, scope.featureId);
  } else if (scope.programId) {
    db.prepare(`UPDATE findings SET status = 'fixed', resolved_at = ? WHERE ref = ? AND program_id = ?`).run(now, ref, scope.programId);
  }
}

export function listFindings(db, { featureId, programId, status, blockingOnly } = {}) {
  const clauses = [];
  const params = [];
  if (featureId) {
    clauses.push("feature_id = ?");
    params.push(featureId);
  }
  if (programId) {
    clauses.push("program_id = ?");
    params.push(programId);
  }
  if (status) {
    clauses.push("status = ?");
    params.push(status);
  }
  if (blockingOnly) clauses.push("blocking = 1");
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return db.prepare(`SELECT * FROM findings ${where} ORDER BY id`).all(...params);
}

export function countOpenBlockingFindings(db, { featureId, programId } = {}) {
  const rows = listFindings(db, { featureId, programId, status: "open", blockingOnly: true });
  return rows.length;
}

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------
export function postMessage(db, { channel, programId, featureId, type, from, fromScope, to, refMsgId, body }) {
  const result = db
    .prepare(
      `INSERT INTO channel_messages (channel, program_id, feature_id, type, from_role, from_scope, to_role, ref_msg_id, body, at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(channel, programId || null, featureId || null, type, from, fromScope || null, to, refMsgId || null, body, nowIso());
  return result.lastInsertRowid;
}

export function setMessageStatus(db, id, status) {
  db.prepare(`UPDATE channel_messages SET status = ? WHERE id = ?`).run(status, id);
}

export function listMessages(db, channel, { status } = {}) {
  if (status) return db.prepare(`SELECT * FROM channel_messages WHERE channel = ? AND status = ? ORDER BY id`).all(channel, status);
  return db.prepare(`SELECT * FROM channel_messages WHERE channel = ? ORDER BY id`).all(channel);
}

export function listOpenMessages(db, { programId, featureId } = {}) {
  if (featureId) return db.prepare(`SELECT * FROM channel_messages WHERE feature_id = ? AND status = 'open' ORDER BY id`).all(featureId);
  if (programId) return db.prepare(`SELECT * FROM channel_messages WHERE program_id = ? AND status = 'open' ORDER BY id`).all(programId);
  return db.prepare(`SELECT * FROM channel_messages WHERE status = 'open' ORDER BY id`).all();
}

// ---------------------------------------------------------------------------
// Telemetry
// ---------------------------------------------------------------------------
export function startSpan(db, { spanId, parentSpanId, traceId, name }) {
  db.prepare(
    `INSERT INTO telemetry_spans (span_id, parent_span_id, trace_id, name, status, started_at)
     VALUES (?, ?, ?, ?, 'running', ?)`
  ).run(spanId, parentSpanId || null, traceId, name, nowIso());
}

export function endSpan(db, spanId, status, attrs) {
  db.prepare(`UPDATE telemetry_spans SET status = ?, ended_at = ?, attrs = ? WHERE span_id = ?`).run(
    status,
    nowIso(),
    attrs ? JSON.stringify(attrs) : null,
    spanId
  );
}

export function listSpans(db, traceId) {
  return db.prepare(`SELECT * FROM telemetry_spans WHERE trace_id = ? ORDER BY started_at`).all(traceId);
}
