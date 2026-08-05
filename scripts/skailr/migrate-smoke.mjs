#!/usr/bin/env node
/**
 * migrate-smoke.mjs — executable proof for migrate.mjs (AC-1..AC-5, AC-9, AC-10,
 * EC-2, EC-4, EC-5, EC-6, EC-7, EC-9, EC-10 + the CLI contract).
 *
 * Every case builds its own scratch temp dir (never this repo's real .claude/),
 * writes a settings fixture, invokes migrate.mjs as a child process exactly the
 * way the installers do, and asserts on BOTH the --json result and the resulting
 * bytes on disk. Byte comparison — not a re-parse — is what proves "untouched".
 *
 * Exit 0 on all-pass; non-zero with a clear message on the first failure.
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, "migrate.mjs");
const ID = "telemetry-enabled-default";
const REL = ".claude/settings.skailr.json";

let passed = 0;
function fail(name, msg) {
  console.error(`SMOKE FAIL [${name}]: ${msg}`);
  process.exit(1);
}
function ok(name) {
  passed++;
  console.log(`  ok  ${name}`);
}
function assert(cond, name, msg) {
  if (!cond) fail(name, msg);
}

/** Fresh temp target. `body` (string|null) is written to .claude/settings.skailr.json. */
function seed(body) {
  const dir = mkdtempSync(join(tmpdir(), "skailr-migrate-"));
  mkdirSync(join(dir, ".claude"), { recursive: true });
  if (body !== null) writeFileSync(join(dir, REL), body, "utf8");
  return dir;
}
function bytes(dir) {
  return readFileSync(join(dir, REL));
}
/** Invoke the CLI the way the installers do. Returns { code, out, err }. */
function run(args) {
  try {
    const out = execFileSync("node", [CLI, ...args], { encoding: "utf8", stdio: "pipe" });
    return { code: 0, out, err: "" };
  } catch (e) {
    return { code: e.status ?? -1, out: e.stdout ?? "", err: e.stderr ?? "" };
  }
}
/** Default invocation: file counts as pre-existing (the upgrade path). */
function migrate(dir, { preExisting = REL, json = true } = {}) {
  const args = ["--target", dir, "--only", ID, "--pre-existing", preExisting];
  if (json) args.push("--json");
  const r = run(args);
  if (json) {
    let parsed;
    try {
      parsed = JSON.parse(r.out);
    } catch {
      fail("harness", `--json output was not JSON: ${JSON.stringify(r.out)} / ${r.err}`);
    }
    return { ...r, result: parsed.results[0], schema: parsed.schema };
  }
  return r;
}

const fixture = (telemetry) =>
  JSON.stringify(
    {
      "//telemetry": "install.sh copies this file only if absent",
      ...(telemetry === undefined ? {} : { telemetry }),
      hooks: { PreToolUse: [{ matcher: "Task", command: "scripts/hooks/x.sh" }] },
    },
    null,
    2
  ) + "\n";

// ---- AC-1 / EC-9: no telemetry key → filled, every other key preserved ------
{
  const n = "AC-1/EC-9 fill-absent preserves all other keys";
  const dir = seed(fixture(undefined));
  const { code, result } = migrate(dir);
  assert(code === 0, n, `exit ${code}`);
  assert(result.status === "applied" && result.reason === "absent", n, JSON.stringify(result));
  const after = JSON.parse(bytes(dir));
  assert(after.telemetry.enabled === true, n, "telemetry.enabled not true");
  assert(
    after["//telemetry"] === "install.sh copies this file only if absent",
    n,
    "//telemetry comment lost"
  );
  assert(
    JSON.stringify(after.hooks) ===
      JSON.stringify({ PreToolUse: [{ matcher: "Task", command: "scripts/hooks/x.sh" }] }),
    n,
    "hooks block mutated"
  );
  assert(Object.keys(after).length === 3, n, `unexpected key set: ${Object.keys(after)}`);
  ok(n);
}

// ---- AC-2: explicit true → no-op, bytes unchanged ---------------------------
{
  const n = "AC-2 explicit true is a no-op";
  const dir = seed(fixture({ enabled: true }));
  const before = bytes(dir);
  const { result } = migrate(dir);
  assert(result.status === "noop" && result.reason === "explicit", n, JSON.stringify(result));
  assert(before.equals(bytes(dir)), n, "file bytes changed");
  ok(n);
}

// ---- AC-3: explicit false is never overwritten ------------------------------
{
  const n = "AC-3 explicit false survives";
  const dir = seed(fixture({ enabled: false }));
  const before = bytes(dir);
  const { result } = migrate(dir);
  assert(result.status === "noop" && result.reason === "explicit", n, JSON.stringify(result));
  assert(before.equals(bytes(dir)), n, "file bytes changed");
  assert(JSON.parse(bytes(dir)).telemetry.enabled === false, n, "false was overwritten");
  ok(n);
}

