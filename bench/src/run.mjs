// DOC: F-012/F-013 — per-run lifecycle (FR-4), installArm (install-arm
// contract, Q2), and campaign runner + CLI (FR-11). This is the single
// orchestrator; claude.mjs/telemetry.mjs are pure collaborators it calls.
//
// Lifecycle stages (each logged to `<runDir>/lifecycle.log`), matching FR-4
// exactly: clean fixture -> fresh git checkout at fixture_sha -> setup cmds
// -> installArm -> launch claude headless -> capture telemetry+stream-json
// -> terminate (finish|budget|turns|wall_clock_kill) -> freeze workspace
// (read-only) -> extract skailr diagnostics -> run external hidden grader
// (out-of-band grader path/process, never copied into workspace) -> capture
// git diff vs fixture_sha -> write schema-valid run.json -> mark run
// immutable. A failure at ANY stage still yields a written, schema-valid,
// failed run.json (never silently dropped — brief non-negotiable).
import { execFileSync, execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadAndVerifyConfig, getLiveEnv } from "./lib/config.mjs";
import { deriveSeriesId, deriveRunId, mintCampaignId } from "./lib/ids.mjs";
import { ensureDir, atomicWriteJson, atomicWriteValidatedJson, markReadOnly } from "./lib/fsutil.mjs";
import { invokeClaude, buildLaunchPrompt } from "./claude.mjs";
import { buildTelemetryEnv, buildTelemetry } from "./telemetry.mjs";
import { runGraderProcess } from "./grade.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BENCH_ROOT = path.resolve(__dirname, "..");
const SKAILR_REPO_ROOT = path.resolve(BENCH_ROOT, ".."); // this repo's root (contains .claude/)

export class InstallArmError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "InstallArmError";
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// installArm — install-arm contract (Q2). The workspace-materialization
// difference between baseline/skailr. The *task-authored* prompt
// (task.prompt) is byte-identical across arms; the leading Skailr
// slash-command line (task.command) is the one deliberate, code-constructed
// per-arm difference in what's actually sent to the CLI — see
// buildLaunchPrompt in claude.mjs.
// ---------------------------------------------------------------------------
export async function installArm(arm, ref, workspace, opts = {}) {
  const skailrRepoRoot = opts.skailrRepoRoot || SKAILR_REPO_ROOT;

  if (arm === "baseline") {
    return { arm, installed: false, skailr_sha: null, skailr_version: null, artifacts_root: null };
  }
  if (arm !== "skailr") {
    throw new InstallArmError(`installArm: unknown arm "${arm}"`, "bad_ref");
  }
  if (!fs.existsSync(workspace)) {
    throw new InstallArmError(`installArm: workspace missing: ${workspace}`, "workspace_missing");
  }

  let sha;
  try {
    sha = execFileSync("git", ["-C", skailrRepoRoot, "rev-parse", ref], { encoding: "utf8" }).trim();
  } catch (err) {
    throw new InstallArmError(`installArm: bad ref "${ref}" in ${skailrRepoRoot}: ${err.message}`, "bad_ref");
  }

  let installed_paths;
  try {
    // Materialize EXACTLY what install.sh ships (MSG-007 fidelity), archived at
    // the pinned sha and piped to tar. Allowlist ONLY — so bench/** is never
    // copied (invariant holds by construction), `.claude/experts/` (consumer
    // roster) is NEVER shipped, and the source repo's own `.claude/program/`
    // runtime (ledger/brief/plan/contracts/workstreams + non-template channel
    // content) and `.claude/tmp/` contents are excluded. Empty tmp/program/repo
    // dirs are created afterward (install.sh does `mkdir`).
    const pathspecs = [
      "CLAUDE.md",
      "scripts/skailr", "scripts/hooks",
      ".claude/agents", ".claude/commands", ".claude/teams/registry.md", ".claude/skills",
      ".claude/program/schemas",
      ".claude/program/channels/PROTOCOL.md",
      ".claude/program/channels/program.md",
      ".claude/program/channels/feature.md",
      ".claude/settings.skailr.json", ".claude/intake.md", ".claude/model-routing.json",
    ].filter((p) => execFileSync("git", ["-C", skailrRepoRoot, "ls-tree", sha, "--", p], { encoding: "utf8" }).trim() !== "");

    const archiveProc = spawnSync("git", ["-C", skailrRepoRoot, "archive", sha, "--", ...pathspecs], {
      maxBuffer: 1024 * 1024 * 256,
    });
    if (archiveProc.status !== 0 || archiveProc.error) {
      throw new Error((archiveProc.stderr || archiveProc.error?.message || "unknown git archive failure").toString());
    }
    const tarProc = spawnSync("tar", ["-x", "-C", workspace], {
      input: archiveProc.stdout,
      maxBuffer: 1024 * 1024 * 256,
    });
    if (tarProc.status !== 0 || tarProc.error) {
      throw new Error((tarProc.stderr || tarProc.error?.message || "unknown tar extract failure").toString());
    }

    // Empty runtime dirs (install.sh mkdir -p) — created, never populated.
    for (const d of [".claude/tmp", ".claude/program", ".claude/repo"]) ensureDir(path.join(workspace, d));

    // Exact shipped-pack file set (repo-relative == workspace-relative), so the
    // diagnostics extractor can exclude these git-tracked docs and count only
    // agent-produced artifacts (MSG-007 diagnostics floor).
    installed_paths = new Set(
      execFileSync("git", ["-C", skailrRepoRoot, "ls-tree", "-r", "--name-only", sha, "--", ...pathspecs], { encoding: "utf8" })
        .split("\n").map((s) => s.trim()).filter(Boolean)
    );
  } catch (err) {
    throw new InstallArmError(`installArm: archive failed for ref "${ref}" (sha ${sha}): ${err.message}`, "archive_failed");
  }

  let skailr_version = null;
  try {
    skailr_version = execFileSync("git", ["-C", skailrRepoRoot, "show", `${sha}:package.json`], { encoding: "utf8" });
    skailr_version = JSON.parse(skailr_version).version || null;
  } catch {
    skailr_version = sha.slice(0, 10); // fallback: short sha, always available
  }

  return { arm, installed: true, skailr_sha: sha, skailr_version, artifacts_root: path.join(workspace, ".claude"), installed_paths };
}

