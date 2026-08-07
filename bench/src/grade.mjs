// DOC: grade.mjs is the sole fold point from grader.json (hidden, external
// grader output) into run.json outcome/quality (FR-8). The grader
// entrypoint is invoked OUT-OF-BAND — its directory is passed as a CLI arg
// to a child process, never copied into the agent workspace (isolation
// invariant; see install-arm + fixture-layout contracts, verify-isolation.mjs).
// `bench:grade --run <run_id>` re-grades an already-completed, frozen run
// WITHOUT re-invoking the agent: it writes NEW `grader.v2.json` +
// `run.v2.json` alongside the originals; the original run.json/grader.json
// are never mutated (immutability, brief NN — burned agent spend is never
// re-incurred just to iterate on a grader).
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { validateOrThrow } from "./schema/validate.mjs";
import { atomicWriteValidatedJson, markWritable, markReadOnly } from "./lib/fsutil.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// FR-8 weighted rubric. Same weights the grader-json contract assigns its
// own `quality_score`; recomputed here from the reported component
// `subscores` (rather than trusting the grader's own arithmetic) so
// run.json quality_score is a derived, auditable value at the fold point.
export const RUBRIC_WEIGHTS = Object.freeze({
  functional: 0.6,
  regression: 0.15,
  security: 0.1,
  static: 0.05,
  scope: 0.05,
  maintainability: 0.05,
});

export function computeQualityScore(subscores) {
  let total = 0;
  for (const [key, weight] of Object.entries(RUBRIC_WEIGHTS)) {
    const v = subscores?.[key];
    if (typeof v !== "number" || Number.isNaN(v)) {
      throw new Error(`computeQualityScore: subscores.${key} missing/non-numeric`);
    }
    total += v * weight;
  }
  return Math.round(total * 100) / 100;
}

/**
 * solved = hidden_functional all-pass AND critical_failures empty.
 * Overriding rule: ANY critical_requirements failure forces solved=false
 * regardless of quality_score (brief non-negotiable; AC-4).
 */
export function deriveSolved(graderResult) {
  const hf = graderResult.tests?.hidden_functional;
  const hidden_functional_all_pass = !!hf && hf.total === hf.passed && hf.failed === 0;
  const critical_failures_count = (graderResult.critical_failures || []).length;
  return {
    solved: hidden_functional_all_pass && critical_failures_count === 0,
    hidden_functional_all_pass,
    critical_failures_count,
  };
}

function pickCounts(cat) {
  return { passed: cat.passed, failed: cat.failed, total: cat.total };
}

/**
 * Fold a validated grader.json result into a run.json record's
 * outcome/quality groups. Pure — does not touch disk. `visible_tests` and
 * `termination_reason` are left as the harness already recorded them
 * (grading never re-derives what happened before the workspace was frozen).
 */
export function foldGraderIntoRun(runRecord, graderResult, { grader_s } = {}) {
  const { solved, critical_failures_count } = deriveSolved(graderResult);
  const quality_score = computeQualityScore(graderResult.subscores);
  const folded = JSON.parse(JSON.stringify(runRecord));

  folded.outcome = {
    ...folded.outcome,
    solved,
    hidden_tests: pickCounts(graderResult.tests.hidden_functional),
    regression: pickCounts(graderResult.tests.regression),
    critical_failures: [...(graderResult.critical_failures || [])],
  };
  folded.quality = {
    quality_score,
    subscores: { ...graderResult.subscores },
  };
  if (typeof grader_s === "number") {
    folded.time = { ...folded.time, grader_s };
  }
  // Fold the grader's failure_stage_hint only when the harness hasn't
  // already classified the run more specifically.
  if (graderResult.failure_stage_hint && (!folded.failure_stage || folded.failure_stage === "unclassified")) {
    folded.failure_stage = graderResult.failure_stage_hint;
  } else if (!critical_failures_count && solved) {
    folded.failure_stage = folded.failure_stage === "unclassified" ? "none" : folded.failure_stage;
  }
  return folded;
}

/** Locate a grader's entrypoint: prefer `grade.mjs`, fall back to `grade.sh`. */
export function findGraderEntrypoint(graderDir) {
  const mjs = path.join(graderDir, "grade.mjs");
  const sh = path.join(graderDir, "grade.sh");
  if (fs.existsSync(mjs)) return { kind: "node", file: mjs };
  if (fs.existsSync(sh)) return { kind: "shell", file: sh };
  throw new Error(`grade.mjs: no grader entrypoint (grade.mjs or grade.sh) found in ${graderDir}`);
}

/**
 * Invoke the grader's entrypoint out-of-band: `graderDir` is the working
 * directory / cwd of the child process; `workspaceDir` (the frozen agent
 * workspace) is passed as its sole argument. The grader is expected to
 * print exactly one JSON object (grader-json shape) to stdout.
 */
