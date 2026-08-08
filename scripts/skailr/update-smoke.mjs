#!/usr/bin/env node
/**
 * update-smoke.mjs — hermetic executable proof for check-update.mjs and the two
 * autoUpdate migrations (AC-1..AC-11, AC-13, EC-1..EC-9, EC-11 + the CLI contract).
 *
 * HERMETIC BY CONSTRUCTION — this suite makes NO real network call:
 *   - the registry is a local `node:http` server on 127.0.0.1, reached through the
 *     `SKAILR_UPDATE_REGISTRY` seam that check-update.mjs honours;
 *   - the unreachable/failure cases point at a 127.0.0.1 port we bound and then
 *     closed, so the connection is refused locally with no DNS and no egress;
 *   - the default `https://registry.npmjs.org` URL is never exercised here (it is
 *     covered by the one-off live smoke recorded in T-001's report).
 * The suite therefore passes with all egress blocked. Every case builds its own
 * `mkdtemp` fixture (never this repo's real `.claude/`), and all fixtures are
 * removed on exit, including on failure.
 *
 * Check-mode cases spawn check-update.mjs as a child process exactly the way the
 * Stop hook does; migration cases import `MIGRATIONS`/`runMigration` directly
 * (migrate.mjs guards its CLI behind an `endsWith("migrate.mjs")` check).
 *
 * Exit 0 on all-pass; non-zero with a clear message on the first failure.
 * This is a test runner, not a hook — a failure MUST be loud.
 */
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { MIGRATIONS, runMigration } from "./migrate.mjs";

const execFileAsync = promisify(execFile);

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const CLI = join(HERE, "check-update.mjs");
const REL = ".claude/settings.skailr.json";
const STATE = ".skailr/update-check.json";
const MARKER = ".skailr/installed-version.json";
const DAY = 86_400_000;

// ---------- harness ----------

let passed = 0;
const DIRS = [];

function cleanup() {
  for (const d of DIRS) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      /* best effort — scratch dirs only */
    }
  }
  DIRS.length = 0;
}
process.on("exit", cleanup);

function fail(name, msg) {
  console.error(`SMOKE FAIL [${name}]: ${msg}`);
  try {
    server.closeAllConnections?.();
    server.close();
  } catch {
    /* ignore */
  }
  process.exit(1);
}
function ok(name) {
  passed++;
  console.log(`  ok  ${name}`);
}
function skip(name, why) {
  console.log(`  --  ${name} (skipped: ${why})`);
}
function assert(cond, name, msg) {
  if (!cond) fail(name, msg);
}

// ---------- local registry stub (the ONLY "network" in this suite) ----------

let hits = 0;
let lastReq = null;
let handler = () => {};
const hanging = new Set();

const server = createServer((req, res) => {
  hits++;
  lastReq = { url: req.url, method: req.method, headers: { ...req.headers } };
  handler(req, res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const REGISTRY = `http://127.0.0.1:${server.address().port}`;

/** A 127.0.0.1 port we bound and immediately released: connection-refused, no egress. */
const DEAD = await (async () => {
  const s = createServer(() => {});
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const port = s.address().port;
  await new Promise((r) => s.close(r));
  return `http://127.0.0.1:${port}`;
})();

function serveVersion(version) {
  handler = (_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ version, name: "skailr-agents", dist: { tarball: "x" } }));
  };
}
function serveRaw(status, body, headers = { "content-type": "application/json" }) {
  handler = (_req, res) => {
    res.writeHead(status, headers);
    res.end(body);
  };
}
function serveHang() {
  handler = (_req, res) => {
    hanging.add(res); // never responds → exercises AbortSignal.timeout(2500)
  };
}
/**
 * Chunked body with NO content-length that keeps writing until the client tears
 * the socket down (N-2 regression): proves the 1 MB ceiling is applied while the
 * bytes arrive, not after the whole body is buffered. `capBytes` guarantees the
 * handler terminates even if the client never disconnects.
 */
function serveFlood(chunkBytes = 256 * 1024, capBytes = 64 * 1024 * 1024) {
  handler = (_req, res) => {
    res.writeHead(200, { "content-type": "application/json" }); // no content-length ⇒ chunked
    const chunk = "x".repeat(chunkBytes);
    let sent = 0;
    let stopped = false;
    const stop = () => {
      stopped = true;
    };
    res.on("close", stop);
    res.on("error", stop);
    const pump = () => {
      while (!stopped && sent < capBytes) {
        sent += chunkBytes;
        if (!res.write(chunk)) return void res.once("drain", pump);
      }
      try {
        res.end();
      } catch {
        /* socket already gone */
      }
    };
    pump();
  };
}
function serveNever() {
  handler = () => fail("harness", "registry was contacted in a no-network case");
}
serveNever();