// ---------------------------------------------------------------------------
// Fixture checkout — "fresh git checkout at fixture_sha" stage (FR-4).
//
// PHASE-C RECONCILIATION (integration-verifier): WS-fixtures ships fixtures as
// PLAIN FILES (nested .git removed) with a `.fixture-sha` integrity file and
// `fixture_sha` recorded in task.yaml — there is no clonable repo on disk. The
// original impl `git clone --local <fixtureDir>` cannot check out a repo that
// isn't there. Reconciled: if the fixture dir IS a git repo (legacy / test
// fixtures), keep the clone+checkout path unchanged; otherwise materialize a
// clean workspace by COPYING the fixture tree into the isolated temp workspace,
// verifying integrity against `.fixture-sha`==`fixture_sha`, then `git init` +
// baseline commit so the later "git diff vs fixture_sha" stage has a base.
// ---------------------------------------------------------------------------
export function checkoutFixture(fixtureDir, fixtureSha, workspace) {
  fs.rmSync(workspace, { recursive: true, force: true });
  ensureDir(path.dirname(workspace));

  if (fs.existsSync(path.join(fixtureDir, ".git"))) {
    // Real git-repo fixture: fresh local clone + detached checkout at sha.
    execFileSync("git", ["clone", "--quiet", "--local", "--no-hardlinks", fixtureDir, workspace]);
    execFileSync("git", ["-C", workspace, "checkout", "--quiet", fixtureSha]);
    return;
  }

  // Plain-file fixture (Phase C): verify integrity, copy, git-init a baseline.
  const shaFile = path.join(fixtureDir, ".fixture-sha");
  if (fs.existsSync(shaFile)) {
    const recorded = fs.readFileSync(shaFile, "utf8").trim();
    if (fixtureSha && recorded && recorded !== fixtureSha) {
      throw new Error(
        `fixture integrity mismatch: .fixture-sha (${recorded}) != task.fixture_sha (${fixtureSha}) in ${fixtureDir}`
      );
    }
  }
  ensureDir(workspace);
  fs.cpSync(fixtureDir, workspace, {
    recursive: true,
    filter: (src) => path.basename(src) !== ".git",
  });
  execFileSync("git", ["-C", workspace, "init", "--quiet"]);
  execFileSync("git", ["-C", workspace, "add", "-A"]);
  execFileSync("git", [
    "-C", workspace,
    "-c", "user.email=bench@skailr.local",
    "-c", "user.name=skailr-bench",
    "commit", "--quiet", "--allow-empty", "-m", `fixture baseline ${fixtureSha || ""}`.trim(),
  ]);
}

