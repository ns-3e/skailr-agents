#!/usr/bin/env node
/**
 * migrate.mjs — Skailr installer-owned, additive-only upgrade migrations.
 *
 * ALL migration logic lives here. `install.sh` and `install.ps1` are thin call
 * sites that pass an ordered id array; `doctor.mjs` asserts runner == sh == ps1.
 *
 * Usage:
 *   node scripts/skailr/migrate.mjs --target <dir> --only <id> [--pre-existing <csv>] [--json]
 *   node scripts/skailr/migrate.mjs --list [--json]
 *
 * Contract (argv, console strings, --json shape, exit codes) is frozen in
 * .claude/tmp/spec.md → "API Contract". Do not deviate.
 *
 * Invariants:
 *   - Purely ADDITIVE. A key the consumer explicitly set is never overwritten,
 *     and a value we cannot safely parse is never replaced.
 *   - A file that did not exist BEFORE this install run's copy phase is never
 *     touched (the copy phase already ships current defaults) — `--pre-existing`.
 *   - Idempotent: every run re-derives from the file's live value; no ledger,
 *     no state file. Re-running is a no-op by construction.
 *   - Never fatal to the caller: unparseable, unwritable and unknown-file
 *     conditions are reported and exit 0. Only usage errors exit 2.
 *   - `node` absence is the CALLER's guard (`command -v node`), not this file's.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SCHEMA = "skailr.migrate/v1";
const SETTINGS = ".claude/settings.skailr.json";

// ---------- migrations (ordered; ids must match /^[a-z][a-z0-9-]*$/) ----------

/**
 * The "explicitly set" test is the LITERAL NEGATION of emit-telemetry.mjs:33-46
 * (`s && s.telemetry && typeof s.telemetry.enabled === "boolean"` ⇒ explicit),
 * so the gate and the migration can never disagree about what "explicit" means.
 * A non-object `telemetry` container is `unsafe`: the gate ignores it, but
 * replacing it would delete a value the consumer typed (spec Q6).
 */
function classifyTelemetryEnabled(json) {
  if (json === null || typeof json !== "object" || Array.isArray(json)) return "unsafe";
  const t = json.telemetry;
  if (t === undefined) return "fill-absent";
  if (t === null || typeof t !== "object" || Array.isArray(t)) return "unsafe";
  if (!("enabled" in t)) return "fill-absent";
  if (typeof t.enabled === "boolean") return "explicit";
  return "fill-malformed";
}

/**
 * Structural clone of classifyTelemetryEnabled for `autoUpdate.enabled`
 * (spec: Data Model → Migrations → forward `autoupdate-enabled-default`).
 * Same rule, same order, same "never replace a value the consumer typed".
 */
function classifyAutoUpdateEnabled(json) {
  if (json === null || typeof json !== "object" || Array.isArray(json)) return "unsafe";
  const a = json.autoUpdate;
  if (a === undefined) return "fill-absent";
  if (a === null || typeof a !== "object" || Array.isArray(a)) return "unsafe";
  if (!("enabled" in a)) return "fill-absent";
  if (typeof a.enabled === "boolean") return "explicit";
  return "fill-malformed";
}

// The exact third entry shipped in .claude/settings.skailr.json. Cloned on use so
// no two runs can ever share one mutable object.
const CHECK_UPDATE_MARKER = "check-update.mjs";
const CHECK_UPDATE_HOOK = {
  type: "command",
  command: "node scripts/skailr/check-update.mjs 2>/dev/null || true",
};

function isDefaultStopBlock(block) {
  return (
    block !== null &&
    typeof block === "object" &&
    !Array.isArray(block) &&
    Array.isArray(block.hooks) &&
    (block.matcher === undefined || block.matcher === "")
  );
}

/**
 * Array-aware, idempotent append of the check-update Stop hook entry.
 * Returns { verdict, blockIndex }.
 *
 * `unsafe` here is deliberate and load-bearing (spec Design Decisions row 3): a
 * consumer who deleted `hooks` / `hooks.Stop` did so on purpose, and re-creating
 * the container would not be additive. No-op, never resurrect.
 *
 * Idempotency is by re-derivation, not by ledger: if ANY entry in ANY Stop block
 * already mentions check-update.mjs (ours or a consumer's own wiring), we are
 * done. Existing entries are never read for anything but this test, never
 * rewritten, never reordered.
 */