// ---------- fixtures ----------

const BASE_HOOKS = () => ({
  Stop: [
    {
      matcher: "",
      hooks: [
        { type: "command", command: "node scripts/skailr/validate-channels.mjs --tmp 2>/dev/null || true" },
        { type: "command", command: "node scripts/skailr/check-experts.mjs 2>/dev/null || true" },
      ],
    },
  ],
});

const settingsFixture = (autoUpdate, hooks = BASE_HOOKS()) =>
  JSON.stringify(
    {
      "//autoUpdate": "install.sh copies this file only if absent",
      ...(autoUpdate === undefined ? {} : { autoUpdate }),
      telemetry: { enabled: true },
      hooks,
    },
    null,
    2
  ) + "\n";

function write(dir, rel, body) {
  const p = join(dir, ...rel.split("/"));
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, typeof body === "string" ? body : JSON.stringify(body, null, 2) + "\n", "utf8");
  return p;
}

/**
 * Fresh scratch target.
 *   settings: string | object | undefined (undefined ⇒ file absent)
 *   marker:   semver string | raw string | undefined
 *   state:    { ageMs, lastLatest } | raw string | undefined
 */
function seed(opts = {}) {
  // `in` checks, not destructuring defaults: passing `{ marker: undefined }` must
  // mean "no marker file", not "fall back to the default marker".
  const settings = "settings" in opts ? opts.settings : settingsFixture({ enabled: true });
  const marker = "marker" in opts ? opts.marker : "1.0.0";
  const state = "state" in opts ? opts.state : undefined;
  const dir = mkdtempSync(join(tmpdir(), "skailr-update-"));
  DIRS.push(dir);
  mkdirSync(join(dir, ".claude"), { recursive: true });
  if (settings !== undefined) write(dir, REL, settings);
  if (marker !== undefined) {
    write(
      dir,
      MARKER,
      typeof marker === "string" && !marker.trim().startsWith("{")
        ? { schema: "skailr.installed-version/v1", version: marker, installedAt: "2026-01-01T00:00:00.000Z" }
        : marker
    );
  }
  if (state !== undefined) {
    write(
      dir,
      STATE,
      typeof state === "string"
        ? state
        : {
            schema: "skailr.update-check/v1",
            lastCheckAt: new Date(Date.now() - (state.ageMs ?? 0)).toISOString(),
            lastLatest: state.lastLatest ?? null,
          }
    );
  }
  return dir;
}

function readAt(dir, rel) {
  const p = join(dir, ...rel.split("/"));
  return existsSync(p) ? readFileSync(p) : null;
}
function jsonAt(dir, rel) {
  const b = readAt(dir, rel);
  return b === null ? null : JSON.parse(b.toString("utf8"));
}
function stateDir(dir) {
  const p = join(dir, ".skailr");
  return existsSync(p) ? readdirSync(p).sort() : [];
}

/** sha256 over sorted (relative path, bytes) pairs — proves "byte-for-byte unchanged". */
function hashTree(root) {
  const h = createHash("sha256");
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) {
        h.update(relative(root, p).replace(/\\/g, "/"));
        h.update(readFileSync(p));
        h.update(String(statSync(p).size));
      }
    }
  };
  if (existsSync(root)) walk(root);
  return h.digest("hex");
}

/** Spawn check-update.mjs the way the Stop hook does (cwd = target, so a stray
 *  relative write would land in the scratch dir and be caught, never in the repo). */
async function check(dir, { json = true, registry = REGISTRY, args = [] } = {}) {
  const argv = [CLI, "--target", dir, ...args];
  if (json) argv.push("--json");
  const env = { ...process.env, SKAILR_UPDATE_REGISTRY: registry };
  let out = "";
  let err = "";
  let code = 0;
  try {
    const r = await execFileAsync("node", argv, { cwd: dir, env, encoding: "utf8" });
    out = r.stdout;
    err = r.stderr;
  } catch (e) {
    code = e.code ?? -1;
    out = e.stdout ?? "";
    err = e.stderr ?? "";
  }
  if (!json) return { code, out, err, result: null };
  let result = null;
  if (out.trim()) {
    try {
      result = JSON.parse(out);
    } catch {
      fail("harness", `--json output was not JSON: ${JSON.stringify(out)} / ${err}`);
    }
  }
  return { code, out, err, result };
}