export function runSetupCommands(workspace, setup = []) {
  for (const cmd of setup) {
    execSync(cmd, { cwd: workspace, stdio: "pipe" });
  }
}

/** Coarse visible-test run: honors fixture.manifest.json's visible_test_cmd
 * if present (fixture-layout contract); exit code only (pass/fail as a
 * single case) until WS-fixtures ships real fixtures with a documented
 * per-case output convention for finer-grained counts (Phase C follow-up). */
export function runVisibleTests(workspace) {
  const manifestPath = path.join(workspace, "fixture.manifest.json");
  if (!fs.existsSync(manifestPath)) return { passed: 0, failed: 0, total: 0 };
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    return { passed: 0, failed: 0, total: 0 };
  }
  if (!manifest.visible_test_cmd) return { passed: 0, failed: 0, total: 0 };
  const proc = spawnSync(manifest.visible_test_cmd, { cwd: workspace, shell: true, encoding: "utf8" });
  const ok = proc.status === 0;
  return { passed: ok ? 1 : 0, failed: ok ? 0 : 1, total: 1 };
}

/** Q4: copy + best-effort parse Skailr on-disk diagnostics artifacts. Dual
 * source per brief — this is the "artifacts" side; OTel resource attrs are
 * the fallback (telemetry.mjs), not implemented as a second counter here
 * since no live OTel sample exists yet (see telemetry.mjs top comment). */
export function extractSkailrDiagnostics(workspace, runDir, shippedPaths = new Set()) {
  const destRoot = path.join(runDir, "skailr-artifacts");
  const sources = [path.join(workspace, ".claude", "program"), path.join(workspace, ".claude", "tmp")];
  let copiedAny = false;
  for (const src of sources) {
    if (!fs.existsSync(src)) continue;
    copiedAny = true;
    const dest = path.join(destRoot, path.basename(src));
    fs.cpSync(src, dest, { recursive: true });
  }
  const zero = { agents_spawned: 0, inter_agent_messages: 0, blockers: 0, contract_events: 0, gate_failures: 0, validator_findings: 0 };
  if (!copiedAny) return zero;

  // Count ONLY agent-produced artifacts: scan the live workspace under
  // .claude/program + .claude/tmp but EXCLUDE the git-tracked shipped-pack docs
  // installArm materialized (channels/PROTOCOL.md, schemas/*, etc.). Counting
  // those shipped `type:`/schema tokens created a false nonzero floor (MSG-007).
  let text = "";
  for (const src of sources) {
    for (const file of walkFiles(src)) {
      if (!(file.endsWith(".md") || file.endsWith(".json"))) continue;
      const rel = path.relative(workspace, file);
      if (shippedPaths.has(rel)) continue; // shipped pack doc — not agent signal
      try { text += fs.readFileSync(file, "utf8") + "\n"; } catch { /* unreadable, skip */ }
    }
  }
  if (text === "") return zero;
  const count = (re) => (text.match(re) || []).length;
  return {
    agents_spawned: count(/^\|?\s*[\w-]+\s*(@\s*Task|dispatched)/gim) || count(/role:\s*\w/gim),
    inter_agent_messages: count(/^type:\s*\w+/gim),
    blockers: count(/type:\s*blocker/gim),
    contract_events: count(/type:\s*contract-change/gim),
    gate_failures: count(/gate.*fail|status:\s*fail/gim),
    validator_findings: count(/type:\s*(finding|validator)/gim),
  };
}

function walkFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full));
    else out.push(full);
  }
  return out;
}

/** git diff vs fixture_sha -> writes <runDir>/git.diff, returns code stats. */
export function captureDiff(workspace, fixtureSha, runDir) {
  let diffText = "";
  let numstat = "";
  // Phase-C reconcile: for copied plain-file fixtures the workspace repo is a
  // fresh `git init` whose baseline commit == the fixture tree (verified
  // against `.fixture-sha`), so `fixture_sha` is not a resolvable rev here.
  // Diff against the baseline commit (HEAD) when the sha is unknown to the repo.
  let base = fixtureSha;
  try {
    execFileSync("git", ["-C", workspace, "cat-file", "-e", `${fixtureSha}^{commit}`], { stdio: "ignore" });
  } catch {
    base = "HEAD";
  }
  try {
    diffText = execFileSync("git", ["-C", workspace, "diff", base], { encoding: "utf8", maxBuffer: 1024 * 1024 * 200 });
    numstat = execFileSync("git", ["-C", workspace, "diff", "--numstat", base], { encoding: "utf8", maxBuffer: 1024 * 1024 * 200 });
  } catch (err) {
    diffText = `<git diff failed: ${err.message}>`;
  }
  fs.writeFileSync(path.join(runDir, "git.diff"), diffText, "utf8");
  let lines_added = 0, lines_removed = 0, files_edited = 0;
  for (const line of numstat.trim().split("\n").filter(Boolean)) {
    const [add, rem] = line.split("\t");
    lines_added += parseInt(add, 10) || 0;
    lines_removed += parseInt(rem, 10) || 0;
    files_edited++;
  }
  return { lines_added, lines_removed, files_edited, diff_bytes: Buffer.byteLength(diffText, "utf8") };
}

function classifyFailureStage({ termination_reason, grade, setupFailed, installFailed, checkoutFailed }) {
  if (checkoutFailed) return "unclassified";
  if (installFailed) return "unclassified";
  if (setupFailed) return "unclassified";
  if (termination_reason === "wall_clock_kill" || termination_reason === "budget" || termination_reason === "turns") {
    return "budget_timeout";
  }
  if (termination_reason === "crash" || termination_reason === "nonzero_exit") return "unclassified";
  if (!grade) return "unclassified";
  if (grade.solved) return "none";
  if (grade.critical_failures && grade.critical_failures.length > 0) return "validation";
  const hf = grade.tests?.hidden_functional;
  if (hf && hf.failed > 0) return "implementation";
  return "unclassified";
}

function zeroTestCounts() { return { passed: 0, failed: 0, total: 0 }; }
// grader.json test-category objects carry an extra `cases[]` array
// (grader-json contract); run.json's testCounts shape is stricter
// (additionalProperties:false, passed/failed/total only) — project down.
function toTestCounts(g) {
  if (!g) return zeroTestCounts();
  return { passed: g.passed || 0, failed: g.failed || 0, total: g.total || 0 };
}
function zeroSubscores() { return { functional: 0, regression: 0, security: 0, static: 0, scope: 0, maintainability: 0 }; }

function fallbackGrade(reason) {
  return {
    tests: { hidden_functional: zeroTestCounts(), regression: zeroTestCounts() },
    subscores: zeroSubscores(),
    quality_score: 0,
    critical_failures: [`grader_error:${reason}`],
    solved: false,
  };
}

/** Default grader invocation — RECONCILED grader seam (MSG-006, integration-
 * verifier Phase C). The frozen convention (grade.mjs::runGraderProcess, which
 * all three real graders implement) is: `node <graderDir>/grade.mjs
 * <frozenWorkspaceAbs>` with cwd=<graderDir>, grader prints exactly one
 * grader-json object to STDOUT and exits 0. `task.grader` is a repo-root-
 * relative grader DIRECTORY (e.g. "bench/graders/patch-webhook"), resolved
 * against the repo root. The prior impl used a stale convention
 * (`node <graderEntry> <ws> <outFile>` writing to a file) — that is the drift
 * this seam existed to catch. Delegates to grade.mjs::runGraderProcess so the
 * run.mjs -> grade.mjs -> grader chain is one wired path. grader.json is
 * persisted to the run dir for the FR-5 artifact set. Injectable via
 * opts.runGrader for unit tests. `gradersRoot` kept for bare-name fallback. */
