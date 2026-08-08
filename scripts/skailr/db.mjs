#!/usr/bin/env node
/**
 * db.mjs — CLI over scripts/skailr/lib/db.mjs (SQLite coordination state).
 * Agents and orchestrator commands call this instead of directly Write/Edit-ing
 * ledger.md / progress.md / ownership.json / channel files for anything that
 * is a machine-checked FACT (phase status, findings, contract versions,
 * ownership, ticket status, channel messages). Narrative content (research.md
 * prose, ticket Goal/AC bodies, finding explanations) is still authored
 * directly via Write/Edit — this CLI only owns the structured side, then
 * renders the existing markdown/JSON views so today's readers need no
 * changes. See scripts/skailr/lib/db.mjs and render.mjs top-of-file docs.
 *
 * Usage: node scripts/skailr/db.mjs <noun> <verb> [--flags] [--cwd <path>] [--json]
 *
 * Nouns: program, feature, contract, ownership, ticket, ac, finding, channel, render
 * Run with no args (or --help) for the full subcommand list.
 */
import {
  openDb,
  upsertProgram,
  setProgramPhase,
  getProgram,
  upsertFeature,
  setFeaturePhase,
  getFeature,
  freezeContract,
  bumpContract,
  listContracts,
  listContractChanges,
  addOwnershipRule,
  replaceOwnershipRules,
  clearOwnershipRules,
  listOwnershipRules,
  setKernelGlobs,
  listKernelGlobs,
  upsertTicket,
  claimTicket,
  resolveTicket,
  listTickets,
  upsertAcceptanceCriterion,
  linkTicketToAC,
  getACLineage,
  addFinding,
  resolveFinding,
  listFindings,
  countOpenBlockingFindings,
  postMessage,
  setMessageStatus,
  listMessages,
  listOpenMessages,
} from "./lib/db.mjs";
import { renderOwnershipJson, renderLedger, renderProgress, renderChannel, readIfExists } from "./lib/render.mjs";
import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        out[key] = true;
      } else {
        out[key] = next;
        i++;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

function printResult(args, obj) {
  if (args.json) {
    process.stdout.write(JSON.stringify(obj, null, 2) + "\n");
  } else if (typeof obj === "string") {
    process.stdout.write(obj);
  } else {
    process.stdout.write(JSON.stringify(obj, null, 2) + "\n");
  }
}

function fail(msg) {
  process.stderr.write(`db.mjs: ${msg}\n`);
  process.exit(1);
}

const argv = process.argv.slice(2);
const [noun, verb, ...rest] = argv;
const args = parseArgs(rest);
const cwd = args.cwd || process.cwd();

if (!noun || args.help) {
  process.stdout.write(`Usage: node scripts/skailr/db.mjs <noun> <verb> [--flags] [--cwd <path>] [--json]

  program init --id <id> [--status <status>]
  program set-phase --id <id> --phase <phase> --status <pending|in_progress|done> [--commit-sha <sha>]
  program get --id <id>

  feature init --id <id> [--program-id <id>] [--workstream-id <id>] [--mode yolo|gated|patch] --artifact-root <path> [--request <text>]
  feature set-phase --id <id> --phase <phase> --status <status> [--notes <text>]
  feature get --id <id>

  contract freeze --contract-id <id> --program-id <id> --version <n> [--path <path>]
  contract bump --contract-id <id> --program-id <id> --from <n> --to <n> --by <role> --reason <text>
  contract list --program-id <id>

  ownership add --owner <id> --glob <glob> [--team <t>] [--workstream <ws>] [--program-id <id>] [--feature-id <id>]  (repeatable — accumulates, one rule per call)
  ownership set --file <path.json> [--program-id <id>] [--feature-id <id>]   (replace-all: JSON array of {owner,team,workstream,glob})
  ownership clear [--program-id <id>] [--feature-id <id>]
  ownership list [--program-id <id>] [--feature-id <id>]

  ticket add --id <id> --feature-id <id> --title <text> --role <role> [--status <status>] [--blocked-by <csv>]
  ticket claim --id <id> --feature-id <id> --by <name>
  ticket resolve --id <id> --feature-id <id> [--resolution <text>]
  ticket list --feature-id <id>

  ac add --id <id> --feature-id <id> --text <text> [--kind AC|EC]
  ac link --ticket-id <id> --ac-id <id> --feature-id <id>
  ac lineage --ac-id <id> --feature-id <id>

  finding add --ref <id> [--feature-id <id>] [--program-id <id>] [--blocking] [--severity <s>] [--location <loc>] --summary <text> [--owner <role>]
  finding resolve --ref <id> [--feature-id <id>] [--program-id <id>]
  finding list [--feature-id <id>] [--program-id <id>] [--status open|fixed] [--blocking-only]
  finding count-blocking [--feature-id <id>] [--program-id <id>]

  channel post --channel program|feature|ws-<name> --type <type> --from <role> --to <addr> --body <text> [--program-id <id>] [--feature-id <id>] [--ref-msg-id <id>] [--from-scope <text>]
  channel resolve --id <msgId> [--status answered|resolved]
  channel list --channel <name> [--status open]
  channel open [--program-id <id>] [--feature-id <id>]

  render ledger --program-id <id> --name <text> --out <path>
  render progress --feature-id <id> --name <text> --out <path>
  render ownership --out <path> [--program-id <id>] [--feature-id <id>] [--base-ref <ref>]
  render channel --channel <name> --out <path> [--header <text>]
`);
  process.exit(noun ? 1 : 0);
}

const db = openDb(cwd);

function need(flag) {
  if (args[flag] === undefined) fail(`--${flag} is required for ${noun} ${verb}`);
  return args[flag];
}

switch (`${noun} ${verb}`) {
  case "program init":
    upsertProgram(db, { id: need("id"), status: args.status });
    printResult(args, { ok: true });
    break;
  case "program set-phase":
    setProgramPhase(db, need("id"), need("phase"), need("status"), { commitSha: args["commit-sha"] });
    printResult(args, { ok: true });
    break;
  case "program get":
    printResult(args, getProgram(db, need("id")));
    break;

  case "feature init":
    upsertFeature(db, {
      id: need("id"),
      programId: args["program-id"],
      workstreamId: args["workstream-id"],
      mode: args.mode,
      artifactRoot: need("artifact-root"),
      request: args.request,
    });
    printResult(args, { ok: true });
    break;
  case "feature set-phase":
    setFeaturePhase(db, need("id"), need("phase"), need("status"), args.notes);
    printResult(args, { ok: true });
    break;
  case "feature get":
    printResult(args, getFeature(db, need("id")));
    break;

  case "contract freeze":
    freezeContract(db, { contractId: need("contract-id"), programId: need("program-id"), version: Number(need("version")), path: args.path });
    printResult(args, { ok: true });
    break;
  case "contract bump":
    bumpContract(db, {
      contractId: need("contract-id"),
      programId: need("program-id"),
      fromVersion: Number(need("from")),
      toVersion: Number(need("to")),
      by: need("by"),
      reason: need("reason"),
    });
    printResult(args, { ok: true });
    break;
  case "contract list":
    printResult(args, listContracts(db, need("program-id")));
    break;

  case "ownership add":
    addOwnershipRule(db, {
      programId: args["program-id"],
      featureId: args["feature-id"],
      owner: need("owner"),
      team: args.team,
      workstream: args.workstream,
      glob: need("glob"),
    });
    printResult(args, { ok: true });
    break;
  case "ownership set": {
    if (!args.file) fail("ownership set requires --file <path.json> (bulk replace-all) — use ownership add for a single rule");
    const rules = JSON.parse(fs.readFileSync(args.file, "utf8"));
    replaceOwnershipRules(db, { programId: args["program-id"], featureId: args["feature-id"], rules });
    if (args["kernel-glob"]) {
      setKernelGlobs(db, need("program-id"), [].concat(args["kernel-glob"]), !!args["kernel-frozen"]);
    }
    printResult(args, { ok: true, count: rules.length });
    break;
  }
  case "ownership clear":
    clearOwnershipRules(db, { programId: args["program-id"], featureId: args["feature-id"] });
    printResult(args, { ok: true });
    break;
  case "ownership list":
    printResult(args, listOwnershipRules(db, { programId: args["program-id"], featureId: args["feature-id"] }));
    break;

  case "ticket add":
    upsertTicket(db, {
      id: need("id"),
      featureId: need("feature-id"),
      title: need("title"),
      role: need("role"),
      status: args.status,
      blockedBy: args["blocked-by"] ? String(args["blocked-by"]).split(",").filter(Boolean) : [],
    });
    printResult(args, { ok: true });
    break;
  case "ticket claim":
    claimTicket(db, need("id"), need("feature-id"), need("by"));
    printResult(args, { ok: true });
    break;
  case "ticket resolve":
    resolveTicket(db, need("id"), need("feature-id"), args.resolution);
    printResult(args, { ok: true });
    break;
  case "ticket list":
    printResult(args, listTickets(db, need("feature-id")));
    break;

  case "ac add":
    upsertAcceptanceCriterion(db, { id: need("id"), featureId: need("feature-id"), kind: args.kind, text: need("text") });
    printResult(args, { ok: true });
    break;
  case "ac link":
    linkTicketToAC(db, { ticketId: need("ticket-id"), acId: need("ac-id"), featureId: need("feature-id") });
    printResult(args, { ok: true });
    break;
  case "ac lineage":
    printResult(args, getACLineage(db, need("feature-id"), need("ac-id")));
    break;

  case "finding add":
    addFinding(db, {
      ref: need("ref"),
      featureId: args["feature-id"],
      programId: args["program-id"],
      blocking: !!args.blocking,
      severity: args.severity,
      location: args.location,
      summary: need("summary"),
      owner: args.owner,
    });
    printResult(args, { ok: true });
    break;
  case "finding resolve":
    resolveFinding(db, need("ref"), { featureId: args["feature-id"], programId: args["program-id"] });
    printResult(args, { ok: true });
    break;
  case "finding list":
    printResult(
      args,
      listFindings(db, { featureId: args["feature-id"], programId: args["program-id"], status: args.status, blockingOnly: !!args["blocking-only"] })
    );
    break;
  case "finding count-blocking":
    printResult(args, { count: countOpenBlockingFindings(db, { featureId: args["feature-id"], programId: args["program-id"] }) });
    break;

  case "channel post": {
    const id = postMessage(db, {
      channel: need("channel"),
      programId: args["program-id"],
      featureId: args["feature-id"],
      type: need("type"),
      from: need("from"),
      fromScope: args["from-scope"],
      to: need("to"),
      refMsgId: args["ref-msg-id"] ? Number(args["ref-msg-id"]) : undefined,
      body: need("body"),
    });
    printResult(args, { ok: true, id });
    break;
  }
  case "channel resolve":
    setMessageStatus(db, Number(need("id")), args.status || "resolved");
    printResult(args, { ok: true });
    break;
  case "channel list":
    printResult(args, listMessages(db, need("channel"), { status: args.status }));
    break;
  case "channel open":
    printResult(args, listOpenMessages(db, { programId: args["program-id"], featureId: args["feature-id"] }));
    break;

  case "render ledger": {
    const program = getProgram(db, need("program-id"));
    if (!program) fail(`no program ${args["program-id"]}`);
    const out = need("out");
    const existing = readIfExists(path.join(cwd, out));
    const md = renderLedger(
      {
        program,
        name: args.name,
        contracts: listContracts(db, program.id),
        contractChanges: listContractChanges(db, program.id),
        workstreamRows: args["workstream-rows"] ? JSON.parse(args["workstream-rows"]) : [],
      },
      existing
    );
    fs.mkdirSync(path.dirname(path.join(cwd, out)), { recursive: true });
    fs.writeFileSync(path.join(cwd, out), md, "utf8");
    printResult(args, { ok: true, path: out });
    break;
  }
  case "render progress": {
    const feature = getFeature(db, need("feature-id"));
    if (!feature) fail(`no feature ${args["feature-id"]}`);
    const out = need("out");
    const existing = readIfExists(path.join(cwd, out));
    const md = renderProgress({ feature, name: args.name, tickets: listTickets(db, feature.id) }, existing);
    fs.mkdirSync(path.dirname(path.join(cwd, out)), { recursive: true });
    fs.writeFileSync(path.join(cwd, out), md, "utf8");
    printResult(args, { ok: true, path: out });
    break;
  }
  case "render ownership": {
    const out = need("out");
    const rules = listOwnershipRules(db, { programId: args["program-id"], featureId: args["feature-id"] });
    const kernelGlobs = args["program-id"] ? listKernelGlobs(db, args["program-id"]) : [];
    const json = renderOwnershipJson({ baseRef: args["base-ref"], kernelGlobs, rules });
    fs.mkdirSync(path.dirname(path.join(cwd, out)), { recursive: true });
    fs.writeFileSync(path.join(cwd, out), json, "utf8");
    printResult(args, { ok: true, path: out });
    break;
  }
  case "render channel": {
    const out = need("out");
    const messages = listMessages(db, need("channel"));
    const md = renderChannel(messages, args.header);
    fs.mkdirSync(path.dirname(path.join(cwd, out)), { recursive: true });
    fs.writeFileSync(path.join(cwd, out), md, "utf8");
    printResult(args, { ok: true, path: out });
    break;
  }

  default:
    fail(`unknown subcommand "${noun} ${verb}" — run with --help for usage`);
}