// ===========================================================================
// AC-3 / EC-9 — opt-out is honoured before ANY state read or network activity
// ===========================================================================
{
  const n = "AC-3/EC-9 autoUpdate.enabled:false → no network, no state, no notice";
  serveNever();
  const dir = seed({ settings: settingsFixture({ enabled: false }) });
  const before = hits;
  const { code, result } = await check(dir);
  assert(code === 0, n, `exit ${code}`);
  assert(result.action === "skipped" && result.reason === "disabled", n, JSON.stringify(result));
  assert(result.notified === false, n, "notified true while disabled");
  assert(hits === before, n, `registry was contacted ${hits - before}×`);
  assert(readAt(dir, STATE) === null, n, "update-check.json was written while disabled");
  assert(stateDir(dir).join(",") === "installed-version.json", n, `.skailr = ${stateDir(dir)}`);
  const human = await check(dir, { json: false });
  assert(human.out === "", n, `stdout not silent: ${JSON.stringify(human.out)}`);
  // EC-9: the gate is re-read from disk every invocation — flip it and the same
  // fixture starts checking, with no process-level cache in between.
  serveVersion("9.9.9");
  write(dir, REL, settingsFixture({ enabled: true }));
  const flipped = await check(dir);
  assert(flipped.result.notified === true, n, `re-read failed: ${JSON.stringify(flipped.result)}`);
  ok(n);
}

// EC-4 — anything that is not an explicit `false` means enabled
for (const [label, settings] of [
  ["missing file", undefined],
  ["no autoUpdate key", settingsFixture(undefined)],
  ["autoUpdate: 7", settingsFixture(7)],
  ['autoUpdate: "yes"', settingsFixture("yes")],
  ["autoUpdate: null", settingsFixture(null)],
  ['enabled: "false" (string)', settingsFixture({ enabled: "false" })],
  ["unparseable JSON", '{ "autoUpdate": \n'],
  ["root is an array", "[1,2,3]\n"],
]) {
  const n = `EC-4 ${label} → treated as enabled`;
  serveVersion("2.0.0");
  const dir = seed({ settings });
  const { code, result } = await check(dir);
  assert(code === 0, n, `exit ${code}`);
  assert(result.reason !== "disabled", n, `opted out by accident: ${JSON.stringify(result)}`);
  assert(result.action === "notified" && result.notified === true, n, JSON.stringify(result));
  ok(n);
}

// ===========================================================================
// EC-1 — no usable installed marker → silent skip, no state write, no network
// ===========================================================================
for (const [label, marker] of [
  ["absent", undefined],
  ["unparseable", '{"version":\n'],
  ["version missing", { schema: "skailr.installed-version/v1" }],
  ["version not semver", "banana"],
  ["version numeric", { schema: "skailr.installed-version/v1", version: 113 }],
]) {
  const n = `EC-1 marker ${label} → no-marker, no write, no fetch`;
  serveNever();
  const dir = seed({ marker });
  const before = hits;
  const { code, result } = await check(dir);
  assert(code === 0, n, `exit ${code}`);
  assert(result.action === "skipped" && result.reason === "no-marker", n, JSON.stringify(result));
  assert(hits === before, n, "registry contacted without a marker");
  assert(readAt(dir, STATE) === null, n, "state written without a marker");
  ok(n);
}

// ===========================================================================
// AC-4 / EC-5 — 24h cadence, measured from the last ATTEMPT
// ===========================================================================
{
  const n = "AC-4 fresh stamp → not-due, zero fetches, state byte-identical";
  serveNever();
  const dir = seed({ state: { ageMs: 60_000, lastLatest: "1.0.0" } });
  const before = { hits, bytes: readAt(dir, STATE) };
  const { code, result } = await check(dir);
  assert(code === 0, n, `exit ${code}`);
  assert(result.action === "skipped" && result.reason === "not-due", n, JSON.stringify(result));
  assert(hits === before.hits, n, "fetched inside the cadence window");
  assert(before.bytes.equals(readAt(dir, STATE)), n, "state rewritten inside the window");
  const human = await check(dir, { json: false });
  assert(human.out === "", n, `reprinted inside the window: ${JSON.stringify(human.out)}`);
  ok(n);
}
{
  const n = "AC-4 stamp just under 24h → still not due; at/over 24h → due";
  serveVersion("2.0.0");
  const near = seed({ state: { ageMs: DAY - 60_000 } });
  const r1 = await check(near);
  assert(r1.result.reason === "not-due", n, JSON.stringify(r1.result));
  const old = seed({ state: { ageMs: 25 * 3600_000 } });
  const before = hits;
  const r2 = await check(old);
  assert(r2.result.action === "notified", n, JSON.stringify(r2.result));
  assert(hits === before + 1, n, `expected exactly 1 fetch, got ${hits - before}`);
  ok(n);
}
{
  const n = "AC-4/EC-3 corrupt or stampless state → treated as due, no crash";
  for (const raw of ['{"schema":"skailr.update-check/v1"\n', "not json at all", "[]\n", '{"lastCheckAt":"nope"}']) {
    serveVersion("2.0.0");
    const dir = seed({ state: raw });
    const { code, result } = await check(dir);
    assert(code === 0, n, `exit ${code} on ${JSON.stringify(raw)}`);
    assert(result.action === "notified", n, `${JSON.stringify(raw)} → ${JSON.stringify(result)}`);
    const after = jsonAt(dir, STATE);
    assert(after && after.schema === "skailr.update-check/v1", n, "state not repaired to a valid file");
  }
  ok(n);
}