async function defaultRunGrader(workspace, task, runDir, { gradersRoot }) {
  let graderDir;
  if (path.isAbsolute(task.grader)) graderDir = task.grader;
  else if (task.grader.includes("/")) graderDir = path.resolve(SKAILR_REPO_ROOT, task.grader);
  else graderDir = path.join(gradersRoot, task.grader);
  const grade = runGraderProcess(graderDir, workspace, {});
  fs.writeFileSync(path.join(runDir, "grader.json"), JSON.stringify(grade, null, 2) + "\n", "utf8");
  return grade;
}

// ---------------------------------------------------------------------------
// runOne — single-run lifecycle. ALWAYS resolves (never throws) so a
// campaign never drops a run; failures at any stage become a recorded
// failed run.json (AC-2 non-negotiable).
// ---------------------------------------------------------------------------
export async function runOne(opts) {
  const {
    task, arm, rep, config,
    skailrRef = "HEAD",
    fixturesRoot = path.join(BENCH_ROOT, "fixtures"),
    gradersRoot = path.join(BENCH_ROOT, "graders"),
    resultsRoot = path.join(BENCH_ROOT, "results"),
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "bench-ws-")),
    mock = false,
    flavor = "solved",
    claudeBin = "claude",
    runGrader,
    skailrRepoRoot,
    // campaignId: minted once per campaign invocation (see lib/ids.mjs
    // mintCampaignId) and stamped into identity below so a campaign's own
    // report can scope itself to exactly the runs it produced, instead of
    // every run.json ever written into the shared results/ namespace (see
    // "Known issues" in bench/README.md). Optional — undefined when runOne
    // is called directly (e.g. in unit tests) outside of runCampaign.
    campaignId,
  } = opts;

  const timestamp = new Date().toISOString();
  const series_id = deriveSeriesId({ claude_code_version: config.claude_code_version, model_id: config.model });
  const run_id = deriveRunId({ task_id: task.id, arm, rep, series_id, timestamp });
  const runDir = path.join(resultsRoot, run_id);
  const workspace = path.join(workspaceRoot, run_id);
  ensureDir(runDir);

  const log = [];
  const stage = (name) => log.push(`${new Date().toISOString()} ${name}`);

  let checkoutFailed = false, installFailed = false, setupFailed = false;
  let claudeResult = null;
  let installResult = { arm, installed: false, skailr_sha: null, skailr_version: null, artifacts_root: null };
  let grade = null;
  let diagnostics = null;
  let diffStats = { lines_added: 0, lines_removed: 0, files_edited: 0, diff_bytes: 0 };
  let visible_tests = zeroTestCounts();
  let filesRead = 0;

  try {
    stage("clean-fixture+checkout");
    // task.fixture is a repo-root-relative path ("bench/fixtures/<x>") per
    // task-config; resolve against the repo root. Bare names (tests) fall back
    // to fixturesRoot; absolute paths (tests) used verbatim.
    let fixtureDir;
    if (path.isAbsolute(task.fixture)) fixtureDir = task.fixture;
    else if (task.fixture.includes("/")) fixtureDir = path.resolve(SKAILR_REPO_ROOT, task.fixture);
    else fixtureDir = path.join(fixturesRoot, task.fixture);
    checkoutFixture(fixtureDir, task.fixture_sha, workspace);
  } catch (err) {
    checkoutFailed = true;
    log.push(`checkout failed: ${err.message}`);
  }

  if (!checkoutFailed) {
    try {
      stage("setup");
      runSetupCommands(workspace, task.setup || []);
    } catch (err) {
      setupFailed = true;
      log.push(`setup failed: ${err.message}`);
    }
  }

  if (!checkoutFailed && !setupFailed) {
    try {
      stage("install-arm");
      installResult = await installArm(arm, skailrRef, workspace, { skailrRepoRoot });
    } catch (err) {
      installFailed = true;
      log.push(`installArm failed: ${err.message}`);
    }
  }

  if (!checkoutFailed && !setupFailed && !installFailed) {
    stage("launch-claude");
    const env = buildTelemetryEnv({ task_id: task.id, arm, run_id, skailr_version: installResult.skailr_version });
    const maxBudgetUsd = task.limits?.max_budget_usd ?? config.defaults.max_budget_usd;
    const maxTurns = task.limits?.max_turns ?? config.defaults.max_turns;
    const timeoutMs = (task.limits?.wall_clock_timeout_min ?? config.defaults.wall_clock_timeout_min ?? 45) * 60 * 1000;
    try {
      claudeResult = await invokeClaude({
        prompt: buildLaunchPrompt(task, arm), model: config.model, cwd: workspace, runDir,
        maxBudgetUsd, timeoutMs, env, mock, flavor, claudeBin, maxTurns,
      });
      stage(`terminate:${claudeResult.termination_reason}`);
    } catch (err) {
      log.push(`claude invocation crashed: ${err.message}`);
      claudeResult = {
        sessionId: null, promptId: null, events: [], resultEvent: null,
        exitCode: null, signal: null, killedByTimeout: false,
        termination_reason: "crash", wall_clock_s: 0,
      };
    }

    stage("visible-tests");
    visible_tests = runVisibleTests(workspace);

    stage("freeze-workspace");
    try { markReadOnly(workspace); } catch { /* best-effort */ }

    stage("extract-skailr-diagnostics");
    diagnostics = arm === "baseline" ? null : extractSkailrDiagnostics(workspace, runDir, installResult.installed_paths);

    stage("run-grader");
    try {
      const grader = runGrader || ((ws, t, rd) => defaultRunGrader(ws, t, rd, { gradersRoot }));
      grade = await grader(workspace, task, runDir);
    } catch (err) {
      log.push(`grader failed: ${err.message}`);
      grade = fallbackGrade(err.message);
    }

    stage("capture-diff");
    diffStats = captureDiff(workspace, task.fixture_sha, runDir);
    filesRead = (claudeResult.events || []).filter((e) => e.type === "tool_use" && e.name === "Read").length;

    // Persist the frozen workspace snapshot into the run dir so a later
    // `bench:grade --run <id>` can RE-GRADE without re-invoking the agent
    // (FR-11 re-grade / NN "re-grading must not re-run the agent"). grade.mjs
    // defaults its workspaceDir to <runDir>/workspace. .git is excluded (the
    // grader never needs it; git.diff already captures the agent's changes).
    stage("persist-workspace-snapshot");
    try {
      fs.cpSync(workspace, path.join(runDir, "workspace"), {
        recursive: true,
        filter: (src) => path.basename(src) !== ".git",
      });
    } catch (err) {
      log.push(`workspace snapshot failed: ${err.message}`);
    }
  }

  const termination_reason = claudeResult?.termination_reason
    || (checkoutFailed || setupFailed || installFailed ? "crash" : "crash");

  const telemetry = claudeResult
    ? buildTelemetry({
        runDir, sessionId: claudeResult.sessionId, promptId: claudeResult.promptId,
        model: config.model, resultEvent: claudeResult.resultEvent, events: claudeResult.events || [],
        pricingTable: config.pricing_table, modelId: config.model,
      })
    : {
        usage: { tokens: { input: 0, output: 0, cache_read: 0, cache_create: 0 }, by_model: {}, by_source: { main: { input: 0, output: 0, cache_read: 0, cache_create: 0 }, subagent: { input: 0, output: 0, cache_read: 0, cache_create: 0 }, auxiliary: { input: 0, output: 0, cache_read: 0, cache_create: 0 } }, by_agent: {} },
        trajectory: { model_requests: 0, tool_calls: 0, failed_tool_calls: 0, retries: 0, compactions: 0 },
        cost: { cost_reported_usd: null, cost_reconstructed_usd: 0, pricing_table_version: config.pricing_table.version },
      };

  const failure_stage = classifyFailureStage({
    termination_reason, grade, setupFailed, installFailed, checkoutFailed,
  });

  const run = {
    identity: {
      run_id, series_id, task_id: task.id, task_version: task.version, arm,
      skailr_sha: installResult.skailr_sha, skailr_version: installResult.skailr_version,
      fixture_sha: task.fixture_sha, timestamp,
      ...(campaignId ? { campaign_id: campaignId } : {}),
    },
    environment: {
      claude_code_version: config.claude_code_version, model_id: config.model,
      os: `${os.platform()}-${os.release()}`, container: config.container_image ?? null,
      node_version: process.version.replace(/^v/, ""),
    },
    outcome: {
      solved: grade ? !!grade.solved : false,
      termination_reason,
      visible_tests,
      hidden_tests: toTestCounts(grade?.tests?.hidden_functional),
      regression: toTestCounts(grade?.tests?.regression),
      critical_failures: grade?.critical_failures || [],
    },
    quality: {
      quality_score: grade?.quality_score ?? 0,
      subscores: grade?.subscores || zeroSubscores(),
    },
    time: {
      wall_clock_s: claudeResult?.wall_clock_s ?? 0,
      claude_active_s: claudeResult?.wall_clock_s ?? 0,
      time_to_first_edit_s: null,
      grader_s: 0,
    },
    usage: telemetry.usage,
    cost: telemetry.cost,
    trajectory: telemetry.trajectory,
    code: {
      files_read: filesRead,
      files_edited: diffStats.files_edited,
      lines_added: diffStats.lines_added,
      lines_removed: diffStats.lines_removed,
      diff_bytes: diffStats.diff_bytes,
    },
    process: { test_executions: 0, test_failures: 0, repair_loops: 0 },
    skailr_diagnostics: diagnostics,
    failure_stage,
  };

  fs.writeFileSync(path.join(runDir, "lifecycle.log"), log.join("\n") + "\n", "utf8");
  atomicWriteJson(path.join(runDir, "environment.json"), {
    ...run.environment,
    live_captured_at: timestamp,
  });

  stage("write-run-json");
  atomicWriteValidatedJson(path.join(runDir, "run.json"), run, "run");

  stage("mark-immutable");
  try { markReadOnly(runDir); } catch { /* best-effort; runDir still valid */ }

  return { run, runDir, workspace };
}

