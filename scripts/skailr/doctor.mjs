#!/usr/bin/env node
/**
 * doctor.mjs — one-shot health check for a skailr-agents installation.
 *
 * Answers "is this install sane?" in one command. Read-only. Works in both the
 * pack repo and consumer installs; pack-only checks (version consistency, manifest,
 * installer-array parity, block lint) are SKIPped when the pack files are absent.
 *
 * Exit: 0 no FAIL rows; 1 otherwise.
 * Usage: node scripts/skailr/doctor.mjs [--root .] [--json]
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { spawnSync } from "node:child_process";
import { autoUpdateChecks } from "./doctor-autoupdate.mjs";

function parseArgs(argv) {
  const out = { root: ".", json: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--root") out.root = argv[++i];
    else if (argv[i] === "--json") out.json = true;
    else if (argv[i] === "--help") {
      console.log("Usage: doctor.mjs [--root .] [--json]");
      process.exit(0);
    } else {
      console.error(`Unknown arg: ${argv[i]}`);
      process.exit(2);
    }
  }
  return out;
}

const rows = [];
function report(status, name, detail = "") {
  rows.push({ status, name, detail });
}

function walkMd(dir, ext = ".md") {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out.push(...walkMd(p, ext));
    else if (f.endsWith(ext)) out.push(p);
  }
  return out;
}

function runNode(root, script, args = []) {
  const path = join(root, "scripts/skailr", script);
  if (!existsSync(path)) return { missing: true };
  const r = spawnSync(process.execPath, [path, ...args], { cwd: root, encoding: "utf8" });
  return { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
}

function main() {
  const args = parseArgs(process.argv);
  const root = resolve(args.root);

  // ---- 1. Core files ----
  const core = [
    ".claude/intake.md",
    "CLAUDE.md",
    ".claude/settings.json",
    ".claude/settings.skailr.json",
  ];
  const missingCore = core.filter((f) => !existsSync(join(root, f)));
  if (missingCore.length) report("FAIL", "core files", `missing: ${missingCore.join(", ")}`);
  else report("PASS", "core files", `${core.length} present`);

  const schemasDir = join(root, ".claude/program/schemas");
  const schemaCount = existsSync(schemasDir) ? readdirSync(schemasDir).length : 0;
  report(schemaCount > 0 ? "PASS" : "FAIL", "schemas", `${schemaCount} file(s) in .claude/program/schemas`);

  // ---- 2. Agents: name == filename, no flat files ----
  const agentsDir = join(root, ".claude/agents");
  const agentFiles = walkMd(agentsDir);
  const flat = existsSync(agentsDir)
    ? readdirSync(agentsDir).filter((f) => f.endsWith(".md"))
    : [];
  const badNames = [];
  for (const f of agentFiles) {
    const m = readFileSync(f, "utf8").match(/^name:\s*(.+)$/m);
    if (!m || m[1].trim() !== basename(f, ".md")) badNames.push(basename(f));
  }
  if (!agentFiles.length) report("FAIL", "agents", "no agent files under .claude/agents");
  else if (flat.length) report("FAIL", "agents", `flat files (must live under a team dir): ${flat.join(", ")}`);
  else if (badNames.length) report("FAIL", "agents", `name≠filename: ${badNames.join(", ")}`);
  else report("PASS", "agents", `${agentFiles.length} agents, names match`);

  // ---- 3. Skill references resolve ----
  const sourceFiles = [...agentFiles, ...walkMd(join(root, ".claude/commands"))];
  const referenced = new Set();
  for (const f of sourceFiles) {
    for (const m of readFileSync(f, "utf8").matchAll(/[Ss]kills? `([a-z][a-z0-9-]*)`/g)) {
      referenced.add(m[1]);
    }
  }
  const unresolved = [...referenced].filter(
    (s) => !existsSync(join(root, ".claude/skills", s, "SKILL.md")),
  );
  if (unresolved.length) report("FAIL", "skill refs", `unresolved: ${unresolved.join(", ")}`);
  else report("PASS", "skill refs", `${referenced.size} referenced skill(s) resolve`);

  // ---- 4. Script references resolve ----
  const scriptRefs = new Set();
  for (const f of [...sourceFiles, ...walkMd(join(root, ".claude/skills"))]) {
    for (const m of readFileSync(f, "utf8").matchAll(/scripts\/skailr\/([a-z-]+\.mjs)/g)) {
      scriptRefs.add(m[1]);
    }
  }
  const missingScripts = [...scriptRefs].filter(
    (s) => !existsSync(join(root, "scripts/skailr", s)),
  );
  if (missingScripts.length) report("FAIL", "script refs", `missing: ${missingScripts.join(", ")}`);
  else report("PASS", "script refs", `${scriptRefs.size} referenced script(s) present`);

  // ---- 5. Hook scripts present (the pack's only enforcement layer) ----
  const hookScripts = ["check-blocking-findings.mjs", "check-update.mjs", "check-ownership.mjs"];
  const missingHooks = hookScripts.filter((s) => !existsSync(join(root, "scripts/skailr", s)));
  if (missingHooks.length) report("FAIL", "hook scripts", `missing: ${missingHooks.join(", ")}`);
  else report("PASS", "hook scripts", `${hookScripts.length} present`);

  // ---- 6. Mirror presence ----
  if (existsSync(join(root, ".cursor"))) {
    const mirror = [".cursor/rules/intake.mdc"];
    const missing = mirror.filter((f) => !existsSync(join(root, f)));
    report(missing.length ? "FAIL" : "PASS", "cursor mirror", missing.length ? `missing: ${missing.join(", ")}` : "core mirror files present");
  } else {
    report("SKIP", "cursor mirror", "no .cursor/ (Claude-only install)");
  }

  // ---- 7. Pack-repo-only checks ----
  const isPack = existsSync(join(root, "manifest.json")) && existsSync(join(root, "scripts/remirror.sh"));
  if (!isPack) {
    report("SKIP", "pack checks", "consumer install (no manifest.json/remirror.sh)");
  } else {
    // 7a. Version consistency
    try {
      const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
      const man = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8")).version;
      const logM = readFileSync(join(root, "CHANGELOG.md"), "utf8").match(/^## \[(\d+\.\d+\.\d+)\]/m);
      const log = logM ? logM[1] : "none";
      const plgPath = join(root, ".claude-plugin/plugin.json");
      const plg = existsSync(plgPath) ? JSON.parse(readFileSync(plgPath, "utf8")).version : pkg;
      if (pkg === man && pkg === log && pkg === plg) report("PASS", "versions", `package=manifest=plugin=changelog=${pkg}`);
      else report("FAIL", "versions", `package=${pkg} manifest=${man} plugin=${plg} changelog=${log}`);
    } catch (e) {
      report("FAIL", "versions", String(e.message || e));
    }

    // 7b. Manifest paths resolve
    try {
      const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
      const missing = [];
      for (const e of manifest.artifacts || []) {
        for (const k of ["claude_path", "cursor_path"]) {
          if (e[k] && !existsSync(join(root, e[k]))) missing.push(e[k]);
        }
      }
      report(missing.length ? "FAIL" : "PASS", "manifest paths", missing.length ? `missing: ${missing.slice(0, 5).join(", ")}` : `${(manifest.artifacts || []).length} artifacts resolve`);
    } catch (e) {
      report("FAIL", "manifest paths", String(e.message || e));
    }

    // 7c. Installer arrays cover the mirror (commands + rules)
    const parity = [];
    const cursorCommands = walkMd(join(root, ".cursor/commands")).map((f) => basename(f, ".md"));
    const cursorRules = walkMd(join(root, ".cursor/rules"), ".mdc").map((f) => basename(f, ".mdc"));
    const sh = existsSync(join(root, "install.sh")) ? readFileSync(join(root, "install.sh"), "utf8") : "";
    const ps1 = existsSync(join(root, "install.ps1")) ? readFileSync(join(root, "install.ps1"), "utf8") : "";
    const extract = (text, marker) => {
      const m = text.match(new RegExp(marker + String.raw`\s*=?\s*[@(]?\(([\s\S]*?)\)`));
      if (!m) return null;
      // bash arrays are bare tokens; ps1 arrays are quoted + comma-separated
      return m[1]
        .split(/[\s,]+/)
        .map((t) => t.replace(/^"|"$/g, ""))
        .filter((t) => /^[a-z][a-z0-9-]*$/.test(t));
    };
    for (const [label, text, cmdMarker, ruleMarker] of [
      ["install.sh", sh, "PACKAGED_COMMANDS", "PACKAGED_RULES"],
      ["install.ps1", ps1, String.raw`\$PackagedCommands`, String.raw`\$PackagedRules`],
    ]) {
      if (!text) continue;
      const cmds = extract(text, cmdMarker);
      const rules = extract(text, ruleMarker);
      if (!cmds || !rules) {
        parity.push(`${label}: could not parse arrays`);
        continue;
      }
      for (const c of cursorCommands) if (!cmds.includes(c)) parity.push(`${label}: command ${c} not installed`);
      for (const c of cmds) if (!cursorCommands.includes(c)) parity.push(`${label}: command ${c} has no mirror file`);
      for (const r of cursorRules) if (!rules.includes(r)) parity.push(`${label}: rule ${r} not installed`);
      for (const r of rules) if (!cursorRules.includes(r)) parity.push(`${label}: rule ${r} has no mirror file`);
    }
    report(parity.length ? "FAIL" : "PASS", "installer parity", parity.length ? parity.slice(0, 6).join("; ") : "installer arrays == mirror set");

    // 7d'. npm tarball must never carry this repo's own runtime/dogfood state.
    // "files" in package.json includes listed directories VERBATIM FROM DISK and
    // bypasses .gitignore entirely — a directory entry there (e.g. ".claude") silently
    // repacks whatever gitignored working files happen to sit in the checkout
    // (research.md, ledger.md, contracts, workstream reports, settings.local.json …).
    // This shipped once; never again.
    const DISALLOWED_IN_TARBALL = [
      /^\.claude\/tmp\//,
      /^\.claude\/repo\//,
      /^\.claude\/experts\//,
      /^\.claude\/settings\.local\.json$/,
      /^\.claude\/program\/(?!channels\/(PROTOCOL|program|feature)\.md$|schemas\/)/,
      /^docs\/audits\//, // local audit working papers — gitignored, never shipped
    ];
    if (existsSync(join(root, "package.json")) && existsSync(join(root, "install.sh"))) {
      const r = spawnSync("npm", ["pack", "--dry-run", "--json"], { cwd: root, encoding: "utf8" });
      try {
        const files = JSON.parse(r.stdout)[0].files.map((f) => f.path);
        const leaked = files.filter((f) => DISALLOWED_IN_TARBALL.some((re) => re.test(f)));
        report(leaked.length ? "FAIL" : "PASS", "npm tarball contents", leaked.length ? `leaked: ${leaked.slice(0, 5).join(", ")}` : `${files.length} files, no runtime/dogfood state`);
      } catch {
        report("SKIP", "npm tarball contents", "npm pack --dry-run --json unavailable");
      }
    }

    // 7e'. Plugin manifests: both JSONs must parse, names must agree, and every
    // configured plugin command path must exist — a broken manifest fails at the
    // user's `claude plugin install`, far from this repo.
    const pluginPath = join(root, ".claude-plugin/plugin.json");
    const marketPath = join(root, ".claude-plugin/marketplace.json");
    if (existsSync(pluginPath) || existsSync(marketPath)) {
      const perrs = [];
      try {
        const plugin = JSON.parse(readFileSync(pluginPath, "utf8"));
        if (!plugin.name) perrs.push("plugin.json missing name");
        for (const c of [].concat(plugin.commands || [])) {
          if (!c.startsWith("./")) perrs.push(`plugin.json command path must start with ./: ${c}`);
          else if (!existsSync(join(root, c))) perrs.push(`plugin.json command path missing: ${c}`);
        }
        const market = JSON.parse(readFileSync(marketPath, "utf8"));
        if (!market.name) perrs.push("marketplace.json missing name");
        const entry = (market.plugins || []).find((p) => p.name === plugin.name);
        if (!entry) perrs.push(`marketplace.json has no entry named ${plugin.name}`);
      } catch (e) {
        perrs.push(String(e.message || e));
      }
      report(perrs.length ? "FAIL" : "PASS", "plugin manifests", perrs.length ? perrs.join("; ") : "plugin.json + marketplace.json valid and consistent");
    }

    // 7e. Workflow block scalars: a column-0 line inside a `run: |` block terminates
    // the YAML scalar and kills the whole workflow at GitHub's parser — zero jobs run,
    // and nothing local notices (this exact failure shipped once, silently, for days).
    const wfDir = join(root, ".github/workflows");
    const wfErrors = [];
    if (existsSync(wfDir)) {
      for (const wf of readdirSync(wfDir).filter((f) => /\.ya?ml$/.test(f))) {
        const lines = readFileSync(join(wfDir, wf), "utf8").split("\n");
        let scalarIndent = -1;
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (scalarIndent >= 0) {
            if (line.trim() === "") continue;
            const indent = line.match(/^ */)[0].length;
            if (indent > scalarIndent) continue;
            if (indent === 0) {
              wfErrors.push(`${wf}:${i + 1} column-0 line inside a run:| block ("${line.slice(0, 40)}")`);
              continue; // keep scanning; report every offender
            }
            scalarIndent = -1; // dedented to a shallower key — scalar ended legally
          }
          const m = line.match(/^(\s*)run:\s*\|/);
          if (m) scalarIndent = m[1].length;
        }
      }
      report(wfErrors.length ? "FAIL" : "PASS", "workflow scalars", wfErrors.length ? wfErrors.slice(0, 3).join("; ") : "no column-0 lines inside run:| blocks");
    }

    // 7f. Migrations: three-way ordered identity between the runner's exported ids and
    // BOTH installers' call lists (runner == install.sh == install.ps1). A two-way carrier
    // check passes when both carriers drift together from the runner, so the runner is the
    // third party here. Never vacuously green: an unparseable extraction and an EMPTY
    // extraction are each their own named failure — two empty lists must never count as
    // agreement, which is exactly what an id that doctor's token filter silently drops
    // (uppercase, dots, parens, leading digit) would otherwise produce.
    const mErrs = [];
    let exported = [];
    if (!existsSync(join(root, "scripts/skailr/migrate.mjs"))) {
      mErrs.push("scripts/skailr/migrate.mjs missing");
    } else {
      const mr = runNode(root, "migrate.mjs", ["--list", "--json"]);
      if (mr.status !== 0) {
        mErrs.push(`migrate.mjs --list --json exited ${mr.status}: ${(mr.out || "").trim().split("\n").pop()}`);
      } else {
        try {
          const parsed = JSON.parse(mr.out);
          if (!Array.isArray(parsed.migrations)) throw new Error("output has no migrations[] array");
          exported = parsed.migrations.map((m) => (m ? m.id : m));
        } catch (e) {
          mErrs.push(`migrate.mjs --list --json unparseable: ${String(e.message || e)}`);
        }
        if (!mErrs.length && !exported.length) mErrs.push("migrate.mjs exports zero migrations");
      }
      for (const id of exported) {
        if (typeof id !== "string" || !/^[a-z][a-z0-9-]*$/.test(id)) {
          mErrs.push(`migrate.mjs: migration id ${JSON.stringify(id)} cannot survive doctor's token filter (/^[a-z][a-z0-9-]*$/)`);
        }
      }
      for (const [label, text, marker] of [
        ["install.sh", sh, "SKAILR_MIGRATIONS"],
        ["install.ps1", ps1, String.raw`\$SkailrMigrations`],
      ]) {
        const name = marker.replace(/\\/g, "");
        if (!text) { mErrs.push(`${label}: unreadable or absent`); continue; }
        if (!text.includes("migrate.mjs")) mErrs.push(`${label}: never invokes migrate.mjs`);
        const got = extract(text, marker);
        if (!got) { mErrs.push(`${label}: could not parse ${name}`); continue; }
        if (!got.length) { mErrs.push(`${label}: ${name} extracted empty — check for uppercase/dots/parens in ids`); continue; }
        for (const id of exported) if (!got.includes(id)) mErrs.push(`${label}: missing migration ${id}`);
        for (const id of got) if (!exported.includes(id)) mErrs.push(`${label}: unknown migration ${id} (not exported by migrate.mjs)`);
        if (got.join(",") !== exported.join(","))
          mErrs.push(`${label}: migration order differs (migrate.mjs=[${exported.join(",")}] ${label}=[${got.join(",")}])`);
      }
    }
    report(
      mErrs.length ? "FAIL" : "PASS",
      "migrations",
      mErrs.length ? mErrs.slice(0, 6).join("; ") : `${exported.length} migration(s), runner == install.sh == install.ps1`,
    );

    // 7g. Update-check (autoUpdate) rows — settings default + wiring parity. Lives in a
    // sibling module to keep this file under the megafile threshold; must sit AFTER 7f
    // because it consumes 7f's `exported` id list alongside `sh`/`ps1`.
    rows.push(...autoUpdateChecks({ root, sh, ps1, exported }));
  }

  // ---- Output ----
  const failed = rows.filter((r) => r.status === "FAIL");
  if (args.json) {
    console.log(JSON.stringify({ ok: !failed.length, rows }, null, 2));
  } else {
    const w = Math.max(...rows.map((r) => r.name.length));
    for (const r of rows) console.log(`${r.status.padEnd(4)} ${r.name.padEnd(w)}  ${r.detail}`);
    console.log(failed.length ? `\n${failed.length} check(s) FAILED` : "\nAll checks passed");
  }
  process.exit(failed.length ? 1 : 0);
}

main();