// ===========================================================================
// AC-6 / EC-5 — every failure mode is swallowed AND still consumes the window
// ===========================================================================
{
  const n = "AC-6 connection refused → swallowed, exit 0, cadence consumed";
  const dir = seed({ state: { ageMs: 2 * DAY } });
  const { code, out, result } = await check(dir, { registry: DEAD });
  assert(code === 0, n, `exit ${code}`);
  assert(result.action === "checked" && result.reason === "network-error", n, JSON.stringify(result));
  assert(result.notified === false, n, "notified on a network error");
  const stamp = jsonAt(dir, STATE);
  assert(stamp && Date.now() - Date.parse(stamp.lastCheckAt) < DAY, n, "attempt not stamped");
  const human = await check(dir, { json: false, registry: DEAD });
  assert(human.out === "", n, `stdout not silent: ${JSON.stringify(human.out)}`);
  assert(human.code === 0, n, `human-mode exit ${human.code}`);
  ok(n);
}
{
  const n = "AC-6 a failed attempt still throttles the next Stop (attempt-keyed)";
  const dir = seed({ state: { ageMs: 2 * DAY } });
  const first = await check(dir, { registry: DEAD });
  assert(first.result.reason === "network-error", n, JSON.stringify(first.result));
  serveNever();
  const second = await check(dir); // real stub now — must not be reached
  assert(second.result.reason === "not-due", n, `window not consumed: ${JSON.stringify(second.result)}`);
  ok(n);
}
{
  const n = "AC-7/AC-6 hung registry → aborts at ~2.5s with network-error";
  serveHang();
  const dir = seed({ state: { ageMs: 2 * DAY } });
  const t0 = Date.now();
  const { code, result } = await check(dir);
  const ms = Date.now() - t0;
  for (const res of hanging) res.destroy();
  hanging.clear();
  assert(code === 0, n, `exit ${code}`);
  assert(result.reason === "network-error", n, JSON.stringify(result));
  assert(ms < 8000, n, `took ${ms}ms — the 2500ms abort did not fire`);
  ok(n);
}
{
  // N-2 regression. A hung server (above) proves the TIME bound; this proves the
  // MEMORY bound: chunked, no content-length, endless. Pre-fix (`await res.text()`
  // then a length test) this buffered every byte the abort window allowed —
  // measured at 1 254 MB in / 843 MB RSS. Post-fix the reader is cancelled a few
  // chunks past 1 MB, so it returns FAST and holds ~nothing. The wall-clock bound
  // is the observable proxy: buffering to the abort would cost the full 2.5 s.
  const n = "EC-11/N-2 endless chunked body → bad-response without buffering it";
  serveFlood();
  const dir = seed({ state: { ageMs: 2 * DAY } });
  const t0 = Date.now();
  const { code, out, result } = await check(dir);
  const ms = Date.now() - t0;
  assert(code === 0, n, `exit ${code}`);
  assert(result && result.reason === "bad-response", n, JSON.stringify(result));
  assert(result.notified === false, n, `notified on a flood body: ${out}`);
  assert(ms < 2000, n, `took ${ms}ms — the body was buffered to the abort, not bounded on arrival`);
  assert(jsonAt(dir, STATE).lastCheckAt, n, "cadence stamp missing after a flood response");
  serveNever();
  ok(n);
}
{
  // N-1 regression for F-1 (`exitNow()`), OPT-IN and NON-HERMETIC — it needs a
  // target that black-holes the SYN (packets dropped, no RST), which no local
  // socket can emulate: connection-refused and accept-then-silence both leave the
  // event loop clean, and only a pending connect socket kept the hook alive ~10.6s.
  //   SKAILR_SMOKE_BLACKHOLE=10.255.255.1:81 node scripts/skailr/update-smoke.mjs
  // Skipped (and the suite stays hermetic + fast) when the var is unset.
  const n = "AC-7/F-1 SYN-black-holed registry → hook still ends at ~TIMEOUT_MS";
  const bh = (process.env.SKAILR_SMOKE_BLACKHOLE || "").trim();
  if (!bh) {
    skip(n, "set SKAILR_SMOKE_BLACKHOLE=10.255.255.1:81 to run (non-hermetic)");
  } else {
    const BUDGET_MS = 2500 + 250 + 2000; // TIMEOUT_MS + FLUSH_MS + spawn/CI slack
    const dir = seed({ state: { ageMs: 2 * DAY } });
    const t0 = Date.now();
    const { code, result } = await check(dir, { registry: `http://${bh}` });
    const ms = Date.now() - t0;
    assert(code === 0, n, `exit ${code}`);
    assert(result && result.reason === "network-error", n, JSON.stringify(result));
    assert(ms < BUDGET_MS, n, `took ${ms}ms (budget ${BUDGET_MS}ms) — exitNow() regressed; undici's ~10s connect timeout is holding the event loop`);
    ok(`${n} [${ms}ms]`);
  }
}

