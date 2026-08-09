import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseYaml } from "./yaml.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tasksDir = path.join(__dirname, "..", "..", "tasks");

test("yaml: parses scalars (string/number/bool/null)", () => {
  const out = parseYaml('a: "hi"\nb: 3\nc: 3.5\nd: true\ne: null\nf:\n');
  assert.deepEqual(out, { a: "hi", b: 3, c: 3.5, d: true, e: null, f: null });
});

test("yaml: parses nested mapping", () => {
  const text = "defaults:\n  max_turns: 200\n  max_budget_usd: 10\n";
  assert.deepEqual(parseYaml(text), { defaults: { max_turns: 200, max_budget_usd: 10 } });
});

test("yaml: parses sequence of scalars", () => {
  const text = "setup:\n  - npm ci\n  - npm run build\n";
  assert.deepEqual(parseYaml(text), { setup: ["npm ci", "npm run build"] });
});

test("yaml: strips full-line and trailing comments, ignores blank lines", () => {
  const text = "# top comment\na: 1 # trailing\n\nb: 2\n";
  assert.deepEqual(parseYaml(text), { a: 1, b: 2 });
});

test("yaml: parses deeply nested map-of-maps (pricing_table shape)", () => {
  const text = [
    "pricing_table:",
    "  version: \"2026-08\"",
    "  models:",
    "    claude-x:",
    "      input_per_mtok: 3.00",
    "      output_per_mtok: 15.00",
    "",
  ].join("\n");
  assert.deepEqual(parseYaml(text), {
    pricing_table: {
      version: "2026-08",
      models: { "claude-x": { input_per_mtok: 3, output_per_mtok: 15 } },
    },
  });
});

test("yaml: parses literal block scalar (|) preserving newlines, blanks, and dash-like lines", () => {
  const text = [
    "prompt: |",
    "  Fix the bug.",
    "",
    "  - not a list item, just text",
    "  Last line.",
    "setup:",
    "  - npm ci",
    "",
  ].join("\n");
  const out = parseYaml(text);
  assert.equal(out.prompt, "Fix the bug.\n\n- not a list item, just text\nLast line.\n");
  assert.deepEqual(out.setup, ["npm ci"]);
});

test("yaml: literal block (|) at end of file, default clip chomping", () => {
  const text = "prompt: |\n  line one\n  line two\n";
  assert.equal(parseYaml(text).prompt, "line one\nline two\n");
});

test("yaml: folded block scalar (>) folds single breaks to spaces, keeps paragraph breaks", () => {
  const text = ["msg: >", "  line one", "  line two", "", "  line three", "next: 1"].join("\n");
  const out = parseYaml(text);
  assert.equal(out.msg, "line one line two\nline three\n");
  assert.equal(out.next, 1);
});

test("yaml: chomp strip (|-) drops the trailing newline", () => {
  const text = "prompt: |-\n  a\n  b\nnext: 1\n";
  const out = parseYaml(text);
  assert.equal(out.prompt, "a\nb");
  assert.equal(out.next, 1);
});

test("yaml: chomp keep (|+) preserves trailing blank lines", () => {
  const text = "prompt: |+\n  a\n  b\n\n\nnext: 1\n";
  const out = parseYaml(text);
  assert.equal(out.prompt, "a\nb\n\n\n");
  assert.equal(out.next, 1);
});

test("yaml: chomp clip (default |) keeps exactly one trailing newline", () => {
  const text = "prompt: |\n  a\n  b\n\n\nnext: 1\n";
  const out = parseYaml(text);
  assert.equal(out.prompt, "a\nb\n");
  assert.equal(out.next, 1);
});

test("yaml: folded chomp strip (>-) folds and drops trailing newline", () => {
  const text = "msg: >-\n  a\n  b\nnext: 1\n";
  const out = parseYaml(text);
  assert.equal(out.msg, "a b");
  assert.equal(out.next, 1);
});

test("yaml: folded chomp keep (>+) folds and preserves trailing blank lines", () => {
  const text = "msg: >+\n  a\n  b\n\n\nnext: 1\n";
  const out = parseYaml(text);
  assert.equal(out.msg, "a b\n\n\n");
  assert.equal(out.next, 1);
});

test("yaml: real task file patch-webhook.yaml loads full multi-line prompt + separate command field", () => {
  const text = readFileSync(path.join(tasksDir, "patch-webhook.yaml"), "utf8");
  const obj = parseYaml(text);
  assert.equal(obj.command, "/patch");
  assert.ok(!obj.prompt.startsWith("/patch"));
  assert.ok(obj.prompt.includes("Fix the duplicate webhook processing bug."));
  assert.ok(obj.prompt.includes("Add appropriate tests."));
  assert.ok(obj.prompt.split("\n").length > 5);
});

test("yaml: other real task files load multi-line prompts", () => {
  for (const file of ["feature-api-keys.yaml", "program-rbac.yaml"]) {
    const text = readFileSync(path.join(tasksDir, file), "utf8");
    const obj = parseYaml(text);
    assert.ok(typeof obj.prompt === "string", `${file}: prompt should be a string`);
    assert.ok(obj.prompt.split("\n").length > 5, `${file}: prompt should be multi-line`);
  }
});
