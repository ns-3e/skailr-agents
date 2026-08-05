#!/usr/bin/env node
/**
 * check-update.mjs — Skailr update check-and-notify. Zero external deps.
 *
 * Modes (BOTH exit 0 ALWAYS — spec "Design Decisions", deliberate deviation
 * from migrate.mjs/doctor.mjs, which exit 2 on usage errors):
 *   (default)         Stop-hook call site. Gate → marker → cadence → network →
 *                     compare → at most one notice line on stdout.
 *   --record-install  Installer call site. Write <target>/.skailr/installed-version.json
 *                     from the PACK's package.json version.
 *
 * Usage:
 *   node scripts/skailr/check-update.mjs [--target <dir>] [--json]
 *   node scripts/skailr/check-update.mjs --record-install --target <dir> [--json]
 *
 * Contract (argv, ordered algorithm, notice string, --json shape, exit code) is
 * frozen in .claude/tmp/spec.md → "API Contract". Do not deviate.
 *
 * Invariants:
 *   - NOTIFY ONLY. This file never upgrades, installs, deletes or rewrites any
 *     pack-owned or consumer-owned file. Its only writes are the two JSON state
 *     files under <target>/.skailr/ (AC-9).
 *   - Never reads, enumerates, fingerprints or writes anything under
 *     .claude/experts/ (AC-10). There is no path in this file that names it.
 *   - Step order is contractual: the enabled gate (step 1) precedes ANY state
 *     read, and the cadence gate (step 3) precedes ANY network call (AC-3, AC-4).
 *   - The cadence stamp is written BEFORE the request (step 4), so a timeout,
 *     kill or offline box still consumes the 24h window (AC-6, EC-5).
 *   - Every fault is swallowed: exit 0, at most one `check-update:` line on
 *     stderr, never a torn state file (tmp+rename, EC-2).
 *   - Outbound request carries no auth, no cookie, no custom UA, no query, no
 *     body — a bare public registry version lookup and nothing else (AC-8).
 *   - A failed state write is swallowed and the run continues; the closed
 *     `reason` enum has no write-error member in check mode by design.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCHEMA = "skailr.update-check/v1";
const MARKER_SCHEMA = "skailr.installed-version/v1";
const SETTINGS = ".claude/settings.skailr.json";
const STATE_DIR = ".skailr";
const MARKER_FILE = "installed-version.json";
const CHECK_FILE = "update-check.json";

const DEFAULT_REGISTRY = "https://registry.npmjs.org"; // shipped behavior (AC-8)
const PACKAGE = "skailr-agents";
const CADENCE_MS = 86_400_000; // 24h from last ATTEMPT (AC-4)
const TIMEOUT_MS = 2500; // hard bound on the Stop hook (AC-7)
const MAX_BODY = 1_000_000; // 1 MB response ceiling (EC-11)
const MAX_LOCAL = 1_000_000; // 1 MB local state/settings ceiling (EC-11)
const MAX_VERSION = 128; // version string ceiling (EC-11)

// `\d{1,9}` bounds the numeric cores; the pre-release/build tails are bounded at
// 64 chars each, so a hostile 300-char or unicode "version" fails fast (EC-11).
const SEMVER_RE =
  /^(\d{1,9})\.(\d{1,9})\.(\d{1,9})(?:-([0-9A-Za-z.-]{1,64}))?(?:\+[0-9A-Za-z.-]{1,64})?$/;

// ---------- primitives ----------

function warn(msg) {
  try {
    process.stderr.write(`check-update: ${msg}\n`);
  } catch {
    /* stderr gone (closed hook pipe) → nothing left to do */
  }
}

/** Read a small local JSON file. Returns null on any fault (missing, oversized,
 *  unreadable, unparseable) — callers treat null as "absent". */
function readJson(path) {
  try {
    if (!existsSync(path)) return null;
    const st = statSync(path);
    if (!st.isFile() || st.size > MAX_LOCAL) return null; // EC-11
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null; // EC-3 / EC-4: corrupt or unreadable → treated as absent
  }
}