// EC-7 / EC-11 — hostile or malformed registry responses
for (const [label, status, body, reason, headers] of [
  ["html error page", 200, "<html>nope</html>", "bad-response"],
  ["empty body", 200, "", "bad-response"],
  ["truncated JSON", 200, '{"version":"1.', "bad-response"],
  ["array root", 200, "[1,2,3]", "bad-response"],
  ["no version field", 200, '{"name":"skailr-agents"}', "bad-response"],
  ["version not a string", 200, '{"version":113}', "bad-response"],
  ["HTTP 500", 500, '{"version":"9.9.9"}', "bad-response"],
  ["HTTP 404", 404, "not found", "bad-response"],
  ["300-char version", 200, JSON.stringify({ version: "9".repeat(300) }), "bad-response"],
  ["2 MB body", 200, JSON.stringify({ version: "9.9.9", pad: "x".repeat(2_000_000) }), "bad-response"],
  ["version banana", 200, '{"version":"banana"}', "bad-version"],
  ["version v1.2.3", 200, '{"version":"v1.2.3"}', "bad-version"],
  ["version 1.2", 200, '{"version":"1.2"}', "bad-version"],
  ["unicode digits", 200, '{"version":"١.٢.٣"}', "bad-version"],
]) {
  const n = `EC-7/EC-11 ${label} → ${reason}, no notice, exit 0`;
  serveRaw(status, body, headers);
  const dir = seed({ state: { ageMs: 2 * DAY } });
  const { code, result } = await check(dir);
  assert(code === 0, n, `exit ${code}`);
  assert(result.action === "checked" && result.reason === reason, n, JSON.stringify(result));
  assert(result.notified === false, n, "notified on a bad response");
  const human = await check(seed({ state: { ageMs: 2 * DAY } }), { json: false });
  assert(human.out === "", n, `stdout not silent: ${JSON.stringify(human.out)}`);
  ok(n);
}

// ===========================================================================
// AC-1 / AC-2 / AC-5 / AC-8 — the notice, its exact text, and the request shape
// ===========================================================================
{
  const n = "AC-1/AC-2 exact one-line notice on stdout";
  serveVersion("1.13.0");
  const dir = seed({ marker: "1.12.1" });
  const { code, out, err } = await check(dir, { json: false });
  const want =
    "skailr-agents: update available — installed 1.12.1, latest 1.13.0. " +
    "Re-run the installer to upgrade: npx skailr-agents@latest .\n";
  assert(code === 0, n, `exit ${code}`);
  assert(out === want, n, `stdout was ${JSON.stringify(out)} (stderr: ${err})`);
  assert(out.trimEnd().split("\n").length === 1, n, "notice is not exactly one line");
  ok(n);
}
{
  const n = "AC-8 request is a bare unauthenticated GET of /skailr-agents/latest";
  serveVersion("1.13.0");
  const dir = seed({ marker: "1.12.1" });
  lastReq = null;
  await check(dir);
  assert(lastReq !== null, n, "no request observed");
  assert(lastReq.method === "GET", n, `method ${lastReq.method}`);
  assert(lastReq.url === "/skailr-agents/latest", n, `url ${lastReq.url}`);
  assert(lastReq.headers.accept === "application/json", n, `accept ${lastReq.headers.accept}`);
  for (const banned of ["authorization", "cookie", "x-npm-session", "npm-auth-type"]) {
    assert(!(banned in lastReq.headers), n, `sent a ${banned} header`);
  }
  ok(n);
}
{
  const n = "AC-5 no suppression state — a due check notifies again";
  serveVersion("1.13.0");
  const dir = seed({ marker: "1.12.1" });
  const first = await check(dir, { json: false });
  assert(first.out.startsWith("skailr-agents: update available"), n, "first run did not notify");
  write(dir, STATE, {
    schema: "skailr.update-check/v1",
    lastCheckAt: new Date(Date.now() - 2 * DAY).toISOString(),
    lastLatest: "1.13.0",
  });
  const second = await check(dir, { json: false });
  assert(second.out === first.out, n, `second due check was suppressed: ${JSON.stringify(second.out)}`);
  ok(n);
}

