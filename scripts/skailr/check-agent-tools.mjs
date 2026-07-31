#!/usr/bin/env node
/**
 * check-agent-tools.mjs — Claude Code prefers Edit for existing files; Write alone
 * forces full-file rewrites ("No Edit tool available; rewriting the full file…").
 * Fail if any agent tools: or command allowed-tools: lists Write without Edit.
 *
 * Usage: node scripts/skailr/check-agent-tools.mjs
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(process.cwd());

function walkMd(dir, out = []) {
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkMd(p, out);
    else if (name.endsWith(".md")) out.push(p);
  }
  return out;
}

function toolsFromFrontmatter(text, key) {
  if (!text.startsWith("---")) return null;
  const end = text.indexOf("\n---", 3);
  if (end === -1) return null;
  const prefix = `${key}:`;
  for (const line of text.slice(3, end).split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith(prefix)) continue;
    const rest = trimmed.slice(prefix.length).trim();
    return rest
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return null;
}

function checkFile(path, key) {
  const text = readFileSync(path, "utf8");
  const tools = toolsFromFrontmatter(text, key);
  if (!tools) return null;
  if (tools.includes("Write") && !tools.includes("Edit")) {
    return `${path}: ${key} lists Write without Edit (${tools.join(", ")})`;
  }
  return null;
}

const failures = [];

for (const path of walkMd(join(ROOT, ".claude", "agents"))) {
  const err = checkFile(path, "tools");
  if (err) failures.push(err);
}

for (const path of walkMd(join(ROOT, ".claude", "commands"))) {
  const err = checkFile(path, "allowed-tools");
  if (err) failures.push(err);
}

if (failures.length) {
  console.error("check-agent-tools: Write without Edit (Claude Code will full-rewrite files):\n");
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}

const agentCount = walkMd(join(ROOT, ".claude", "agents")).length;
const cmdCount = walkMd(join(ROOT, ".claude", "commands")).length;
console.log(`OK: Write implies Edit on ${agentCount} agent(s) and ${cmdCount} command(s)`);
