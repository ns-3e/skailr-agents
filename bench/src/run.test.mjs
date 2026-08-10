import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  installArm, InstallArmError, runOne, runCampaign, estimateWorstCaseUsd, checkoutFixture, captureDiff,
  extractSkailrDiagnostics, assertContainerSupported,
} from "./run.mjs";
import { regradeRun } from "./grade.mjs";
import { loadConfig } from "./lib/config.mjs";
import { validate } from "./schema/validate.mjs";

function mkTmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `bench-${prefix}-`));
}

function mkGitFixture() {
  const dir = mkTmp("fixture");
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "test"], { cwd: dir });
  fs.writeFileSync(path.join(dir, "README.md"), "fixture\n");
  execFileSync("git", ["add", "."], { cwd: dir });
  execFileSync("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  const sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" }).trim();
  return { dir, sha };
}

function baseTask({ fixtureDir, sha, grader = "unused.mjs", setup = [] }) {
  return {
    id: "t1", version: "1", class: "patch",
    fixture: fixtureDir, fixture_sha: sha, grader,
    prompt: "do the thing", setup,
    critical_requirements: [],
  };
}

function stubGraderSolved() {
  return async () => ({
    tests: { hidden_functional: { passed: 2, failed: 0, total: 2, cases: [] }, regression: { passed: 1, failed: 0, total: 1, cases: [] } },
    subscores: { functional: 100, regression: 100, security: 100, static: 100, scope: 100, maintainability: 100 },
    quality_score: 97,
    critical_failures: [],
    solved: true,
  });
}

function stubGraderFailed() {
  return async () => ({
    tests: { hidden_functional: { passed: 0, failed: 2, total: 2, cases: [] }, regression: { passed: 1, failed: 0, total: 1, cases: [] } },
    subscores: { functional: 0, regression: 100, security: 100, static: 100, scope: 100, maintainability: 100 },
    quality_score: 40,
    critical_failures: [],
    solved: false,
  });
}

test("installArm: baseline is a no-op — installed:false, all skailr_* null, no files added", async () => {
  const ws = mkTmp("ws-baseline");
  const before = fs.readdirSync(ws);
  const res = await installArm("baseline", "HEAD", ws);
  assert.deepEqual(res, { arm: "baseline", installed: false, skailr_sha: null, skailr_version: null, artifacts_root: null });
  assert.deepEqual(fs.readdirSync(ws), before);
});

test("installArm: skailr materializes .claude/ pack from this repo at ref, resolves ref->sha, MUST NOT copy bench/**", async () => {
  const ws = mkTmp("ws-skailr");
  const res = await installArm("skailr", "HEAD", ws);
  assert.equal(res.installed, true);
  assert.ok(res.skailr_sha && /^[0-9a-f]{40}$/.test(res.skailr_sha));
  assert.equal(res.artifacts_root, path.join(ws, ".claude"));
  assert.equal(fs.existsSync(path.join(ws, ".claude")), true);
  assert.equal(fs.existsSync(path.join(ws, "bench")), false);
});

