import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { verifyIsolation, verifyFixtureIsolation } from "./verify-isolation.mjs";

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "bench-isolation-"));
}

function makeCleanLayout() {
  const root = mkTmp();
  const fixturesRoot = path.join(root, "fixtures");
  const gradersRoot = path.join(root, "graders");
  fs.mkdirSync(path.join(fixturesRoot, "patch-webhook", "src"), { recursive: true });
  fs.writeFileSync(path.join(fixturesRoot, "patch-webhook", "src", "index.mjs"), "export const x = 1;\n");
  fs.writeFileSync(path.join(fixturesRoot, "patch-webhook", "fixture.manifest.json"), JSON.stringify({ task_id: "patch-webhook" }));
  fs.mkdirSync(path.join(gradersRoot, "patch-webhook"), { recursive: true });
  fs.writeFileSync(path.join(gradersRoot, "patch-webhook", "grade.mjs"), "// hidden grader entrypoint\n");
  fs.writeFileSync(path.join(gradersRoot, "patch-webhook", "rubric.yaml"), "weights: {}\n");
  return { root, fixturesRoot, gradersRoot };
}

test("AC-3: clean synthetic layout passes verify-isolation", () => {
  const { fixturesRoot, gradersRoot } = makeCleanLayout();
  const result = verifyIsolation({ fixturesRoot, gradersRoot });
  assert.equal(result.ok, true);
  assert.deepEqual(result.leaks, []);
  assert.equal(result.fixtures_checked, 1);
});

test("AC-3: planted leak — grader file copied verbatim into a fixture FAILS", () => {
  const { fixturesRoot, gradersRoot } = makeCleanLayout();
  const graderSrc = fs.readFileSync(path.join(gradersRoot, "patch-webhook", "grade.mjs"), "utf8");
  fs.writeFileSync(path.join(fixturesRoot, "patch-webhook", "grade.mjs"), graderSrc);

  const result = verifyIsolation({ fixturesRoot, gradersRoot });
  assert.equal(result.ok, false);
  assert.ok(result.leaks.some((l) => l.type === "grader-file-copied-into-fixture"));
});

test("planted leak — symlink from fixture into grader dir FAILS", () => {
  const { fixturesRoot, gradersRoot } = makeCleanLayout();
  const linkPath = path.join(fixturesRoot, "patch-webhook", "sneaky-link");
  fs.symlinkSync(path.join(gradersRoot, "patch-webhook"), linkPath);

  const result = verifyIsolation({ fixturesRoot, gradersRoot });
  assert.equal(result.ok, false);
  assert.ok(result.leaks.some((l) => l.type === "symlink-into-graders"));
});

test("planted leak — .. traversal path resolving into graders FAILS", () => {
  const { fixturesRoot, gradersRoot } = makeCleanLayout();
  // Simulate traversal by symlinking through a relative ../graders path.
  const linkPath = path.join(fixturesRoot, "patch-webhook", "escape");
  const relTarget = path.relative(path.dirname(linkPath), path.join(gradersRoot, "patch-webhook"));
  fs.symlinkSync(relTarget, linkPath);

  const result = verifyIsolation({ fixturesRoot, gradersRoot });
  assert.equal(result.ok, false);
});

test("planted leak — fixture source code imports a grader path by string FAILS", () => {
  const { fixturesRoot, gradersRoot } = makeCleanLayout();
  fs.writeFileSync(
    path.join(fixturesRoot, "patch-webhook", "src", "sneaky.mjs"),
    `import { hidden } from "../../graders/patch-webhook/grade.mjs";\n`
  );
  const result = verifyIsolation({ fixturesRoot, gradersRoot });
  assert.equal(result.ok, false);
  assert.ok(result.leaks.some((l) => l.type === "grader-path-referenced-in-fixture"));
});

test("verifyFixtureIsolation: same-basename-different-content file is NOT a false-positive leak", () => {
  const { fixturesRoot, gradersRoot } = makeCleanLayout();
  // "grade.mjs" basename coincidentally reused but different content — must not flag.
  fs.writeFileSync(path.join(fixturesRoot, "patch-webhook", "grade.mjs"), "// totally unrelated fixture file\n");
  const { ok, leaks } = verifyFixtureIsolation(path.join(fixturesRoot, "patch-webhook"), gradersRoot);
  assert.equal(ok, true, JSON.stringify(leaks));
});

test("verifyIsolation: missing fixturesRoot is treated as nothing-to-check, not a crash", () => {
  const root = mkTmp();
  const result = verifyIsolation({ fixturesRoot: path.join(root, "nope"), gradersRoot: path.join(root, "graders") });
  assert.equal(result.ok, true);
});