// ---------------------------------------------------------------------------
// Campaign runner (F-013) — reps, randomized arm order, sequential default /
// --parallel N, --smoke, --max-campaign-usd cost guard.
// ---------------------------------------------------------------------------
function shuffle(arr, rng = Math.random) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Refuse a campaign whose worst-case spend exceeds --max-campaign-usd
 * (default 100) — NFR cost safety. Worst case = Σ per-planned-run
 * max_budget_usd (task override or config default). */
export function estimateWorstCaseUsd({ tasks, arms, reps, config }) {
  let total = 0;
  for (const task of tasks) {
    const perRun = task.limits?.max_budget_usd ?? config.defaults.max_budget_usd;
    total += perRun * arms.length * reps;
  }
  return total;
}

/** FR-1: config.container_image, if set, means "runs execute inside it" — but
 * containerized execution is NOT implemented in V1. Rather than silently ignore
 * the knob (a false isolation guarantee), fail fast at campaign start. Default
 * config leaves it null (unaffected). */
export function assertContainerSupported(config) {
  if (config?.container_image != null) {
    throw new Error(
      `container_image set ("${config.container_image}") but container execution is not implemented in V1; unset it or run V2`
    );
  }
}

export async function runCampaign(opts) {
  const {
    tasks, arms = ["baseline", "skailr"], reps, smoke = false,
    maxCampaignUsd = 100, parallel = 1, config, rng,
    // One campaign_id per runCampaign() invocation — freshly minted unless
    // the caller supplies one (tests / re-entrant callers), never derived
    // from series_id (see lib/ids.mjs). Stamped into every run this
    // invocation writes so a campaign's own runs can be told apart from
    // whatever else is sitting in the shared results/ directory.
    campaignId = mintCampaignId(),
  } = opts;
  assertContainerSupported(config);
  const repsEff = smoke ? 1 : (reps ?? config.defaults.repetitions);

  const worstCase = estimateWorstCaseUsd({ tasks, arms, reps: repsEff, config });
  if (worstCase > maxCampaignUsd) {
    throw new Error(
      `cost guard: worst-case campaign spend $${worstCase.toFixed(2)} exceeds --max-campaign-usd $${maxCampaignUsd}`
    );
  }

  let plan = [];
  for (const task of tasks) {
    for (let rep = 0; rep < repsEff; rep++) {
      for (const arm of arms) plan.push({ task, arm, rep });
    }
  }
  plan = shuffle(plan, rng);

  if (parallel > 1) {
    const results = new Array(plan.length);
    let idx = 0;
    async function worker() {
      while (idx < plan.length) {
        const i = idx++;
        const { task, arm, rep } = plan[i];
        results[i] = await runOne({ ...opts, task, arm, rep, campaignId });
      }
    }
    await Promise.all(Array.from({ length: Math.min(parallel, plan.length) }, worker));
    results.campaignId = campaignId;
    return results;
  }

  const results = [];
  for (const { task, arm, rep } of plan) {
    results.push(await runOne({ ...opts, task, arm, rep, campaignId }));
  }
  results.campaignId = campaignId;
  return results;
}

