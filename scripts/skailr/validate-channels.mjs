#!/usr/bin/env node
/**
 * validate-channels.mjs — parse channel boards; fail on malformed MSG or report open human/contract-change.
 * Usage: node scripts/skailr/validate-channels.mjs [--dir .claude/program/channels] [--strict-inbox]
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const MSG_RE =
  /### (MSG-\d+)\n([\s\S]*?)\n---\n([\s\S]*?)(?=\n### MSG-|\n*$)/g;

const TYPES = new Set([
  "question",
  "answer",
  "decision",
  "heads-up",
  "blocker",
  "contract-change",
  "ack",
]);
const STATUSES = new Set(["open", "answered", "resolved", "blocked-on-human"]);

function parseArgs(argv) {
  const out = { dir: ".claude/program/channels", strictInbox: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--dir") out.dir = argv[++i];
    else if (argv[i] === "--strict-inbox") out.strictInbox = true;
    else if (argv[i] === "--tmp") out.dir = ".claude/tmp/channels";
  }
  return out;
}

function parseFile(path, text) {
  const errors = [];
  const messages = [];
  const re = new RegExp(MSG_RE.source, "g");
  let m;
  while ((m = re.exec(text)) !== null) {
    const id = m[1];
    const header = m[2];
    const body = m[3].trim();
    const fields = {};
    for (const line of header.split("\n")) {
      const i = line.indexOf(":");
      if (i === -1) continue;
      fields[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
    if (!fields.from) errors.push(`${path} ${id}: missing from`);
    if (!fields.to) errors.push(`${path} ${id}: missing to`);
    if (!TYPES.has(fields.type)) errors.push(`${path} ${id}: bad type ${fields.type}`);
    if (!STATUSES.has(fields.status)) errors.push(`${path} ${id}: bad status ${fields.status}`);
    if (!body) errors.push(`${path} ${id}: empty body`);
    messages.push({ id, ...fields, body, file: path });
  }
  return { messages, errors };
}

function main() {
  const args = parseArgs(process.argv);
  const dir = resolve(args.dir);
  if (!existsSync(dir)) {
    console.log(`No channels dir at ${args.dir}; skip.`);
    process.exit(0);
  }

  const files = readdirSync(dir).filter((f) => f.endsWith(".md") && f !== "PROTOCOL.md");
  let all = [];
  let errors = [];
  for (const f of files) {
    const text = readFileSync(join(dir, f), "utf8");
    const r = parseFile(f, text);
    all = all.concat(r.messages);
    errors = errors.concat(r.errors);
  }

  const inbox = all.filter(
    (m) =>
      m.status === "open" ||
      m.status === "blocked-on-human" ||
      m.type === "contract-change" ||
      (m.to && m.to.includes("@human")),
  );

  if (errors.length) {
    console.error(errors.join("\n"));
    process.exit(1);
  }

  console.log(`OK: ${all.length} message(s); inbox=${inbox.length}`);
  for (const m of inbox) {
    console.log(`  INBOX ${m.id} type=${m.type} to=${m.to} status=${m.status} (${m.file})`);
  }

  if (args.strictInbox && inbox.length) {
    console.error("Strict inbox: open human/contract-change messages remain");
    process.exit(2);
  }
}

main();