// ---- AC-4 / EC-6: non-boolean enabled → corrected to boolean true -----------
for (const bad of ['"true"', "1", "null", "{}", "[]", '"false"']) {
  const n = `AC-4/EC-6 non-boolean enabled ${bad} corrected`;
  const dir = seed(fixture({ enabled: JSON.parse(bad) }));
  const { result } = migrate(dir);
  assert(result.status === "applied" && result.reason === "malformed", n, JSON.stringify(result));
  assert(JSON.parse(bytes(dir)).telemetry.enabled === true, n, "not corrected to true");
  ok(n);
}

// ---- AC-M17: "telemetry": {} → purely additive fill -------------------------
{
  const n = "AC-M17 empty telemetry object fills";
  const dir = seed(fixture({}));
  const { result } = migrate(dir);
  assert(result.status === "applied" && result.reason === "absent", n, JSON.stringify(result));
  const after = JSON.parse(bytes(dir));
  assert(after.telemetry.enabled === true, n, "not filled");
  assert(after["//telemetry"] && after.hooks, n, "sibling keys lost");
  ok(n);
}

// ---- Q6: non-object telemetry container → skipped, never replaced -----------
for (const weird of ['"on"', "null", "[]", "3"]) {
  const n = `Q6 non-object telemetry ${weird} skipped untouched`;
  const dir = seed(fixture(JSON.parse(weird)));
  const before = bytes(dir);
  const { result } = migrate(dir);
  assert(
    result.status === "skipped" && result.reason === "non-object-container",
    n,
    JSON.stringify(result)
  );
  assert(before.equals(bytes(dir)), n, "consumer value was replaced");
  ok(n);
}

// ---- Root not an object → unsafe, untouched ---------------------------------
{
  const n = "root JSON array is unsafe, untouched";
  const dir = seed("[1,2,3]\n");
  const before = bytes(dir);
  const { result } = migrate(dir);
  assert(result.status === "skipped" && result.reason === "non-object-container", n, JSON.stringify(result));
  assert(before.equals(bytes(dir)), n, "file changed");
  ok(n);
}

// ---- AC-5 / EC-1: fresh install (not pre-existing) → never read or written --
{
  const n = "AC-5/EC-1 not pre-existing is skipped before any read";
  const dir = seed(fixture(undefined));
  const before = bytes(dir);
  const { result } = migrate(dir, { preExisting: "" });
  assert(
    result.status === "skipped" && result.reason === "not-pre-existing",
    n,
    JSON.stringify(result)
  );
  assert(before.equals(bytes(dir)), n, "fresh-copied file was touched");
  ok(n);
}

// ---- AC-10 / EC-7: consumer deleted the file → skipped, no error ------------
{
  const n = "AC-10/EC-7 deleted settings file raises no error";
  const dir = seed(null);
  const { code, result } = migrate(dir);
  assert(code === 0, n, `exit ${code}`);
  assert(result.status === "skipped" && result.reason === "missing-file", n, JSON.stringify(result));
  ok(n);
}

// ---- AC-9 / EC-2: idempotent — run twice, byte-identical, second is no-op ---
{
  const n = "AC-9/EC-2 second run is a byte-stable no-op";
  const dir = seed(fixture(undefined));
  const first = migrate(dir);
  assert(first.result.status === "applied", n, "first run did not apply");
  const afterFirst = bytes(dir);
  const second = migrate(dir);
  assert(second.result.status === "noop", n, `second run status ${second.result.status}`);
  assert(afterFirst.equals(bytes(dir)), n, "second run changed bytes");
  const third = migrate(dir);
  assert(third.result.status === "noop" && afterFirst.equals(bytes(dir)), n, "third run drifted");
  ok(n);
}

// ---- EC-5: unparseable JSON → skipped, byte-identical, no partial edit ------
{
  const n = "EC-5 unparseable JSON left byte-identical";
  const dir = seed('{ "telemetry": \n');
  const before = bytes(dir);
  const { code, result } = migrate(dir);
  assert(code === 0, n, `exit ${code}`);
  assert(result.status === "skipped" && result.reason === "unparseable", n, JSON.stringify(result));
  assert(before.equals(bytes(dir)), n, "bytes changed");
  ok(n);
}

// ---- EC-4 / EC-13: unwritable file → failed, exit 0, file unchanged ---------
{
  const n = "EC-4 read-only file fails softly with exit 0";
  if (typeof process.getuid === "function" && process.getuid() === 0) {
    console.log(`  --  ${n} (skipped: running as root, chmod cannot deny write)`);
  } else {
    const dir = seed(fixture(undefined));
    const before = bytes(dir);
    chmodSync(join(dir, REL), 0o444);
    const { code, result } = migrate(dir);
    chmodSync(join(dir, REL), 0o644);
    assert(code === 0, n, `exit ${code} — installers must never abort`);
    assert(result.status === "failed" && result.reason === "write-error", n, JSON.stringify(result));
    assert(before.equals(bytes(dir)), n, "bytes changed despite failure");
    ok(n);
  }
}

