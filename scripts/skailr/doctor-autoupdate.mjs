/**
 * doctor-autoupdate.mjs — the two pack-only update-check rows for doctor.mjs.
 *
 * Split out of doctor.mjs deliberately (spec → Backend Work → Megafile check): inlining
 * these ~90 lines would push doctor.mjs past the 400-line megafile threshold. Read-only.
 *
 * Consumed by doctor.mjs inside its existing `isPack` block, right after §7f, which is the
 * only place `exported` (migrate.mjs's id list), `sh`, and `ps1` are all in scope.
 *
 * Rows:
 *   autoupdate settings default — the SHIPPED template defaults autoUpdate.enabled to true.
 *   autoupdate wiring          — the hooks-array migration is genuinely wired end to end:
 *                                runtime script present, template carries the Stop hook
 *                                entry, and BOTH installers carry both ids and call the
 *                                runtime script. (§7f already proves runner/sh/ps1 id
 *                                identity and order — never duplicated here.)
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const SETTINGS = ".claude/settings.skailr.json";
const CHECK_UPDATE = "scripts/skailr/check-update.mjs";
const HOOK_SUFFIX = "2>/dev/null || true";
const IDS = ["autoupdate-enabled-default", "autoupdate-stop-hook"];

function readText(p) {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

/**
 * @param {{root: string, sh?: string, ps1?: string, exported?: string[]}} ctx
 * @returns {{status: "PASS"|"FAIL"|"SKIP", name: string, detail: string}[]}
 */
export function autoUpdateChecks({ root, sh = "", ps1 = "", exported = [] }) {
  const rows = [];
  const push = (status, name, detail) => rows.push({ status, name, detail });
  const settingsText = readText(join(root, SETTINGS));
  const hasScript = existsSync(join(root, CHECK_UPDATE));

  // EC-10: a pack checkout that predates this feature carries NO trace of it anywhere —
  // that is "not adopted", not "broken", so both rows SKIP. Any single trace means the
  // feature is (partially) adopted and every assertion below applies: partial adoption is
  // exactly the drift these rows exist to catch, so it must never fall into this branch.
  const traces =
    hasScript ||
    IDS.some((id) => exported.includes(id) || sh.includes(id) || ps1.includes(id)) ||
    sh.includes("check-update.mjs") ||
    ps1.includes("check-update.mjs") ||
    (settingsText !== null &&
      (settingsText.includes("check-update.mjs") || /"autoUpdate"\s*:/.test(settingsText)));
  if (!traces) {
    const why = "checkout predates the update-check feature (no autoUpdate artifacts)";
    push("SKIP", "autoupdate settings default", why);
    push("SKIP", "autoupdate wiring", why);
    return rows;
  }

  let settings = null;
  let parseErr = null;
  if (settingsText === null) parseErr = `${SETTINGS}: unreadable or absent`;
  else {
    try {
      const j = JSON.parse(settingsText);
      if (!j || typeof j !== "object" || Array.isArray(j)) parseErr = `${SETTINGS}: root is not an object`;
      else settings = j;
    } catch (e) {
      parseErr = `${SETTINGS}: unparseable JSON (${String(e.message || e)})`;
    }
  }

  // ---- Row 1: shipped template defaults autoUpdate.enabled to true ----
  const dErrs = [];
  if (parseErr) dErrs.push(parseErr);
  else {
    const au = settings.autoUpdate;
    if (au === undefined) dErrs.push(`${SETTINGS}: autoUpdate key absent (fresh installs would ship no default)`);
    else if (!au || typeof au !== "object" || Array.isArray(au))
      dErrs.push(`${SETTINGS}: autoUpdate must be an object, got ${JSON.stringify(au)}`);
    else if (au.enabled !== true)
      dErrs.push(`${SETTINGS}: autoUpdate.enabled is ${JSON.stringify(au.enabled)}, expected true`);
  }
  push(
    dErrs.length ? "FAIL" : "PASS",
    "autoupdate settings default",
    dErrs.length ? dErrs.slice(0, 6).join("; ") : "shipped template ships autoUpdate.enabled: true",
  );

  // ---- Row 2: wiring parity (script + template hook entry + both installers) ----
  const wErrs = [];
  if (!hasScript) wErrs.push(`${CHECK_UPDATE}: missing`);
  if (parseErr) wErrs.push(parseErr);
  else {
    const stop = settings.hooks && typeof settings.hooks === "object" ? settings.hooks.Stop : undefined;
    const commands = (Array.isArray(stop) ? stop : [])
      .flatMap((b) => (b && Array.isArray(b.hooks) ? b.hooks : []))
      .map((h) => (h && typeof h.command === "string" ? h.command : ""));
    const entry = commands.find((c) => c.includes(CHECK_UPDATE));
    if (!entry) wErrs.push(`${SETTINGS}: no Stop hook entry whose command contains ${CHECK_UPDATE}`);
    else if (!entry.trimEnd().endsWith(HOOK_SUFFIX))
      wErrs.push(`${SETTINGS}: check-update Stop hook must end with "${HOOK_SUFFIX}", got "…${entry.slice(-30)}"`);
  }
  for (const id of IDS) if (!exported.includes(id)) wErrs.push(`migrate.mjs: does not export migration ${id}`);
  for (const [label, text] of [
    ["install.sh", sh],
    ["install.ps1", ps1],
  ]) {
    if (!text) {
      wErrs.push(`${label}: unreadable or absent`);
      continue;
    }
    for (const id of IDS) if (!text.includes(id)) wErrs.push(`${label}: missing migration id ${id}`);
    if (!text.includes("check-update.mjs")) wErrs.push(`${label}: never invokes check-update.mjs`);
  }
  push(
    wErrs.length ? "FAIL" : "PASS",
    "autoupdate wiring",
    wErrs.length
      ? wErrs.slice(0, 6).join("; ")
      : "check-update.mjs + template Stop hook entry + both ids called by install.sh and install.ps1",
  );
  return rows;
}
