#!/usr/bin/env node
// DOC: Stop hook — enforces track-phase's DB-writing instruction
// (.claude/skills/track-phase/SKILL.md) mechanically instead of relying on
// the orchestrator remembering to call db.mjs at every checkpoint. Same
// class of defect, and same fix, as check-blocking-findings.mjs: a real
// program-rbac run showed ledger.md's Phases table advanced well past
// "pending" while skailr.db's programs/features tables stayed completely
// empty. ledger.md/progress.md are RENDERED FROM the DB (scripts/skailr/lib/
// render.mjs) — so any mismatch between the two provably means a phase
// transition happened only in markdown, never reached the DB the rest of
// the pack (check-blocking-findings.mjs, resume-from-ledger,
// resume-from-feature-progress) now trusts as the source of truth.
//
// Bounded to exactly one block per run (a marker file, checked before
// blocking again) — Claude Code's hook docs are explicit that Stop hooks
// have no built-in infinite-loop protection.
import fs from "node:fs";
import path from "node:path";
import { openDb, getProgram, getFeature } from "./lib/db.mjs";

function readStdinJson() {
  try {
    const raw = fs.readFileSync(0, "utf8");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function frontmatterField(text, key) {
  const fm = text.split(/\n---\n/)[0] || "";
  const m = new RegExp(`^${key}:\\s*(.+)$`, "m").exec(fm);
  return m ? m[1].trim() : null;
}

// Reads the "## Phases" table the same way render.mjs writes it: a header
// row, a separator row, then one `| phase | status | ... |` row per phase.
// Cell-split rather than a single brittle multiline regex so stray spacing
// never silently drops a row.
function parsePhaseRows(text) {
  const start = text.indexOf("## Phases");
  if (start === -1) return [];
  const rest = text.slice(start + "## Phases".length);
  const end = /\n##\s+/.exec(rest);
  const section = end ? rest.slice(0, end.index) : rest;
  const rows = section
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("|"));
  return rows
    .slice(2) // drop the header row and the |---|---| separator
    .map((line) => {
      const cells = line
        .split("|")
        .slice(1, -1) // drop the empty strings before the first and after the last "|"
        .map((c) => c.trim());
      return cells.length >= 2 && cells[0] ? { phase: cells[0], status: cells[1] } : null;
    })
    .filter(Boolean);
}

function findDrift(filePath, schemaTag, idKey, getRow) {
  let text;
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
  if (!text.includes(`schema: ${schemaTag}`)) return null; // not a skailr-managed file
  const id = frontmatterField(text, idKey);
  if (!id) return null;

  const fileRows = parsePhaseRows(text).filter((r) => r.status && r.status !== "pending");
  if (fileRows.length === 0) return null; // nothing claimed to have progressed yet

  const row = getRow(id);
  if (!row) {
    return `${idKey} ${id} (${path.basename(filePath)}) has phase progress in markdown but no row in skailr.db at all — db.mjs ${idKey} init was never called`;
  }
  const dbPhases = new Map((row.phases || []).map((p) => [p.phase, p.status]));
  const mismatches = fileRows.filter((r) => dbPhases.get(r.phase) !== r.status);
  if (mismatches.length === 0) return null;
  return (
    `${idKey} ${id} (${path.basename(filePath)}): ` +
    mismatches
      .map((m) => `${m.phase} is "${m.status}" in the file but "${dbPhases.get(m.phase) || "pending"}" in skailr.db`)
      .join("; ")
  );
}

const input = readStdinJson();
const cwd = input.cwd || process.cwd();
const markerPath = path.join(cwd, ".claude", ".phase-tracking-fix-attempted");
if (fs.existsSync(markerPath)) process.exit(0);

let db;
try {
  db = openDb(cwd);
} catch {
  process.exit(0); // never fail the turn over a DB open error
}

const drifts = [];

const ledgerPath = path.join(cwd, ".claude", "program", "ledger.md");
if (fs.existsSync(ledgerPath)) {
  const d = findDrift(ledgerPath, "skailr.ledger/v1", "program", (id) => getProgram(db, id));
  if (d) drifts.push(d);
}

const progressCandidates = [path.join(cwd, ".claude", "tmp", "progress.md")];
const wsRoot = path.join(cwd, ".claude", "program", "workstreams");
if (fs.existsSync(wsRoot)) {
  for (const ws of fs.readdirSync(wsRoot, { withFileTypes: true })) {
    if (!ws.isDirectory()) continue;
    const featuresDir = path.join(wsRoot, ws.name, "features");
    if (!fs.existsSync(featuresDir)) continue;
    for (const feat of fs.readdirSync(featuresDir, { withFileTypes: true })) {
      if (feat.isDirectory()) progressCandidates.push(path.join(featuresDir, feat.name, "progress.md"));
    }
  }
}
for (const p of progressCandidates) {
  if (!fs.existsSync(p)) continue;
  const d = findDrift(p, "skailr.feature-progress/v1", "feature", (id) => getFeature(db, id));
  if (d) drifts.push(d);
}

if (drifts.length === 0) process.exit(0);

fs.mkdirSync(path.dirname(markerPath), { recursive: true });
fs.writeFileSync(markerPath, new Date().toISOString() + "\n", "utf8");

const summary = drifts.map((d) => `- ${d}`).join("\n");
process.stdout.write(
  JSON.stringify({
    decision: "block",
    reason: "phase progress recorded in markdown was never written to scripts/skailr/skailr.db — track-phase's db.mjs calls were skipped.",
    hookSpecificOutput: {
      hookEventName: "Stop",
      additionalContext:
        `BLOCKING: track-phase's DB writes are out of sync with the rendered markdown:\n\n${summary}\n\n` +
        `Run the catch-up "node scripts/skailr/db.mjs program|feature set-phase ..." call for each phase named above ` +
        `(see .claude/skills/track-phase/SKILL.md), then re-run "node scripts/skailr/db.mjs render ledger|progress ..." ` +
        `so the DB and the rendered file agree. This is a bounded, one-time gate — after this round, the run may finish regardless of outcome.`,
      },
  })
);
process.exit(0);
