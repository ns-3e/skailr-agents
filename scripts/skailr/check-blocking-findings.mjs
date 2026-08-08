#!/usr/bin/env node
// DOC: Stop hook — enforces the YOLO/build-program validate→fix loop
// (yolo.md Phase 6b / build-program.md Phase D2) mechanically instead of
// relying on the orchestrator remembering a prose instruction deep in its
// own context. Two live campaign runs proved the prose version doesn't
// reliably fire; this converts it into a deterministic gate per Claude
// Code's own Stop-hook contract (decision:"block" prevents the turn from
// ending; additionalContext is what the model actually reads on retry).
//
// Bounded to exactly one block per report (a marker file, checked before
// blocking again) — Claude Code's hook docs are explicit that Stop hooks
// have no built-in infinite-loop protection; an unconditional blocker would
// hang forever.
import fs from "node:fs";
import path from "node:path";
import { openDb, dbPath, listFindings } from "./lib/db.mjs";

function readStdinJson() {
  try {
    const raw = fs.readFileSync(0, "utf8");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// Both validator.md and program-validator.md write a "## Blocking Findings"
// section, numbered with a **bold** severity tag ("1. **CRITICAL — ...") or
// (validator.md's B-series) a "### B-1 — ..." heading. A clean report says
// so in prose ("None. No AC/EC is missing...") — non-empty text that is NOT
// a blocking finding. Only treat the section as blocking if it contains an
// actual itemized entry in one of the two observed shapes.
const FINDING_ITEM_RE = /^\s*(?:\d+\.\s+\*\*|#{2,4}\s+[A-Za-z]{0,3}-?\d+\s)/m;

function extractBlockingFindingsBody(text) {
  const lines = text.split("\n");
  let found = false;
  let capturing = false;
  const body = [];
  for (const line of lines) {
    if (/^##\s+Blocking Findings\s*$/.test(line)) {
      found = true;
      capturing = true;
      continue;
    }
    if (capturing && /^##\s+/.test(line)) {
      capturing = false;
      continue;
    }
    if (capturing) body.push(line);
  }
  if (!found) return null;
  return body.join("\n").trim();
}

const CANDIDATES = [
  { report: ".claude/tmp/validation-report.md", marker: ".claude/tmp/.fix-round-attempted" },
  { report: ".claude/program/program-validation-report.md", marker: ".claude/program/.fix-round-attempted" },
];

const input = readStdinJson();
const cwd = input.cwd || process.cwd();

// Prefer the DB (scripts/skailr/lib/db.mjs) when validator/program-validator
// have written structured finding rows there — reliable by construction,
// no regex heuristics needed. Only fall back to parsing the narrative
// report's "## Blocking Findings" prose when the DB has no findings tracked
// for this run at all (older workspace, or the writer hasn't been updated
// to record structured findings yet).
if (fs.existsSync(dbPath(cwd))) {
  try {
    const db = openDb(cwd);
    const allFindings = listFindings(db);
    if (allFindings.length > 0) {
      const open = allFindings.filter((f) => f.blocking && f.status === "open");
      if (open.length > 0) {
        const marker = path.join(cwd, ".claude", ".fix-round-attempted");
        if (!fs.existsSync(marker)) {
          fs.mkdirSync(path.dirname(marker), { recursive: true });
          fs.writeFileSync(marker, new Date().toISOString() + "\n", "utf8");
          const summary = open
            .map((f) => `- [${f.ref}] ${f.severity ? `${f.severity} — ` : ""}${f.summary}${f.location ? ` (${f.location})` : ""}${f.owner ? ` — owner: ${f.owner}` : ""}`)
            .join("\n");
          process.stdout.write(
            JSON.stringify({
              decision: "block",
              reason: `${open.length} open blocking finding(s) in scripts/skailr/lib/db.mjs — fix them and re-run verification/validation once before finishing.`,
              hookSpecificOutput: {
                hookEventName: "Stop",
                additionalContext:
                  `BLOCKING: ${open.length} unresolved blocking finding(s) must be fixed before this run is complete:\n\n${summary}\n\n` +
                  `Dispatch the owning engineer(s), then re-run verification and validation once. ` +
                  `This is a bounded, one-time gate (see yolo.md Phase 6b / build-program.md Phase D2) — after this round, the run may finish regardless of outcome.`,
              },
            })
          );
          process.exit(0);
        }
      }
      // DB has findings tracked (even if none currently open/blocking) — trust
      // it and skip the markdown fallback below entirely.
      process.exit(0);
    }
  } catch {
    // DB exists but errored (corrupt, mid-write, etc.) — fall through to the
    // markdown-parsing path rather than failing the hook.
  }
}

for (const { report, marker } of CANDIDATES) {
  const reportPath = path.join(cwd, report);
  if (!fs.existsSync(reportPath)) continue;

  let text;
  try {
    text = fs.readFileSync(reportPath, "utf8");
  } catch {
    continue;
  }

  const body = extractBlockingFindingsBody(text);
  if (body === null) continue; // no such section in this report at all
  if (!FINDING_ITEM_RE.test(body)) continue; // section present but no real finding item

  const markerPath = path.join(cwd, marker);
  if (fs.existsSync(markerPath)) continue; // already used this run's one bounded fix round

  fs.mkdirSync(path.dirname(markerPath), { recursive: true });
  fs.writeFileSync(markerPath, new Date().toISOString() + "\n", "utf8");

  const summary = body.length > 4000 ? body.slice(0, 4000) + "\n…(truncated)" : body;
  process.stdout.write(
    JSON.stringify({
      decision: "block",
      reason: `${report} has an open blocking finding — fix it and re-run verification/validation once before finishing.`,
      hookSpecificOutput: {
        hookEventName: "Stop",
        additionalContext:
          `BLOCKING: ${report} reports unresolved blocking findings that must be fixed before this run is complete:\n\n${summary}\n\n` +
          `Dispatch the owning engineer(s) named in each finding, then re-run verification and validation once. ` +
          `This is a bounded, one-time gate (see yolo.md Phase 6b / build-program.md Phase D2) — after this round, the run may finish regardless of outcome.`,
      },
    })
  );
  process.exit(0);
}

process.exit(0);
