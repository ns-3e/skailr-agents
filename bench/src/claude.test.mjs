import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { invokeClaude, isMockMode, classifyTermination, buildLaunchPrompt } from "./claude.mjs";
import { validate } from "./schema/validate.mjs";
import { parseYaml } from "./lib/yaml.mjs";

const TASKS_DIR = path.resolve(import.meta.dirname, "..", "tasks");
const TASK_IDS = ["patch-webhook", "feature-api-keys", "program-rbac"];

function loadTask(id) {
  return parseYaml(fs.readFileSync(path.join(TASKS_DIR, `${id}.yaml`), "utf8"));
}

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "bench-claude-"));
}

test("claude: isMockMode true via opts.mock or BENCH_MOCK=1", () => {
  assert.equal(isMockMode({ mock: true }), true);
  const prev = process.env.BENCH_MOCK;
  process.env.BENCH_MOCK = "1";
  assert.equal(isMockMode({}), true);
  if (prev === undefined) delete process.env.BENCH_MOCK; else process.env.BENCH_MOCK = prev;
});

test("AC-1: invokeClaude mock mode (solved) returns schema-valid stream events + result + writes artifact files", async () => {
  const runDir = mkTmp();
  const res = await invokeClaude({
    mock: true, flavor: "solved", prompt: "do the task", model: "claude-sonnet-4-5-20250929", runDir,
  });
  assert.equal(res.termination_reason, "finish");
  assert.ok(res.events.length > 0);
  for (const e of res.events) {
    assert.equal(validate(e, "mock-event").valid, true);
  }
  assert.ok(res.resultEvent);
  assert.equal(fs.existsSync(path.join(runDir, "events.jsonl")), true);
  assert.equal(fs.existsSync(path.join(runDir, "otel", "telemetry.json")), true);
  assert.equal(fs.existsSync(path.join(runDir, "result.json")), true);
  assert.equal(fs.existsSync(path.join(runDir, "stdout.log")), true);
});

test("AC-4: invokeClaude mock mode (planted-defect) still terminates as finish (defect hidden from agent-visible stream)", async () => {
  const runDir = mkTmp();
  const res = await invokeClaude({
    mock: true, flavor: "planted-defect", prompt: "x", model: "m", runDir,
  });
  assert.equal(res.termination_reason, "finish");
});

test("AC-2: invokeClaude mock mode (timeout flavor) is classified wall_clock_kill", async () => {
  const runDir = mkTmp();
  const res = await invokeClaude({ mock: true, flavor: "timeout", prompt: "x", model: "m", runDir });
  assert.equal(res.termination_reason, "wall_clock_kill");
  assert.equal(res.killedByTimeout, true);
});

test("claude: mock mode crash flavor classified crash", async () => {
  const runDir = mkTmp();
  const res = await invokeClaude({ mock: true, flavor: "crash", prompt: "x", model: "m", runDir });
  assert.equal(res.termination_reason, "crash");
});

test("classifyTermination: killedByTimeout always wins", () => {
  assert.equal(
    classifyTermination({ killedByTimeout: true, exitCode: 0, signal: null, resultEvent: { is_error: false, subtype: "success" } }),
    "wall_clock_kill"
  );
});

test("classifyTermination: successful result with no timeout -> finish", () => {
  assert.equal(
    classifyTermination({ killedByTimeout: false, exitCode: 0, signal: null, resultEvent: { is_error: false, subtype: "success", num_turns: 3 } }),
    "finish"
  );
});

test("classifyTermination: successful result at/over maxTurns -> turns (heuristic, no native CLI cap — see top-of-file DEVIATION note)", () => {
  assert.equal(
    classifyTermination({ killedByTimeout: false, exitCode: 0, signal: null, resultEvent: { is_error: false, subtype: "success", num_turns: 200 }, maxTurns: 200 }),
    "turns"
  );
});

test("classifyTermination: error result with null cost -> crash", () => {
  assert.equal(
    classifyTermination({ killedByTimeout: false, exitCode: 1, signal: null, resultEvent: { is_error: true, total_cost_usd: null } }),
    "crash"
  );
});

test("classifyTermination: error result with a cost figure -> budget", () => {
  assert.equal(
    classifyTermination({ killedByTimeout: false, exitCode: 1, signal: null, resultEvent: { is_error: true, total_cost_usd: 9.99 } }),
    "budget"
  );
});

test("buildLaunchPrompt: no task.command -> prompt passed through unchanged on both arms", () => {
  const task = { prompt: "do the thing" };
  assert.equal(buildLaunchPrompt(task, "baseline"), "do the thing");
  assert.equal(buildLaunchPrompt(task, "skailr"), "do the thing");
});

test("buildLaunchPrompt: skailr arm prepends task.command as the literal leading line", () => {
  const task = { command: "/patch", prompt: "Fix the bug." };
  const sent = buildLaunchPrompt(task, "skailr");
  assert.ok(sent.startsWith("/patch\n"));
  assert.ok(sent.includes("Fix the bug."));
});

test("buildLaunchPrompt: baseline arm never starts with a slash command (bug: CLI intercepted /patch as unrecognized)", () => {
  const task = { command: "/patch", prompt: "Fix the bug." };
  const sent = buildLaunchPrompt(task, "baseline");
  assert.equal(sent.startsWith("/"), false);
  assert.ok(sent.includes("Fix the bug."));
});

for (const id of TASK_IDS) {
  test(`bug-1 AC: ${id}.yaml — baseline launch input does not start with an unrecognized leading slash command`, () => {
    const task = loadTask(id);
    assert.ok(task.command, `${id}.yaml must declare a command`);
    const sent = buildLaunchPrompt(task, "baseline");
    assert.equal(sent.startsWith("/"), false);
  });

  test(`bug-1 AC: ${id}.yaml — skailr launch input still starts with the task's intended slash command`, () => {
    const task = loadTask(id);
    const sent = buildLaunchPrompt(task, "skailr");
    assert.ok(sent.startsWith(`${task.command}\n`));
  });
}

test("classifyTermination: no result event, nonzero exit -> nonzero_exit", () => {
  assert.equal(
    classifyTermination({ killedByTimeout: false, exitCode: 7, signal: null, resultEvent: null }),
    "nonzero_exit"
  );
});