/** tmp+rename so a concurrent Stop can never observe a torn file (EC-2). */
function writeJsonAtomic(path, value) {
  const tmp = `${path}.${process.pid}.tmp`;
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(tmp, JSON.stringify(value) + "\n", "utf8");
    renameSync(tmp, path);
    return true;
  } catch (e) {
    warn(`state write failed (${(e && e.code) || "EIO"})`);
    return false;
  }
}

// ---------- semver (AC-13, EC-6) ----------

export function parseSemver(input) {
  if (typeof input !== "string" || input.length === 0 || input.length > MAX_VERSION) return null;
  const m = SEMVER_RE.exec(input);
  if (!m) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    prerelease: m[4] === undefined ? null : m[4].split("."),
  };
}

function cmpNum(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function cmpPrerelease(a, b) {
  if (a === null && b === null) return 0;
  if (a === null) return 1; // a release outranks a prerelease
  if (b === null) return -1;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i];
    const y = b[i];
    if (x === undefined) return -1; // shorter identifier set is lower
    if (y === undefined) return 1;
    const xNum = /^\d+$/.test(x);
    const yNum = /^\d+$/.test(y);
    if (xNum && yNum) {
      const c = cmpNum(Number(x), Number(y));
      if (c !== 0) return c;
    } else if (xNum !== yNum) {
      return xNum ? -1 : 1; // numeric identifiers rank below alphanumerics
    } else if (x !== y) {
      return x < y ? -1 : 1; // ASCII ordering
    }
  }
  return 0;
}

/** -1 | 0 | 1, semver precedence. Build metadata is ignored (already stripped). */
export function compareSemver(a, b) {
  let c = cmpNum(a.major, b.major);
  if (c !== 0) return c;
  c = cmpNum(a.minor, b.minor);
  if (c !== 0) return c;
  c = cmpNum(a.patch, b.patch);
  if (c !== 0) return c;
  return cmpPrerelease(a.prerelease, b.prerelease);
}

// ---------- results ----------

function outcome(action, reason, installed, latest, notified) {
  return {
    schema: SCHEMA,
    action,
    reason,
    installed: installed ?? null,
    latest: latest ?? null,
    notified: Boolean(notified),
  };
}

export function noticeLine(installed, latest) {
  return `skailr-agents: update available — installed ${installed}, latest ${latest}. Re-run the installer to upgrade: npx skailr-agents@latest .`;
}

function registryUrl() {
  const override = process.env.SKAILR_UPDATE_REGISTRY; // T-005 test seam only
  const base = typeof override === "string" && override.trim() ? override.trim() : DEFAULT_REGISTRY;
  return `${base.replace(/\/+$/, "")}/${PACKAGE}/latest`;
}

/**
 * Read a response body with a running byte counter, giving up the moment it
 * passes `max`. `await res.text()` buffers the WHOLE body before any ceiling can
 * be applied, and `content-length` is absent on a chunked response — so a
 * hostile endpoint streaming an endless body was buffered to hundreds of MB of
 * RSS before the 2.5 s abort ended it (measured: 1 254 MB in, 843 MB peak RSS).
 * The outcome was already correct (`bad-response`, exit 0); only the cost was
 * not. This changes the buffering strategy and nothing else: over-ceiling still
 * returns null → the caller's `bad-response`, same as the old length test.
 *
 * Returns the decoded body, or null for "over the ceiling" / no readable body.
 * Counting is in BYTES (the old test counted UTF-16 chars) — stricter for
 * multibyte input, which is the direction the ceiling exists to bound.
 */
async function readBodyBounded(res, max) {
  const reader = res.body && typeof res.body.getReader === "function" ? res.body.getReader() : null;
  if (!reader) return null; // 204/HEAD/consumed — JSON.parse("") would have failed anyway
  let chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) {
        chunks = null; // drop what we hold BEFORE awaiting anything else
        try {
          await reader.cancel(); // stop the sender; the socket is torn down
        } catch {
          /* already errored/closed — nothing to cancel */
        }
        return null;
      }
      chunks.push(value);
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* cancelled readers release themselves */
    }
  }
  return Buffer.concat(chunks).toString("utf8");
}

// ---------- check mode ----------

