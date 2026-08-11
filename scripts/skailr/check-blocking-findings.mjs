#!/usr/bin/env node
// DOC: Stop hook — the one blocking gate skailr-agents ships. If a
// verification report has open Blocking Findings, the turn may not end until
// one bounded fix round happens. Real campaign runs proved the prose-only
// version of this rule doesn't reliably fire; this is the deterministic form,
// per Claude Code's Stop-hook contract (decision:"block" prevents the turn
// from ending; additionalContext is what the model reads on retry).
//
// Bounded to exactly one block per report via a marker file — Stop hooks have
// no built-in infinite-loop protection, and an unconditional blocker would
// hang forever.
import fs from "node:fs";
import path from "node:path";

function readStdinJson() {
  try {
    const raw = fs.readFileSync(0, "utf8");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// verifier.md writes a "## Blocking Findings" section. A clean report says so
// in prose ("None.") — non-empty text that is NOT a finding. Only treat the
// section as blocking when it contains an itemized entry: a numbered
// bold-severity line ("1. **CRITICAL — ...") or a finding heading
// ("### B-1 — ...").
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
  { report: ".claude/tmp/verification-report.md", marker: ".claude/tmp/.fix-round-attempted" },
  { report: ".claude/program/verification-report.md", marker: ".claude/program/.fix-round-attempted" },
  // Pre-3.0 report paths, still honored so an upgraded install can finish an
  // in-flight run.
  { report: ".claude/tmp/validation-report.md", marker: ".claude/tmp/.fix-round-attempted" },
  { report: ".claude/program/program-validation-report.md", marker: ".claude/program/.fix-round-attempted" },
];

// Root resolution: prefer CLAUDE_PROJECT_DIR (the project whose settings.json
// loaded this hook) over the hook input's cwd — a session opened in a
// subdirectory reports that subdirectory as cwd, and the reports/markers this
// gate reads live at the project root.
const input = readStdinJson();
const cwd = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();

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
      reason: `${report} has an open blocking finding — fix it and re-verify once before finishing.`,
      hookSpecificOutput: {
        hookEventName: "Stop",
        additionalContext:
          `BLOCKING: ${report} reports unresolved blocking findings that must be fixed before this run is complete:\n\n${summary}\n\n` +
          `Fix them (yourself, or via the owning engineer on a /program run), then re-run the affected verification once. ` +
          `This is a bounded, one-time gate — after this round, the run may finish regardless of outcome.`,
      },
    })
  );
  process.exit(0);
}

process.exit(0);
