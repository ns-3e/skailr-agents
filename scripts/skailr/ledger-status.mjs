#!/usr/bin/env node
/**
 * ledger-status.mjs — print program status and next incomplete phase.
 * Usage: node scripts/skailr/ledger-status.mjs [--ledger .claude/program/ledger.md] [--json]
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

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

function extractPhases(body) {
  const rows = [];
  const lines = body.split("\n");
  let inPhases = false;
  for (const line of lines) {
    if (line.startsWith("## Phases")) {
      inPhases = true;
      continue;
    }
    if (inPhases && line.startsWith("## ")) break;
    if (!inPhases || !line.startsWith("|")) continue;
    if (line.includes("---") || /Phase/i.test(line)) continue;
    const cols = line
      .split("|")
      .map((c) => c.trim())
      .filter(Boolean);
    if (cols.length >= 2) rows.push({ phase: cols[0], status: cols[1] });
  }
  return rows;
}

const ORDER = [
  "A_kernel",
  "B_workstreams",
  "C_integration",
  "D_validation",
  "E_documentation",
];

function main() {
  let ledgerPath = ".claude/program/ledger.md";
  let json = false;
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === "--ledger") ledgerPath = process.argv[++i];
    if (process.argv[i] === "--json") json = true;
  }
  if (!existsSync(resolve(ledgerPath))) {
    const payload = { ok: false, error: "no_ledger", next: null };
    if (json) console.log(JSON.stringify(payload));
    else console.log("No ledger found. Run /discover → /plan-program first.");
    process.exit(0);
  }
  const text = readFileSync(ledgerPath, "utf8");
  const fm = parseFrontmatter(text);
  const body = text.startsWith("---")
    ? text.slice(text.indexOf("\n---", 3) + 4)
    : text;
  const phases = extractPhases(body);
  let next = null;
  for (const name of ORDER) {
    const row = phases.find((p) => p.phase === name);
    if (!row || row.status !== "complete") {
      next = name;
      break;
    }
  }
  const payload = {
    ok: true,
    program: fm.program || null,
    status: fm.status || null,
    updated: fm.updated || null,
    phases,
    next,
    complete: next === null,
  };
  if (json) console.log(JSON.stringify(payload, null, 2));
  else {
    console.log(`Program: ${payload.program || "(unknown)"}`);
    console.log(`Status:  ${payload.status || "(unknown)"}`);
    console.log(`Next:    ${payload.next || "(all phases complete)"}`);
    for (const p of phases) console.log(`  - ${p.phase}: ${p.status}`);
  }
}

main();