// ---- EC-10: large unicode payload round-trips byte-identically --------------
{
  const n = "EC-10 1 MiB unicode payload survives the round trip";
  const payload = "日本語-🌱-ünïcodé-".repeat(50000).slice(0, 1024 * 1024);
  const dir = seed(JSON.stringify({ note: payload, hooks: {} }, null, 2) + "\n");
  const { result } = migrate(dir);
  assert(result.status === "applied", n, JSON.stringify(result));
  const after = JSON.parse(bytes(dir));
  assert(after.note === payload, n, "payload corrupted");
  assert(after.telemetry.enabled === true, n, "not filled");
  ok(n);
}

// ---- Human console lines match the spec'd strings ---------------------------
{
  const n = "human mode prints the spec'd ~ / = / ! lines";
  const applied = migrate(seed(fixture(undefined)), { json: false }).out;
  assert(
    applied.trimEnd() === `  ~ ${REL} ← ${ID} applied (added telemetry.enabled: true)`,
    n,
    `applied line was: ${JSON.stringify(applied)}`
  );
  const noop = migrate(seed(fixture({ enabled: true })), { json: false }).out;
  assert(
    noop.trimEnd() === `  = ${REL} ${ID} no-op (telemetry.enabled already set explicitly)`,
    n,
    `noop line was: ${JSON.stringify(noop)}`
  );
  const weird = migrate(seed(fixture("on")), { json: false }).out;
  assert(weird.startsWith("  ! "), n, `warn line was: ${JSON.stringify(weird)}`);
  ok(n);
}

// ---- CLI contract: usage errors exit 2, --list is well-formed ---------------
{
  const n = "CLI contract: exit 2 on usage errors, --list --json shape";
  const dir = seed(fixture(undefined));
  const unknown = run(["--target", dir, "--only", "nope"]);
  assert(unknown.code === 2, n, `unknown id exit ${unknown.code}`);
  assert(unknown.err.includes('unknown migration "nope"'), n, `stderr: ${unknown.err}`);
  assert(run(["--only", ID]).code === 2, n, "missing --target did not exit 2");
  assert(run(["--target", dir]).code === 2, n, "missing --only did not exit 2");
  assert(run(["--target", dir, "--only", ID, "--bogus"]).code === 2, n, "unknown flag did not exit 2");

  const list = JSON.parse(run(["--list", "--json"]).out);
  assert(list.schema === "skailr.migrate/v1", n, "bad schema");
  assert(list.migrations.length > 0, n, "zero migrations exported");
  for (const m of list.migrations) {
    assert(/^[a-z][a-z0-9-]*$/.test(m.id), n, `id "${m.id}" cannot survive doctor's token filter`);
    assert(typeof m.file === "string" && m.file, n, `migration ${m.id} has no file`);
    assert(typeof m.describe === "string" && m.describe, n, `migration ${m.id} has no describe`);
  }
  const plain = run(["--list"]).out.trim().split("\n");
  assert(
    plain.join(",") === list.migrations.map((m) => m.id).join(","),
    n,
    "--list and --list --json disagree"
  );
  ok(n);
}

// ---- Both installers declare exactly the exported ids, in order -------------
{
  const n = "install.sh / install.ps1 declare the exported ids in order";
  const exported = JSON.parse(run(["--list", "--json"]).out).migrations.map((m) => m.id);
  const root = join(HERE, "..", "..");
  for (const [file, marker] of [
    ["install.sh", "SKAILR_MIGRATIONS"],
    ["install.ps1", "$SkailrMigrations"],
  ]) {
    let text;
    try {
      text = readFileSync(join(root, file), "utf8");
    } catch {
      console.log(`  --  ${n} (skipped: ${file} not present — running outside the pack repo)`);
      text = null;
    }
    if (text === null) continue;
    assert(text.includes("migrate.mjs"), n, `${file} never invokes migrate.mjs`);
    const idx = text.indexOf(marker);
    assert(idx >= 0, n, `${file} has no ${marker}`);
    const body = text.slice(idx, text.indexOf(")", idx));
    const got = (body.match(/[a-z][a-z0-9-]*/g) || []).filter((t) => exported.includes(t));
    assert(
      got.join(",") === exported.join(","),
      n,
      `${file} ${marker} = [${got}] but runner exports [${exported}]`
    );
  }
  ok(n);
}

console.log(`SMOKE PASS: ${passed} cases`);
