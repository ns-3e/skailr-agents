#!/usr/bin/env node
/**
 * feature-status.mjs — print feature pipeline status and next incomplete phase.
 * Usage: node scripts/skailr/feature-status.mjs [--progress .claude/tmp/progress.md] [--json]
 */
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

function parseFrontmatter(text) {
  if (!text.startsWith("---")) return {};
  const end = text.indexOf("\n---", 3);
  if (end === -1) return {};
  const data = {};
  for (const line of text.slice(3, end).trim().split("\n")) {
    const i = line.indexOf(":");
    if (i === -1) continue;
    data[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return data;
}

function extractTable(body, heading) {
  const rows = [];
  const lines = body.split("\n");
  let inSection = false;
  for (const line of lines) {
    if (line.startsWith(`## ${heading}`)) {
      inSection = true;
      continue;
    }
    if (inSection && line.startsWith("## ")) break;
    if (!inSection || !line.startsWith("|")) continue;
    if (line.includes("---") || /Phase|Slice/i.test(line)) continue;
    const raw = line.split("|").map((c) => c.trim());
    // Drop leading/trailing empties from markdown row fences; keep interior blanks
    if (raw.length && raw[0] === "") raw.shift();
    if (raw.length && raw[raw.length - 1] === "") raw.pop();
    if (raw.length < 2) continue;
    rows.push({
      name: raw[0],
      status: raw[1],
      // Phases: Phase|Status|Completed|Notes — Build: Slice|Status|Report
      completed: raw[2] || "",
      extra: raw.length >= 4 ? raw[3] : raw[2] || "",
    });
  }
  return rows;
}

const ORDER = [
  "research",
  "story",
  "spec",
  "build",
  "verify",
  "validate",
  "docs",
];

function main() {
  let progressPath = ".claude/tmp/progress.md";
  let json = false;
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === "--progress") progressPath = process.argv[++i];
    if (process.argv[i] === "--json") json = true;
  }
  if (!existsSync(resolve(progressPath))) {
    const payload = { ok: false, error: "no_progress", next: null };
    if (json) console.log(JSON.stringify(payload));
    else
      console.log(
        "No progress file found. Run /ship-feature or /yolo first (or seed progress.md).",
      );
    process.exit(0);
  }
  const text = readFileSync(progressPath, "utf8");
  const fm = parseFrontmatter(text);
  const body = text.startsWith("---")
    ? text.slice(text.indexOf("\n---", 3) + 4)
    : text;
  const phases = extractTable(body, "Phases").map((r) => ({
    phase: r.name,
    status: r.status,
    completed: r.completed,
    notes: r.extra,
  }));
  const buildSlices = extractTable(body, "Build slice (when build is in_progress)").map(
    (r) => ({
      slice: r.name,
      status: r.status,
      report: r.extra || r.completed,
    }),
  );

  let next = null;
  for (const name of ORDER) {
    const row = phases.find((p) => p.phase === name);
    if (!row || row.status !== "complete") {
      next = name;
      break;
    }
  }

  const buildRow = phases.find((p) => p.phase === "build");
  const partialBuild =
    next === "build" &&
    buildRow &&
    (buildRow.status === "in_progress" ||
      buildSlices.some((s) => s.status === "complete"))
      ? buildSlices.filter((s) => s.status !== "complete").map((s) => s.slice)
      : [];

  const HANDOFF_SLICES = ["backend", "frontend", "data"];
  const handoffs = [];
  if (next === "build") {
    for (const slice of HANDOFF_SLICES) {
      const rel = join(".claude/tmp/handoff", `${slice}.md`);
      if (existsSync(resolve(rel))) {
        handoffs.push({ slice, path: rel.replace(/\\/g, "/") });
      }
    }
  }

  const payload = {
    ok: true,
    feature: fm.feature || null,
    mode: fm.mode || null,
    status: fm.status || null,
    updated: fm.updated || null,
    request: fm.request || ".claude/tmp/request.md",
    phases,
    buildSlices,
    next,
    partialBuild: partialBuild.length ? partialBuild : null,
    handoffs: handoffs.length ? handoffs : null,
    complete: next === null,
  };
  if (json) console.log(JSON.stringify(payload, null, 2));
  else {
    console.log(`Feature: ${payload.feature || "(unknown)"}`);
    console.log(`Mode:    ${payload.mode || "(unknown)"}`);
    console.log(`Status:  ${payload.status || "(unknown)"}`);
    console.log(`Next:    ${payload.next || "(all phases complete)"}`);
    if (payload.partialBuild) {
      console.log(`Build pending slices: ${payload.partialBuild.join(", ")}`);
    }
    if (payload.handoffs) {
      console.log(
        `Handoffs: ${payload.handoffs.map((h) => `${h.slice}=${h.path}`).join(", ")}`,
      );
    }
    for (const p of phases) console.log(`  - ${p.phase}: ${p.status}`);
  }
}

main();