function classifyStopHookEntry(json) {
  const no = (verdict) => ({ verdict, blockIndex: -1 });
  if (json === null || typeof json !== "object" || Array.isArray(json)) return no("unsafe");
  const hooks = json.hooks;
  if (hooks === null || typeof hooks !== "object" || Array.isArray(hooks)) return no("no-container");
  const stop = hooks.Stop;
  if (!Array.isArray(stop) || stop.length === 0) return no("no-container");

  for (const block of stop) {
    if (block === null || typeof block !== "object" || !Array.isArray(block.hooks)) continue;
    for (const entry of block.hooks) {
      if (
        entry !== null &&
        typeof entry === "object" &&
        typeof entry.command === "string" &&
        entry.command.includes(CHECK_UPDATE_MARKER)
      ) {
        return no("explicit");
      }
    }
  }

  const blockIndex = stop.findIndex(isDefaultStopBlock);
  if (blockIndex === -1) return no("no-default-block");
  return { verdict: "fill-absent", blockIndex };
}

export const MIGRATIONS = [
  {
    id: "telemetry-enabled-default",
    file: SETTINGS,
    describe: "fill telemetry.enabled: true when the consumer never set it explicitly",
    classify: classifyTelemetryEnabled,
    apply(json) {
      const verdict = classifyTelemetryEnabled(json);
      if (verdict === "explicit") {
        return { changed: false, json, reason: "explicit" };
      }
      if (verdict === "unsafe") {
        return { changed: false, json, reason: "non-object-container" };
      }
      if (json.telemetry === undefined) json.telemetry = {};
      json.telemetry.enabled = true;
      return {
        changed: true,
        json,
        reason: verdict === "fill-malformed" ? "malformed" : "absent",
      };
    },
  },
  {
    id: "autoupdate-enabled-default",
    file: SETTINGS,
    describe: "fill autoUpdate.enabled: true when the consumer never set it explicitly",
    classify: classifyAutoUpdateEnabled,
    apply(json) {
      const verdict = classifyAutoUpdateEnabled(json);
      if (verdict === "explicit") {
        return {
          changed: false,
          json,
          reason: "explicit",
          detail: "autoUpdate.enabled already set explicitly",
        };
      }
      if (verdict === "unsafe") {
        return {
          changed: false,
          json,
          reason: "non-object-container",
          detail: "autoUpdate is not an object; consumer value left untouched",
        };
      }
      if (json.autoUpdate === undefined) json.autoUpdate = {};
      json.autoUpdate.enabled = true;
      return {
        changed: true,
        json,
        reason: verdict === "fill-malformed" ? "autoupdate-malformed" : "autoupdate-absent",
      };
    },
  },
  {
    id: "autoupdate-stop-hook",
    file: SETTINGS,
    describe: "append the check-update.mjs Stop hook entry when it is not already wired",
    classify: (json) => classifyStopHookEntry(json).verdict,
    apply(json) {
      const { verdict, blockIndex } = classifyStopHookEntry(json);
      if (verdict === "explicit") return { changed: false, json, reason: "already-wired" };
      if (verdict === "unsafe") {
        return {
          changed: false,
          json,
          reason: "non-object-container",
          detail: "settings root is not an object; consumer value left untouched",
        };
      }
      if (verdict !== "fill-absent") return { changed: false, json, reason: verdict };
      // Append only. Never splice, reorder, or touch an existing entry.
      json.hooks.Stop[blockIndex].hooks.push({ ...CHECK_UPDATE_HOOK });
      return { changed: true, json, reason: "hook-appended" };
    },
  },
];

// ---------- result → human line (spec: API Contract → human mode) ----------

const DETAIL = {
  absent: "added telemetry.enabled: true",
  malformed: "corrected non-boolean telemetry.enabled → true",
  explicit: "telemetry.enabled already set explicitly",
  "not-pre-existing": "not present before this run",
  "missing-file": "not present before this run",
  unparseable: "unparseable JSON; left untouched",
  "non-object-container": "telemetry is not an object; consumer value left untouched",
  "autoupdate-absent": "added autoUpdate.enabled: true",
  "autoupdate-malformed": "corrected non-boolean autoUpdate.enabled → true",
  "hook-appended": "appended the check-update.mjs Stop hook entry",
  "already-wired": "check-update.mjs Stop hook entry already present",
  "no-container": "hooks.Stop absent or empty; not re-created",
  "no-default-block": "no default Stop block to append to; left untouched",
};