export function runGraderProcess(graderDir, workspaceDir, { timeoutMs = 5 * 60 * 1000, env } = {}) {
  const entry = findGraderEntrypoint(graderDir);
  const cmd = entry.kind === "node" ? process.execPath : entry.file;
  const args = entry.kind === "node" ? [entry.file, workspaceDir] : [workspaceDir];
  const result = spawnSync(cmd, args, {
    cwd: graderDir,
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
    env: env || process.env,
  });
  if (result.error) {
    throw new Error(`grade.mjs: grader process failed to start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `grade.mjs: grader exited nonzero (${result.status}), stderr: ${(result.stderr || "").slice(0, 2000)}`
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch (err) {
    throw new Error(`grade.mjs: grader stdout was not valid JSON: ${err.message}`);
  }
  return parsed;
}

function readRunRecord(runDir) {
  const runJsonPath = path.join(runDir, "run.json");
  if (!fs.existsSync(runJsonPath)) {
    throw new Error(`grade.mjs: no run.json found at ${runJsonPath}`);
  }
  return JSON.parse(fs.readFileSync(runJsonPath, "utf8"));
}

function assertFrozenWorkspace(graderResult) {
  if (graderResult.workspace_frozen !== true) {
    throw new Error(
      "grade.mjs: grader reported workspace_frozen=false — refusing to fold an ungraded result (isolation/immutability invariant)"
    );
  }
}

/**
 * First-time grading: run the grader against the frozen workspace, validate
 * its output, fold it into the run record, and write BOTH grader.json and
 * the finalized run.json. Intended to be called once per run, at the end of
 * the run lifecycle (e.g. imported by WS-harness-core's run.mjs), before the
 * run dir is marked read-only.
 */
export function gradeRun({ runDir, workspaceDir, graderDir, timeoutMs } = {}) {
  const runRecord = readRunRecord(runDir);
  const startedAt = Date.now();
  const graderResult = runGraderProcess(graderDir, workspaceDir, { timeoutMs });
  const grader_s = (Date.now() - startedAt) / 1000;
  validateOrThrow(graderResult, "grader");
  assertFrozenWorkspace(graderResult);

  const folded = foldGraderIntoRun(runRecord, graderResult, { grader_s });
  atomicWriteValidatedJson(path.join(runDir, "grader.json"), graderResult, "grader");
  atomicWriteValidatedJson(path.join(runDir, "run.json"), folded, "run");
  return { graderResult, runRecord: folded };
}

/**
 * Re-grade mode (`bench:grade --run <run_id>`): re-run the grader against
 * the STORED frozen workspace/diff without re-running the agent. Writes
 * grader.v2.json + run.v2.json; never overwrites run.json/grader.json.
 * Best-effort lifts markReadOnly (fsutil) if the run dir was marked
 * read-only by convention, then restores it.
 */
export function regradeRun({ runDir, workspaceDir, graderDir, timeoutMs } = {}) {
  const originalRun = readRunRecord(runDir);
  const startedAt = Date.now();
  const graderResult = runGraderProcess(graderDir, workspaceDir, { timeoutMs });
  const grader_s = (Date.now() - startedAt) / 1000;
  validateOrThrow(graderResult, "grader");
  assertFrozenWorkspace(graderResult);

  const folded = foldGraderIntoRun(originalRun, graderResult, { grader_s });

  let wasReadOnly = false;
  try {
    fs.accessSync(runDir, fs.constants.W_OK);
  } catch {
    wasReadOnly = true;
  }
  if (wasReadOnly) markWritable(runDir);
  try {
    atomicWriteValidatedJson(path.join(runDir, "grader.v2.json"), graderResult, "grader");
    atomicWriteValidatedJson(path.join(runDir, "run.v2.json"), folded, "run");
  } finally {
    if (wasReadOnly) markReadOnly(runDir);
  }
  return { graderResult, runRecord: folded };
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
      out[key] = val;
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.run) {
    console.error("Usage: bench:grade --run <run_id> [--workspace <path>] [--grader-dir <path>] [--results-dir <path>]");
    process.exitCode = 2;
    return;
  }
  const resultsDir = args["results-dir"] ? path.resolve(args["results-dir"]) : path.resolve(__dirname, "../results");
  const runDir = path.join(resultsDir, args.run);
  const runRecord = readRunRecord(runDir);
  const workspaceDir = args.workspace ? path.resolve(args.workspace) : path.join(runDir, "workspace");
  const graderDir = args["grader-dir"]
    ? path.resolve(args["grader-dir"])
    : path.resolve(__dirname, "../graders", runRecord.identity.task_id);

  const { runRecord: folded } = regradeRun({ runDir, workspaceDir, graderDir });
  console.log(
    `Re-graded ${args.run}: solved=${folded.outcome.solved} quality_score=${folded.quality.quality_score} -> grader.v2.json + run.v2.json`
  );
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error(err.stack || err.message);
    process.exitCode = 1;
  });
}