// AC-13 / EC-6 — semver ordering, notice only on strictly greater
for (const [installed, latest, notify] of [
  ["1.13.0", "1.13.0", false],
  ["1.13.0", "1.12.9", false],
  ["1.13.0", "0.9.9", false],
  ["1.13.0", "1.13.0-rc.1", false],
  ["1.13.0-rc.1", "1.13.0", true],
  ["1.13.0-rc.1", "1.13.0-rc.2", true],
  ["1.9.0", "1.10.0", true], // string compare would get this wrong
  ["1.13.0", "1.13.1", true],
  ["1.13.0", "2.0.0", true],
  ["1.13.0+build.7", "1.13.0", false], // build metadata is not precedence
]) {
  const n = `AC-13/EC-6 installed ${installed} vs latest ${latest} → ${notify ? "notice" : "silent"}`;
  serveVersion(latest);
  const dir = seed({ marker: installed });
  const { result } = await check(dir);
  assert(result.notified === notify, n, JSON.stringify(result));
  assert(
    result.reason === (notify ? "update-available" : "up-to-date"),
    n,
    `reason ${result.reason}`
  );
  assert(result.installed === installed && result.latest === latest, n, JSON.stringify(result));
  ok(n);
}

// ===========================================================================
// EC-2 / EC-8 — atomic state writes, everything confined to <target>/.skailr/
// ===========================================================================
{
  const n = "EC-2 stale .tmp leftover + repeat runs → valid, never torn";
  serveVersion("2.0.0");
  const dir = seed({ marker: "1.0.0" });
  write(dir, `${STATE}.999999.tmp`, "{ torn");
  for (let i = 0; i < 3; i++) {
    write(dir, STATE, {
      schema: "skailr.update-check/v1",
      lastCheckAt: new Date(Date.now() - 2 * DAY).toISOString(),
      lastLatest: null,
    });
    const { code } = await check(dir);
    assert(code === 0, n, `exit ${code} on pass ${i}`);
    const st = jsonAt(dir, STATE);
    assert(st && st.schema === "skailr.update-check/v1", n, `pass ${i}: bad state file`);
    assert(st.lastLatest === "2.0.0", n, `pass ${i}: lastLatest ${st.lastLatest}`);
    assert(typeof st.lastCheckAt === "string" && !Number.isNaN(Date.parse(st.lastCheckAt)), n, "bad stamp");
  }
  ok(n);
}
{
  const n = "EC-8 every write lands under <target>/.skailr/ and nowhere else";
  serveVersion("2.0.0");
  const dir = seed({ marker: "1.0.0" });
  const claudeBefore = hashTree(join(dir, ".claude"));
  await check(dir);
  assert(hashTree(join(dir, ".claude")) === claudeBefore, n, ".claude/ was modified");
  const files = stateDir(dir).filter((f) => !f.endsWith(".tmp"));
  assert(files.join(",") === "installed-version.json,update-check.json", n, `.skailr = ${files}`);
  assert(stateDir(dir).every((f) => !f.endsWith(".tmp")), n, "a .tmp file survived the rename");
  ok(n);
}

// ===========================================================================
// AC-9 / AC-10 — a notify run touches no pack-owned path, reads no experts dir
// ===========================================================================
{
  const n = "AC-9/AC-10 pack-owned paths byte-for-byte unchanged across a notify run";
  serveVersion("9.9.9");
  const dir = seed({ marker: "1.0.0" });
  // A miniature pack layout inside the scratch target: if the check ever wrote or
  // rewrote a pack-owned path relative to the target, the hash would move.
  write(dir, "CLAUDE.md", "# pack\n");
  write(dir, ".claude/agents/data.md", "agent\n");
  write(dir, ".claude/commands/yolo.md", "command\n");
  write(dir, ".claude/skills/fit-test/SKILL.md", "skill\n");
  write(dir, ".claude/experts/registry.md", "| slug |\n");
  write(dir, ".claude/experts/profiles/x.md", "profile\n");
  write(dir, "scripts/skailr/doctor.mjs", "// pack script\n");
  const fixtureBefore = hashTreeExcludingState(dir);
  const repoBefore = hashTree(join(ROOT, "scripts", "skailr"));
  const { code, out } = await check(dir, { json: false });
  assert(code === 0, n, `exit ${code}`);
  assert(out.startsWith("skailr-agents: update available"), n, "case did not exercise a notify run");
  assert(hashTreeExcludingState(dir) === fixtureBefore, n, "a pack-owned fixture path changed");
  assert(hashTree(join(ROOT, "scripts", "skailr")) === repoBefore, n, "the real pack scripts/ changed");
  // AC-10: no executable reference to the experts dir anywhere in the source.
  const src = readFileSync(CLI, "utf8");
  const code_ = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert(!/experts/.test(code_), n, "check-update.mjs references .claude/experts outside comments");
  ok(n);
}