/**
 * Steps are numbered to the spec's ordered algorithm. Returns an outcome object;
 * printing is the caller's job so --json and human mode share one code path.
 */
async function runCheck(target) {
  // 1. enabled gate — before ANY state read or network activity (AC-3, EC-9:
  //    settings are re-read from disk on every invocation, never cached).
  const settings = readJson(join(target, SETTINGS));
  if (
    settings &&
    settings.autoUpdate !== null &&
    typeof settings.autoUpdate === "object" &&
    !Array.isArray(settings.autoUpdate) &&
    settings.autoUpdate.enabled === false
  ) {
    return outcome("skipped", "disabled", null, null, false); // EC-4: anything else → enabled
  }

  // 2. installed marker (EC-1: absent/invalid → silent skip, no state write).
  const marker = readJson(join(target, STATE_DIR, MARKER_FILE));
  const installedRaw = marker && typeof marker.version === "string" ? marker.version : null;
  const installed = parseSemver(installedRaw);
  if (!installed) return outcome("skipped", "no-marker", null, null, false);

  // 3. cadence gate — measured from the last ATTEMPT (AC-4, EC-3).
  const checkPath = join(target, STATE_DIR, CHECK_FILE);
  const state = readJson(checkPath);
  const lastAt = state && typeof state.lastCheckAt === "string" ? Date.parse(state.lastCheckAt) : NaN;
  const due = !Number.isFinite(lastAt) || Date.now() - lastAt >= CADENCE_MS;
  if (!due) return outcome("skipped", "not-due", installedRaw, null, false);

  // 4. consume the window BEFORE the request (AC-6, EC-5). A failed write is
  //    swallowed: worst case the next Stop re-checks.
  const lastLatest = state && typeof state.lastLatest === "string" ? state.lastLatest : null;
  writeJsonAtomic(checkPath, {
    schema: SCHEMA,
    lastCheckAt: new Date().toISOString(),
    lastLatest,
  });

  // 5. the one network call: unauthenticated, header-minimal, hard-timeout (AC-7, AC-8).
  let res;
  try {
    res = await fetch(registryUrl(), {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return outcome("checked", "network-error", installedRaw, null, false); // AC-6
  }

  // 6. bounded response consumption (EC-7, EC-11) — STREAMED, so the ceiling is
  //    enforced while the bytes arrive, not after they are all in memory.
  let body;
  try {
    if (!res.ok) return outcome("checked", "bad-response", installedRaw, null, false);
    const len = Number(res.headers.get("content-length"));
    if (Number.isFinite(len) && len > MAX_BODY) {
      return outcome("checked", "bad-response", installedRaw, null, false);
    }
    const text = await readBodyBounded(res, MAX_BODY);
    if (text === null) return outcome("checked", "bad-response", installedRaw, null, false);
    body = JSON.parse(text);
  } catch {
    return outcome("checked", "bad-response", installedRaw, null, false);
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return outcome("checked", "bad-response", installedRaw, null, false);
  }
  if (typeof body.version !== "string" || body.version.length > MAX_VERSION) {
    return outcome("checked", "bad-response", installedRaw, null, false);
  }

  // 7. parse the registry version (EC-7, EC-11).
  const latestRaw = body.version;
  const latest = parseSemver(latestRaw);
  if (!latest) return outcome("checked", "bad-version", installedRaw, null, false);

  // 9. record the latest we resolved (step 8's comparison never gates this write).
  writeJsonAtomic(checkPath, {
    schema: SCHEMA,
    lastCheckAt: new Date().toISOString(),
    lastLatest: latestRaw,
  });

  // 8. strictly-greater only (EC-6).
  if (compareSemver(latest, installed) <= 0) {
    return outcome("checked", "up-to-date", installedRaw, latestRaw, false);
  }

  // 10. notify (AC-1, AC-2, AC-5) — no suppression state, the cadence is the throttle.
  return outcome("notified", "update-available", installedRaw, latestRaw, true);
}

// ---------- --record-install mode ----------

/** Pack version comes from the PACK's package.json, resolved relative to THIS
 *  file — the installer invokes us from $SCRIPT_DIR, never from $TARGET. */
function packVersion() {
  try {
    const pkg = readJson(resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "package.json"));
    if (!pkg || typeof pkg.version !== "string") return null;
    return parseSemver(pkg.version) ? pkg.version : null;
  } catch {
    return null;
  }
}

function runRecordInstall(target) {
  const version = packVersion();
  if (!version) return outcome("skipped", "no-pack-version", null, null, false);
  const ok = writeJsonAtomic(join(target, STATE_DIR, MARKER_FILE), {
    schema: MARKER_SCHEMA,
    version,
    installedAt: new Date().toISOString(),
  });
  if (!ok) return outcome("skipped", "write-error", null, null, false);
  return outcome("recorded", "recorded", version, null, false);
}

// ---------- CLI ----------

const USAGE = [
  "usage: node scripts/skailr/check-update.mjs [--target <dir>] [--json]",
  "       node scripts/skailr/check-update.mjs --record-install --target <dir> [--json]",
].join("\n");

function parseArgv(argv) {
  const opts = { target: "", recordInstall: false, json: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") opts.json = true;
    else if (a === "--record-install") opts.recordInstall = true;
    else if (a === "--target") opts.target = argv[++i] ?? "";
    else if (a === "--help" || a === "-h") opts.help = true;
    else return { opts, bad: a };
  }
  return { opts, bad: null };
}

async function main(argv) {
  const { opts, bad } = parseArgv(argv);
  // Usage faults never take the exit code with them (Stop hook call site).
  if (opts.help) {
    process.stdout.write(USAGE + "\n");
    return;
  }
  if (bad) {
    warn(`unknown flag "${bad}"\n${USAGE}`);
    return;
  }
  if (opts.recordInstall && !opts.target) {
    warn(`--target is required with --record-install\n${USAGE}`);
    return;
  }

  const target = opts.target
    ? isAbsolute(opts.target)
      ? opts.target
      : resolve(process.cwd(), opts.target)
    : process.cwd();

  const result = opts.recordInstall ? runRecordInstall(target) : await runCheck(target);

  if (opts.json) {
    process.stdout.write(JSON.stringify(result) + "\n");
    return;
  }
  if (result.notified) process.stdout.write(noticeLine(result.installed, result.latest) + "\n");
  else if (result.action === "recorded") {
    process.stdout.write(`  + .skailr/installed-version.json (${result.installed})\n`);
  }
  // every other outcome is silent on stdout
}

// Only run the CLI when invoked directly, so the smoke harness can import the
// semver helpers and the notice builder.
/**
 * Force the process down once main() settles (AC-7). `process.exitCode = 0`
 * alone only sets the eventual code — it does not end the process, so an
 * aborted fetch on a packet-dropping network (SYN black-holed) left undici's
 * pending connect socket on the event loop until its own ~10s connect timeout
 * and the Stop hook blocked ~10.6s despite TIMEOUT_MS=2500 (F-1).
 *
 * Flush first: on macOS a PIPED stdout (exactly the Stop-hook call site) is
 * asynchronous, so an unconditional process.exit() can truncate the notice.
 * Everything main() emits is already queued by the time we get here, and stream
 * write callbacks are ordered, so a zero-length trailing write fires only after
 * the earlier bytes reach the fd. The timer is the backstop for a stdout that
 * never drains (full pipe, reader gone) — it cannot extend the hook past
 * TIMEOUT_MS + FLUSH_MS.
 */
const FLUSH_MS = 250;

function exitNow() {
  process.exitCode = 0; // ALWAYS 0
  let done = false;
  const bye = () => {
    if (done) return;
    done = true;
    process.exit(0);
  };
  try {
    if (process.stdout.writableLength === 0) return bye();
    const bail = setTimeout(bye, FLUSH_MS);
    process.stdout.write("", () => {
      clearTimeout(bail);
      bye();
    });
  } catch {
    bye(); // stdout gone (closed hook pipe) → nothing left to flush
  }
}

if (process.argv[1] && process.argv[1].endsWith("check-update.mjs")) {
  main(process.argv.slice(2))
    .catch((e) => {
      warn(`unexpected: ${(e && e.message) || e}`); // final backstop — never throws out
    })
    .finally(exitNow);
}
