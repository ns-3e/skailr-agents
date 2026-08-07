import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ensureDir,
  atomicWriteJson,
  atomicWriteValidatedJson,
  markReadOnly,
  markWritable,
  sha256String,
  sha256File,
} from "./fsutil.mjs";

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "bench-fsutil-"));
}

test("fsutil: ensureDir creates nested dirs", () => {
  const base = mkTmp();
  const nested = path.join(base, "a", "b", "c");
  ensureDir(nested);
  assert.equal(fs.existsSync(nested), true);
});

test("fsutil: atomicWriteJson writes valid JSON with no tmp file left behind", () => {
  const base = mkTmp();
  const target = path.join(base, "out.json");
  atomicWriteJson(target, { hello: "world" });
  assert.deepEqual(JSON.parse(fs.readFileSync(target, "utf8")), { hello: "world" });
  const leftovers = fs.readdirSync(base).filter((f) => f.includes(".tmp-"));
  assert.deepEqual(leftovers, []);
});

test("fsutil: atomicWriteValidatedJson throws and writes nothing on invalid contract shape", () => {
  const base = mkTmp();
  const target = path.join(base, "run.json");
  assert.throws(() => atomicWriteValidatedJson(target, { bogus: true }, "run"));
  assert.equal(fs.existsSync(target), false);
});

test("fsutil: markReadOnly then markWritable round-trips file mode bits", () => {
  // Note: assert on mode bits, not on write() throwing — root (this
  // sandbox's uid) bypasses permission checks entirely, so a throws()
  // assertion would be a false negative under root regardless of chmod.
  const base = mkTmp();
  const file = path.join(base, "run.json");
  fs.writeFileSync(file, "{}");
  markReadOnly(base);
  assert.equal(fs.statSync(file).mode & 0o777, 0o444);
  assert.equal(fs.statSync(base).mode & 0o777, 0o555);
  markWritable(base);
  assert.equal(fs.statSync(file).mode & 0o777, 0o644);
  assert.doesNotThrow(() => fs.writeFileSync(file, "{}"));
});

test("fsutil: sha256String is deterministic", () => {
  assert.equal(sha256String("abc"), sha256String("abc"));
  assert.notEqual(sha256String("abc"), sha256String("abd"));
});

test("fsutil: sha256File matches sha256String of its contents", () => {
  const base = mkTmp();
  const file = path.join(base, "f.txt");
  fs.writeFileSync(file, "hello-bench");
  assert.equal(sha256File(file), sha256String("hello-bench"));
});