const LOUD = new Set([
  "unparseable",
  "non-object-container",
  "write-error",
  "no-container",
  "no-default-block",
]);

function humanLine(r) {
  if (r.status === "applied") return `  ~ ${r.file} ← ${r.id} applied (${r.detail})`;
  if (r.status === "failed") return `  ! ${r.file} ${r.id} failed (${r.detail}); install continues`;
  const prefix = LOUD.has(r.reason) ? "!" : "=";
  const verb = r.status === "noop" ? "no-op" : "skipped";
  return `  ${prefix} ${r.file} ${r.id} ${verb} (${r.detail})`;
}

// ---------- runner ----------

function result(mig, status, reason, detail) {
  return { id: mig.id, file: mig.file, status, reason, detail: detail ?? DETAIL[reason] };
}

/**
 * Run one migration against `targetDir`.
 * `preExisting` = repo-relative paths that existed BEFORE this run's copy phase.
 * Never throws: every failure mode maps to a terminal result object.
 */
export function runMigration(mig, targetDir, preExisting) {
  // Gate FIRST — before any read — so a file the copy phase just created in this
  // very run is never opened, let alone written (AC-5, AC-10, EC-1, EC-7).
  if (!preExisting.includes(mig.file)) return result(mig, "skipped", "not-pre-existing");

  const path = join(targetDir, ...mig.file.split("/"));
  if (!existsSync(path)) return result(mig, "skipped", "missing-file");

  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch (e) {
    return result(mig, "failed", "write-error", `${e.code || "EIO"}: not readable`);
  }

  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    return result(mig, "skipped", "unparseable"); // never opened for write
  }

  const out = mig.apply(json);
  if (!out.changed) {
    const status = out.reason === "explicit" ? "noop" : "skipped";
    // out.detail is optional: it lets a migration reuse a shared reason key
    // (explicit / non-object-container) with per-key wording. Undefined ⇒ DETAIL.
    return result(mig, status, out.reason, out.detail);
  }

  try {
    writeFileSync(path, JSON.stringify(out.json, null, 2) + "\n", "utf8");
  } catch (e) {
    return result(mig, "failed", "write-error", `${e.code || "EIO"}: not writable`);
  }
  return result(mig, "applied", out.reason);
}

// ---------- CLI ----------

function usageError(msg, asJson) {
  if (asJson) process.stdout.write(JSON.stringify({ schema: SCHEMA, error: msg }) + "\n");
  else process.stderr.write(`migrate.mjs: ${msg}\n`);
  process.exit(2);
}

function parseArgv(argv) {
  const opts = { target: "", only: "", preExisting: "", list: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") opts.json = true;
    else if (a === "--list") opts.list = true;
    else if (a === "--target") opts.target = argv[++i] ?? "";
    else if (a === "--only") opts.only = argv[++i] ?? "";
    else if (a === "--pre-existing") opts.preExisting = argv[++i] ?? "";
    else return { opts, bad: a };
  }
  return { opts, bad: null };
}

function main(argv) {
  const { opts, bad } = parseArgv(argv);
  if (bad) usageError(`unknown flag "${bad}"`, opts.json);

  if (opts.list) {
    if (opts.json) {
      const migrations = MIGRATIONS.map((m) => ({ id: m.id, file: m.file, describe: m.describe }));
      process.stdout.write(JSON.stringify({ schema: SCHEMA, migrations }) + "\n");
    } else {
      for (const m of MIGRATIONS) process.stdout.write(`${m.id}\n`);
    }
    process.exit(0);
  }

  if (!opts.target) usageError("--target is required", opts.json);
  if (!opts.only) usageError("--only is required", opts.json);
  const mig = MIGRATIONS.find((m) => m.id === opts.only);
  if (!mig) usageError(`unknown migration "${opts.only}"`, opts.json);

  const preExisting = opts.preExisting
    .split(",")
    .map((s) => s.trim().replace(/\\/g, "/"))
    .filter(Boolean);

  const results = [runMigration(mig, opts.target, preExisting)];
  if (opts.json) process.stdout.write(JSON.stringify({ schema: SCHEMA, results }) + "\n");
  else for (const r of results) process.stdout.write(humanLine(r) + "\n");
  process.exit(0);
}

// Only run the CLI when invoked directly, so the smoke harness can import MIGRATIONS.
if (process.argv[1] && process.argv[1].endsWith("migrate.mjs")) {
  main(process.argv.slice(2));
}