// ---------------------------------------------------------------------------
// CLI (FR-11)
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const out = { parallel: 1 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--task") out.task = argv[++i];
    else if (a === "--variant") out.variant = argv[++i];
    else if (a === "--skailr-ref") out.skailrRef = argv[++i];
    else if (a === "--reps") out.reps = parseInt(argv[++i], 10);
    else if (a === "--smoke") out.smoke = true;
    else if (a === "--max-campaign-usd") out.maxCampaignUsd = parseFloat(argv[++i]);
    else if (a === "--parallel") out.parallel = parseInt(argv[++i], 10);
    else if (a === "--mock") out.mock = true;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadAndVerifyConfig({ live: process.env.BENCH_MOCK === "1" ? getLiveEnvSafe() : undefined });
  const mock = args.mock || process.env.BENCH_MOCK === "1";
  const arms = args.variant ? [args.variant] : ["baseline", "skailr"];

  const { parseYaml } = await import("./lib/yaml.mjs");
  const tasksDir = path.join(BENCH_ROOT, "tasks");
  // --task <id> runs one task; omitting it runs every task in tasks/ (the
  // whole suite — this is what `--smoke` means in FR-11: "1 rep/task").
  const taskIds = args.task
    ? [args.task]
    : fs.readdirSync(tasksDir).filter((f) => f.endsWith(".yaml")).map((f) => f.replace(/\.yaml$/, "")).sort();
  if (taskIds.length === 0) throw new Error(`no tasks found in ${tasksDir}`);
  const tasks = taskIds.map((id) => parseYaml(fs.readFileSync(path.join(tasksDir, `${id}.yaml`), "utf8")));

  const results = await runCampaign({
    tasks, arms, reps: args.reps, smoke: args.smoke,
    maxCampaignUsd: args.maxCampaignUsd ?? 100, parallel: args.parallel,
    config, skailrRef: args.skailrRef || "HEAD", mock,
  });
  console.log(`bench: completed ${results.length} runs across ${taskIds.length} task(s) [${taskIds.join(", ")}]. See bench/results/<run_id>/run.json`);
  // Printed clearly on its own line so an operator or CI step can grep/capture
  // it — pass to `publish-campaign.mjs --campaign-id <id>` (or `aggregateCampaign`/
  // `listRunRecords`'s `campaignId` option) to scope reporting to exactly this
  // invocation's runs, instead of everything sitting in results/ (see "Known
  // issues" in bench/README.md).
  console.log(`bench: campaign_id=${results.campaignId}`);
}

function getLiveEnvSafe() {
  try { return getLiveEnv(); } catch { return undefined; }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error(`bench: fatal: ${err.message}`);
    process.exit(1);
  });
}