/** Hash of the whole target EXCEPT `.skailr/`, which the check legitimately owns. */
function hashTreeExcludingState(dir) {
  const h = createHash("sha256");
  for (const rel of ["CLAUDE.md", ".claude", "scripts"]) {
    const p = join(dir, rel);
    h.update(rel);
    h.update(existsSync(p) && statSync(p).isDirectory() ? hashTree(p) : String(readAt(dir, rel)));
  }
  return h.digest("hex");
}

// ===========================================================================
// CLI contract — exit code is ALWAYS 0, including usage faults
// ===========================================================================
{
  const n = "CLI contract: every invocation exits 0 (Stop hook call site)";
  serveVersion("2.0.0");
  const dir = seed({ marker: "1.0.0" });
  for (const args of [
    ["--bogus"],
    ["--target"],
    ["--record-install"], // missing --target
    ["--help"],
    ["-h"],
  ]) {
    const r = await check(dir, { json: false, args });
    assert(r.code === 0, n, `[${args}] exited ${r.code}`);
  }
  const help = await check(dir, { json: false, args: ["--help"] });
  assert(help.out.includes("usage: node scripts/skailr/check-update.mjs"), n, "no usage text on --help");
  const bogus = await check(dir, { json: false, args: ["--bogus"] });
  assert(bogus.out === "", n, `unknown flag polluted stdout: ${JSON.stringify(bogus.out)}`);
  ok(n);
}
{
  const n = "AC-13 --record-install writes the marker and is re-runnable";
  const dir = seed({ marker: undefined });
  const first = await check(dir, { args: ["--record-install"] });
  assert(first.code === 0, n, `exit ${first.code}`);
  assert(first.result.action === "recorded", n, JSON.stringify(first.result));
  const m1 = jsonAt(dir, MARKER);
  assert(m1.schema === "skailr.installed-version/v1", n, "bad marker schema");
  assert(/^\d+\.\d+\.\d+/.test(m1.version), n, `marker version ${m1.version}`);
  const second = await check(dir, { args: ["--record-install"] });
  assert(second.result.action === "recorded", n, "second record-install failed");
  const m2 = jsonAt(dir, MARKER);
  assert(m2.version === m1.version, n, "marker version drifted between runs");
  assert(stateDir(dir).every((f) => !f.endsWith(".tmp")), n, "leftover .tmp after record-install");
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  assert(m1.version === pkg.version, n, `marker ${m1.version} != pack ${pkg.version}`);
  ok(n);
}

// ===========================================================================
// AC-11 — the two migrations, driven through the exported runner
// ===========================================================================

const migOf = (id) => {
  const m = MIGRATIONS.find((x) => x.id === id);
  if (!m) fail("AC-11 harness", `migration "${id}" is not exported by migrate.mjs`);
  return m;
};
const applyMig = (id, dir, pre = [REL]) => runMigration(migOf(id), dir, pre);
/** Both migrations signal "nothing to do" without writing; the runner maps the
 *  canonical `explicit` reason to status `noop` and every other no-write reason to
 *  `skipped`, so the hook migration's `already-wired` lands on `skipped`. What is
 *  contractual is: no write, and a non-failed status. */
const isNoWrite = (r) => (r.status === "noop" || r.status === "skipped") && r.status !== "failed";
const bytesOf = (dir) => readAt(dir, REL);

{
  const n = "AC-11 migration ids exist, in order, and survive doctor's token filter";
  const ids = MIGRATIONS.map((m) => m.id);
  assert(
    ids.join(",") === "telemetry-enabled-default,autoupdate-enabled-default",
    n,
    `id order is [${ids}]`
  );
  for (const id of ids) assert(/^[a-z][a-z0-9-]*$/.test(id), n, `id "${id}" is not extractor-safe`);
  ok(n);
}