test("MSG-007 installArm fidelity: skailr arm ships exactly the install.sh set, NEVER .claude/experts or bench/**", async () => {
  const ws = mkTmp("ws-fidelity");
  const res = await installArm("skailr", "HEAD", ws);
  // Present: root CLAUDE.md + scripts + the shipped .claude subtrees.
  for (const p of ["CLAUDE.md", "scripts/skailr", "scripts/hooks", ".claude/agents", ".claude/commands",
    ".claude/teams/registry.md", ".claude/skills", ".claude/program/schemas",
    ".claude/program/channels/PROTOCOL.md", ".claude/settings.skailr.json", ".claude/intake.md"]) {
    assert.equal(fs.existsSync(path.join(ws, p)), true, `expected shipped path ${p}`);
  }
  // Empty runtime dirs created.
  for (const d of [".claude/tmp", ".claude/program", ".claude/repo"]) {
    assert.equal(fs.existsSync(path.join(ws, d)), true, `expected empty dir ${d}`);
  }
  // NEVER shipped: consumer roster, bench harness, source runtime program docs.
  assert.equal(fs.existsSync(path.join(ws, ".claude/experts")), false, "must NOT ship .claude/experts");
  assert.equal(fs.existsSync(path.join(ws, "bench")), false, "must NOT copy bench/**");
  assert.equal(fs.existsSync(path.join(ws, ".claude/program/ledger.md")), false, "must NOT ship source program runtime");
  assert.equal(fs.existsSync(path.join(ws, ".claude/program/plan.md")), false);
  assert.ok(res.installed_paths instanceof Set && res.installed_paths.size > 0);
  assert.ok(![...res.installed_paths].some((p) => p.startsWith(".claude/experts") || p.startsWith("bench/")));
});

test("MSG-007 diagnostics floor: a freshly-installed skailr workspace with NO agent artifacts yields all-zero diagnostics (no shipped-doc floor)", async () => {
  const ws = mkTmp("ws-diagfloor");
  const res = await installArm("skailr", "HEAD", ws);
  const runDir = mkTmp("rundir-diag");
  const diag = extractSkailrDiagnostics(ws, runDir, res.installed_paths);
  assert.deepEqual(diag, {
    agents_spawned: 0, inter_agent_messages: 0, blockers: 0,
    contract_events: 0, gate_failures: 0, validator_findings: 0,
  });
  // A net-new agent artifact IS counted (proves it's not just returning zeros).
  fs.writeFileSync(path.join(ws, ".claude/program/ledger.md"), "type: blocker\ntype: contract-change\n");
  const diag2 = extractSkailrDiagnostics(ws, mkTmp("rundir-diag2"), res.installed_paths);
  assert.ok(diag2.inter_agent_messages > 0 && diag2.contract_events > 0);
});

test("FR-1 container_image fail-fast: non-null container_image refuses to start the campaign", async () => {
  const config = { ...loadConfig(), container_image: "ghcr.io/example/img:1" };
  assert.throws(() => assertContainerSupported(config), /container execution is not implemented in V1/);
  const { dir, sha } = mkGitFixture();
  const task = baseTask({ fixtureDir: dir, sha });
  await assert.rejects(
    () => runCampaign({ tasks: [task], reps: 1, config, mock: true }),
    /container execution is not implemented in V1/
  );
});

test("installArm: bad ref throws InstallArmError with code bad_ref", async () => {
  const ws = mkTmp("ws-badref");
  await assert.rejects(() => installArm("skailr", "not-a-real-ref-xyz", ws), InstallArmError);
});

test("installArm: missing workspace throws InstallArmError with code workspace_missing", async () => {
  await assert.rejects(
    () => installArm("skailr", "HEAD", path.join(os.tmpdir(), "does-not-exist-xyz")),
    (err) => err instanceof InstallArmError && err.code === "workspace_missing"
  );
});

