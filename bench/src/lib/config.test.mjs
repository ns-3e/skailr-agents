import test from "node:test";
import assert from "node:assert/strict";
import { parseConfig, loadConfig, verifyEnv, ConfigError } from "./config.mjs";

const VALID_YAML = `
claude_code_version: "2.1.224"
model: "claude-sonnet-4-5-20250929"
node_version: "22.x"
container_image: null
defaults:
  max_turns: 200
  max_budget_usd: 10
  wall_clock_timeout_min: 45
  repetitions: 5
pricing_table:
  version: "2026-08"
  models:
    claude-sonnet-4-5-20250929:
      input_per_mtok: 3.00
      output_per_mtok: 15.00
      cache_write_per_mtok: 3.75
      cache_read_per_mtok: 0.30
`;

test("config: parses+validates a well-formed config.yaml", () => {
  const cfg = parseConfig(VALID_YAML);
  assert.equal(cfg.model, "claude-sonnet-4-5-20250929");
  assert.equal(cfg.defaults.repetitions, 5);
  assert.equal(cfg.pricing_table.models["claude-sonnet-4-5-20250929"].input_per_mtok, 3);
});

test("config: real bench/config.yaml on disk loads and validates", () => {
  const cfg = loadConfig();
  assert.equal(cfg.claude_code_version, "2.1.224");
});

test("config: refuses floating model alias", () => {
  const bad = VALID_YAML.replace('model: "claude-sonnet-4-5-20250929"', 'model: "sonnet"');
  assert.throws(() => parseConfig(bad), ConfigError);
});

test("config: fails schema validation when a required field is missing", () => {
  const bad = VALID_YAML.replace('container_image: null\n', "");
  assert.throws(() => parseConfig(bad), ConfigError);
});

test("config: verifyEnv ok when live matches pinned exactly", () => {
  const cfg = parseConfig(VALID_YAML);
  const { ok, errors } = verifyEnv(cfg, { claude_code_version: "2.1.224", node_version: "22.22.2" });
  assert.equal(ok, true);
  assert.deepEqual(errors, []);
});

test("config: verifyEnv fail-fast on claude_code_version mismatch", () => {
  const cfg = parseConfig(VALID_YAML);
  const { ok, errors } = verifyEnv(cfg, { claude_code_version: "2.0.0", node_version: "22.22.2" });
  assert.equal(ok, false);
  assert.ok(errors.some((e) => e.includes("claude_code_version")));
});

test("config: verifyEnv fail-fast on node major-version mismatch", () => {
  const cfg = parseConfig(VALID_YAML);
  const { ok, errors } = verifyEnv(cfg, { claude_code_version: "2.1.224", node_version: "20.1.0" });
  assert.equal(ok, false);
  assert.ok(errors.some((e) => e.includes("node_version")));
});