// -- autoupdate-enabled-default ---------------------------------------------
{
  const n = "AC-11 autoUpdate absent → filled true, every sibling key preserved";
  const dir = seed({ settings: settingsFixture(undefined) });
  const r = applyMig("autoupdate-enabled-default", dir);
  assert(r.status === "applied" && r.reason === "autoupdate-absent", n, JSON.stringify(r));
  const after = jsonAt(dir, REL);
  assert(after.autoUpdate.enabled === true, n, "not filled");
  assert(after.telemetry.enabled === true, n, "telemetry lost");
  assert(after["//autoUpdate"], n, "comment key lost");
  assert(JSON.stringify(after.hooks) === JSON.stringify(BASE_HOOKS()), n, "hooks mutated by the scalar fill");
  ok(n);
}
for (const [label, value] of [
  ["explicit false", { enabled: false }],
  ["explicit true", { enabled: true }],
]) {
  const n = `AC-11 ${label} is never overwritten`;
  const dir = seed({ settings: settingsFixture(value) });
  const before = bytesOf(dir);
  const r = applyMig("autoupdate-enabled-default", dir);
  assert(r.status === "noop" && r.reason === "explicit", n, JSON.stringify(r));
  assert(before.equals(bytesOf(dir)), n, "bytes changed");
  assert(jsonAt(dir, REL).autoUpdate.enabled === value.enabled, n, "consumer value replaced");
  ok(n);
}
for (const bad of ['"yes"', "1", "null", "{}", "[]"]) {
  const n = `AC-11 malformed enabled ${bad} → corrected to true`;
  const dir = seed({ settings: settingsFixture({ enabled: JSON.parse(bad) }) });
  const r = applyMig("autoupdate-enabled-default", dir);
  assert(r.status === "applied" && r.reason === "autoupdate-malformed", n, JSON.stringify(r));
  assert(jsonAt(dir, REL).autoUpdate.enabled === true, n, "not corrected");
  ok(n);
}
{
  const n = 'AC-11 empty "autoUpdate": {} container → additive fill, not malformed';
  const dir = seed({ settings: settingsFixture({}) });
  const r = applyMig("autoupdate-enabled-default", dir);
  assert(r.status === "applied" && r.reason === "autoupdate-absent", n, JSON.stringify(r));
  assert(jsonAt(dir, REL).autoUpdate.enabled === true, n, "not filled");
  ok(n);
}
for (const weird of ['"yes"', "7", "null", "[]"]) {
  const n = `AC-11 non-object autoUpdate ${weird} → unsafe no-op, untouched`;
  const dir = seed({ settings: settingsFixture(JSON.parse(weird)) });
  const before = bytesOf(dir);
  const r = applyMig("autoupdate-enabled-default", dir);
  assert(r.status === "skipped" && r.reason === "non-object-container", n, JSON.stringify(r));
  assert(before.equals(bytesOf(dir)), n, "consumer value was replaced");
  ok(n);
}

{
  const n = "AC-11 root not an object → unsafe no-op";
  const dir = seed({ settings: "[1,2,3]\n" });
  const before = bytesOf(dir);
  const r = applyMig("autoupdate-enabled-default", dir);
  assert(r.status === "skipped" && r.reason === "non-object-container", n, JSON.stringify(r));
  assert(before.equals(bytesOf(dir)), n, "rewrote a non-object root");
  ok(n);
}
{
  const n = "AC-11 fresh install / missing / unparseable → never written";
  const fresh = seed({ settings: settingsFixture(undefined) });
  const beforeFresh = bytesOf(fresh);
  const r1 = applyMig("autoupdate-enabled-default", fresh, []); // not pre-existing = copied by this very run
  assert(r1.status === "skipped" && r1.reason === "not-pre-existing", n, JSON.stringify(r1));
  assert(beforeFresh.equals(bytesOf(fresh)), n, "a freshly copied file was touched");

  const gone = seed({ settings: undefined });
  const r2 = applyMig("autoupdate-enabled-default", gone);
  assert(r2.status === "skipped" && r2.reason === "missing-file", n, JSON.stringify(r2));

  const broken = seed({ settings: '{ "autoUpdate": \n' });
  const beforeBroken = bytesOf(broken);
  const r3 = applyMig("autoupdate-enabled-default", broken);
  assert(r3.status === "skipped" && r3.reason === "unparseable", n, JSON.stringify(r3));
  assert(beforeBroken.equals(bytesOf(broken)), n, "unparseable file was rewritten");
  ok(n);
}
{
  const n = "AC-11 the SHIPPED settings template is already at the target state";
  const shipped = join(ROOT, ".claude", "settings.skailr.json");
  if (!existsSync(shipped)) skip(n, "template not present — running outside the pack repo");
  else {
    const dir = seed({ settings: readFileSync(shipped, "utf8") });
    const before = bytesOf(dir);
    const scalar = applyMig("autoupdate-enabled-default", dir);
    assert(scalar.status === "noop" && scalar.reason === "explicit", n, JSON.stringify(scalar));
    assert(before.equals(bytesOf(dir)), n, "the shipped template would be rewritten on upgrade");
    const tpl = jsonAt(dir, REL);
    assert(tpl.autoUpdate && tpl.autoUpdate.enabled === true, n, "template does not default autoUpdate on");
    ok(n);
  }
}

// ---------- teardown ----------
server.closeAllConnections?.();
server.close();
console.log(`SMOKE PASS: ${passed} cases (hermetic — no external network)`);