test("checkoutFixture: fresh git checkout at fixture_sha produces a workspace with matching HEAD", () => {
  const { dir, sha } = mkGitFixture();
  const ws = path.join(mkTmp("ws-checkout-parent"), "ws");
  checkoutFixture(dir, sha, ws);
  const wsSha = execFileSync("git", ["-C", ws, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  assert.equal(wsSha, sha);
});

test("captureDiff: reports lines_added/removed/files_edited/diff_bytes for uncommitted edits vs fixture_sha", () => {
  const { dir, sha } = mkGitFixture();
  const ws = path.join(mkTmp("ws-diff-parent"), "ws");
  checkoutFixture(dir, sha, ws);
  fs.writeFileSync(path.join(ws, "README.md"), "fixture\nnew line\n");
  const runDir = mkTmp("rundir-diff");
  const stats = captureDiff(ws, sha, runDir);
  assert.equal(stats.files_edited, 1);
  assert.ok(stats.lines_added >= 1);
  assert.equal(fs.existsSync(path.join(runDir, "git.diff")), true);
});

test("AC-1: runOne full lifecycle in MOCK mode (baseline, solved) produces schema-valid run.json + full artifact set", async () => {
  const { dir, sha } = mkGitFixture();
  const config = loadConfig();
  const resultsRoot = mkTmp("results");
  const workspaceRoot = mkTmp("wsroot");
  const task = baseTask({ fixtureDir: dir, sha });

  const { run, runDir } = await runOne({
    task, arm: "baseline", rep: 0, config, mock: true, flavor: "solved",
    runGrader: stubGraderSolved(), resultsRoot, workspaceRoot,
  });

  const { valid, errors } = validate(run, "run");
  assert.equal(valid, true, JSON.stringify(errors));
  assert.equal(run.outcome.solved, true);
  assert.equal(run.outcome.termination_reason, "finish");
  assert.equal(run.failure_stage, "none");
  assert.equal(run.identity.arm, "baseline");
  assert.equal(run.skailr_diagnostics, null);

  for (const f of ["run.json", "result.json", "events.jsonl", "environment.json", "git.diff", "lifecycle.log", "stdout.log"]) {
    assert.equal(fs.existsSync(path.join(runDir, f)), true, `expected ${f} in run dir`);
  }
  assert.equal(fs.existsSync(path.join(runDir, "otel", "telemetry.json")), true);
});

test("runOne: skailr arm populates skailr_diagnostics (non-null object) and skailr_sha/skailr_version identity fields", async () => {
  const { dir, sha } = mkGitFixture();
  const config = loadConfig();
  const task = baseTask({ fixtureDir: dir, sha });

  const { run } = await runOne({
    task, arm: "skailr", rep: 0, config, mock: true, flavor: "solved",
    runGrader: stubGraderSolved(), resultsRoot: mkTmp("results"), workspaceRoot: mkTmp("wsroot"),
    skailrRef: "HEAD",
  });

  assert.notEqual(run.skailr_diagnostics, null);
  assert.equal(typeof run.skailr_diagnostics.agents_spawned, "number");
  assert.ok(run.identity.skailr_sha);
  assert.ok(run.identity.skailr_version);
});

test("AC-2: simulated wall-clock kill (mock timeout flavor) yields a graded FAILED run recorded with termination_reason, never dropped", async () => {
  const { dir, sha } = mkGitFixture();
  const config = loadConfig();
  const task = baseTask({ fixtureDir: dir, sha });

  const { run } = await runOne({
    task, arm: "baseline", rep: 0, config, mock: true, flavor: "timeout",
    runGrader: stubGraderFailed(), resultsRoot: mkTmp("results"), workspaceRoot: mkTmp("wsroot"),
  });

  const { valid, errors } = validate(run, "run");
  assert.equal(valid, true, JSON.stringify(errors));
  assert.equal(run.outcome.termination_reason, "wall_clock_kill");
  assert.equal(run.outcome.solved, false);
  assert.equal(run.failure_stage, "budget_timeout");
});

test("runOne: a grader that throws still produces a schema-valid failed run.json (grader error never crashes the lifecycle)", async () => {
  const { dir, sha } = mkGitFixture();
  const config = loadConfig();
  const task = baseTask({ fixtureDir: dir, sha });

  const { run } = await runOne({
    task, arm: "baseline", rep: 0, config, mock: true, flavor: "solved",
    runGrader: async () => { throw new Error("grader boom"); },
    resultsRoot: mkTmp("results"), workspaceRoot: mkTmp("wsroot"),
  });

  assert.equal(validate(run, "run").valid, true);
  assert.equal(run.outcome.solved, false);
  assert.ok(run.outcome.critical_failures[0].startsWith("grader_error"));
});

test("runOne: default grader invocation (reconciled seam, MSG-006) runs `node <graderDir>/grade.mjs <workspace>` and reads grader-json from STDOUT", async () => {
  const { dir, sha } = mkGitFixture();
  const config = loadConfig();
  const graderScriptDir = mkTmp("fake-grader"); // NOT under bench/graders — isolation-safe location
  const graderScript = path.join(graderScriptDir, "grade.mjs");
  fs.writeFileSync(graderScript, `
    const workspace = process.argv[2];
    process.stdout.write(JSON.stringify({
      tests: { hidden_functional: { passed: 1, failed: 0, total: 1, cases: [] }, regression: { passed: 0, failed: 0, total: 0, cases: [] } },
      subscores: { functional: 100, regression: 100, security: 100, static: 100, scope: 100, maintainability: 100 },
      quality_score: 100, critical_failures: [], solved: true,
    }));
  `);
  // task.grader is a grader DIRECTORY (absolute here); grade.mjs finds grade.mjs inside it.
  const task = baseTask({ fixtureDir: dir, sha, grader: graderScriptDir });

  const { run } = await runOne({
    task, arm: "baseline", rep: 0, config, mock: true, flavor: "solved",
    resultsRoot: mkTmp("results"), workspaceRoot: mkTmp("wsroot"),
  });

  assert.equal(run.outcome.solved, true);
  assert.equal(validate(run, "run").valid, true);
});

test("FR-11 re-grade: runOne persists a workspace/ snapshot in the run dir; bench:grade re-grades from it WITHOUT re-running the agent", async () => {
  const { dir, sha } = mkGitFixture();
  const config = loadConfig();
  const resultsRoot = mkTmp("results");
  // Real STDOUT grader (reconciled convention), in an isolation-safe dir.
  const graderDir = mkTmp("regrade-grader");
  const graderResult = {
    grader_version: "1", task_id: "t1", task_version: "1", workspace_frozen: true,
    tests: {
      hidden_functional: { passed: 1, failed: 0, total: 1, cases: [{ id: "hf-1", ok: true }] },
      regression: { passed: 0, failed: 0, total: 0, cases: [] },
      security: { passed: 0, failed: 0, total: 0, cases: [] },
      static: { passed: 0, failed: 0, total: 0, cases: [] },
    },
    subscores: { functional: 100, regression: 100, security: 100, static: 100, scope: 100, maintainability: 100 },
    quality_score: 100, critical_failures: [], solved: true,
    solved_inputs: { hidden_functional_all_pass: true, critical_failures_count: 0 },
    determinism: { seed: 1, flaky_retries: 0, majority_vote: false },
    failure_stage_hint: null,
  };
  fs.writeFileSync(path.join(graderDir, "grade.mjs"),
    `process.stdout.write(${JSON.stringify(JSON.stringify(graderResult))});\n`);
  const task = baseTask({ fixtureDir: dir, sha, grader: graderDir });

  const { runDir } = await runOne({
    task, arm: "baseline", rep: 0, config, mock: true, flavor: "solved",
    resultsRoot, workspaceRoot: mkTmp("wsroot"),
  });

  // Snapshot persisted alongside the run.
  const snapshot = path.join(runDir, "workspace");
  assert.equal(fs.existsSync(snapshot), true, "expected workspace/ snapshot in run dir");
  const graderJsonBefore = fs.readFileSync(path.join(runDir, "grader.json"), "utf8");

  // Re-grade from the persisted snapshot (grade.mjs never imports claude.mjs).
  const { runRecord } = regradeRun({ runDir, workspaceDir: snapshot, graderDir });
  assert.equal(fs.existsSync(path.join(runDir, "grader.v2.json")), true);
  assert.equal(fs.existsSync(path.join(runDir, "run.v2.json")), true);
  assert.equal(validate(runRecord, "run").valid, true);
  // Originals untouched (immutability NN).
  assert.equal(fs.readFileSync(path.join(runDir, "grader.json"), "utf8"), graderJsonBefore);
});

test("estimateWorstCaseUsd: sums max_budget_usd across tasks x arms x reps", () => {
  const config = loadConfig();
  const tasks = [{ id: "a" }, { id: "b" }];
  const usd = estimateWorstCaseUsd({ tasks, arms: ["baseline", "skailr"], reps: 3, config });
  assert.equal(usd, config.defaults.max_budget_usd * 2 * 2 * 3);
});

test("NFR cost safety: runCampaign refuses when worst-case spend exceeds --max-campaign-usd", async () => {
  const config = loadConfig();
  const { dir, sha } = mkGitFixture();
  const task = baseTask({ fixtureDir: dir, sha });
  await assert.rejects(
    () => runCampaign({ tasks: [task], reps: 1000, config, maxCampaignUsd: 1, mock: true }),
    /cost guard/
  );
});

test("AC-1: runCampaign completes reps x arms runs unattended in MOCK mode, each schema-valid", async () => {
  const { dir, sha } = mkGitFixture();
  const config = loadConfig();
  const task = baseTask({ fixtureDir: dir, sha });
  const results = await runCampaign({
    tasks: [task], reps: 2, config, mock: true, flavor: "solved",
    runGrader: stubGraderSolved(), resultsRoot: mkTmp("results"), workspaceRoot: mkTmp("wsroot"),
    rng: () => 0.42, // deterministic shuffle for the test
  });
  assert.equal(results.length, 2 * 2); // 2 arms x 2 reps
  for (const { run } of results) {
    assert.equal(validate(run, "run").valid, true);
  }
});

test("campaign_id: runCampaign mints one campaign_id and stamps it into every run.json it writes", async () => {
  const { dir, sha } = mkGitFixture();
  const config = loadConfig();
  const task = baseTask({ fixtureDir: dir, sha });
  const results = await runCampaign({
    tasks: [task], reps: 2, config, mock: true, flavor: "solved",
    runGrader: stubGraderSolved(), resultsRoot: mkTmp("results"), workspaceRoot: mkTmp("wsroot"),
    rng: () => 0.42,
  });
  assert.equal(typeof results.campaignId, "string");
  assert.match(results.campaignId, /^campaign_/);
  for (const { run } of results) {
    assert.equal(run.identity.campaign_id, results.campaignId);
  }
});

test("campaign_id: two separate runCampaign invocations mint different campaign_ids", async () => {
  const { dir, sha } = mkGitFixture();
  const config = loadConfig();
  const task = baseTask({ fixtureDir: dir, sha });
  const a = await runCampaign({
    tasks: [task], reps: 1, config, mock: true, flavor: "solved",
    runGrader: stubGraderSolved(), resultsRoot: mkTmp("results"), workspaceRoot: mkTmp("wsroot"),
  });
  const b = await runCampaign({
    tasks: [task], reps: 1, config, mock: true, flavor: "solved",
    runGrader: stubGraderSolved(), resultsRoot: mkTmp("results"), workspaceRoot: mkTmp("wsroot"),
  });
  assert.notEqual(a.campaignId, b.campaignId);
});

test("campaign_id: runOne without a campaignId opt (e.g. called directly, outside a campaign) omits identity.campaign_id entirely — backward compatible", async () => {
  const { dir, sha } = mkGitFixture();
  const config = loadConfig();
  const task = baseTask({ fixtureDir: dir, sha });
  const { run } = await runOne({
    task, arm: "baseline", rep: 0, config, mock: true, flavor: "solved",
    runGrader: stubGraderSolved(), resultsRoot: mkTmp("results"), workspaceRoot: mkTmp("wsroot"),
  });
  assert.equal(validate(run, "run").valid, true);
  assert.equal("campaign_id" in run.identity, false);
});
