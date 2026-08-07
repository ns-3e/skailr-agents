// DOC: bench/config.yaml loader — parses, schema-validates, and fail-fast
// verifies the live environment (claude/node versions) against the pinned
// config before any run is allowed to start (brief NN "fail-fast env
// verification"; FR-1). Floating model aliases (e.g. "sonnet", "latest")
// are refused — only exact dated model IDs are accepted.
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseYaml } from "./yaml.mjs";
import { validate } from "../schema/validate.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CONFIG_PATH = path.resolve(__dirname, "../../config.yaml");

// Exact Anthropic model IDs end in an 8-digit snapshot date, e.g.
// "claude-sonnet-4-5-20250929". Anything else (a bare family name, "latest",
// "sonnet", etc.) is a floating alias and is refused.
const EXACT_MODEL_ID_RE = /-\d{8}$/;

export class ConfigError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = "ConfigError";
    this.details = details;
  }
}

/**
 * Parse + schema-validate config YAML text (does not touch the live env).
 */
export function parseConfig(text) {
  const parsed = parseYaml(text);
  const { valid, errors } = validate(parsed, "config");
  if (!valid) {
    throw new ConfigError("bench/config.yaml failed schema validation", errors);
  }
  if (!EXACT_MODEL_ID_RE.test(parsed.model)) {
    throw new ConfigError(
      `bench/config.yaml "model" must be an exact dated model ID (e.g. "claude-sonnet-4-5-20250929"); refusing floating alias "${parsed.model}"`
    );
  }
  return parsed;
}

/**
 * Load + validate bench/config.yaml from disk.
 */
export function loadConfig(filePath = DEFAULT_CONFIG_PATH) {
  const text = readFileSync(filePath, "utf8");
  return parseConfig(text);
}

/**
 * Query the live environment this process is actually running in. Isolated
 * behind a function so callers/tests can inject a fake env instead of
 * shelling out (verifyEnv below is the pure, testable comparison).
 */
export function getLiveEnv({ claudeBin = "claude" } = {}) {
  let claude_code_version = null;
  try {
    const out = execFileSync(claudeBin, ["--version"], { encoding: "utf8" });
    const m = out.match(/(\d+\.\d+\.\d+)/);
    claude_code_version = m ? m[1] : out.trim();
  } catch (err) {
    throw new ConfigError(`fail-fast env verify: could not run "${claudeBin} --version": ${err.message}`);
  }
  const node_version = process.version.replace(/^v/, "");
  return { claude_code_version, node_version };
}

function nodeVersionMatches(live, pinned) {
  // pinned may be an exact version ("22.22.2") or a major wildcard ("22.x").
  if (pinned.endsWith(".x")) {
    const majorPinned = pinned.split(".")[0];
    const majorLive = live.split(".")[0];
    return majorPinned === majorLive;
  }
  return live === pinned;
}

/**
 * Fail-fast comparison of live env vs pinned config. Pure function — does
 * not spawn processes. Returns {ok, errors[]}.
 */
export function verifyEnv(config, live) {
  const errors = [];
  if (live.claude_code_version !== config.claude_code_version) {
    errors.push(
      `claude_code_version mismatch: live=${live.claude_code_version} pinned=${config.claude_code_version}`
    );
  }
  if (!nodeVersionMatches(live.node_version, config.node_version)) {
    errors.push(`node_version mismatch: live=${live.node_version} pinned=${config.node_version}`);
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Convenience: load config, query live env, verify, throw on mismatch.
 * This is the entrypoint run.mjs (harness-core) should call before any run.
 */
export function loadAndVerifyConfig(opts = {}) {
  const config = loadConfig(opts.filePath);
  const live = opts.live || getLiveEnv(opts);
  const { ok, errors } = verifyEnv(config, live);
  if (!ok) {
    throw new ConfigError("fail-fast env verify: live environment does not match pinned bench/config.yaml", errors);
  }
  return config;
}
