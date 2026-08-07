#!/usr/bin/env node
// DOC: hidden grader entrypoint for the patch-webhook fixture (FR-8).
// Invocation (matches bench/src/grade.mjs runGraderProcess): `node grade.mjs
// <frozenWorkspaceAbsPath>`, cwd = this directory. Prints exactly ONE
// grader-json object to stdout and exits 0 (nonzero exit / non-JSON stdout
// is treated by grade.mjs as a hard grading failure, not a "0" score).
// Isolation invariant: this file + its helpers live only under
// bench/graders/patch-webhook/**; it talks to the workspace exclusively
// over HTTP against a child `node src/server.ts` process spawned from the
// path passed as argv[2] — never via relative import of workspace source.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startServer, stopServer, freePort } from "./lib/serverHarness.mjs";
import { runHiddenTests } from "./hidden-tests.mjs";
import { runTypecheck, scanForStubs } from "./lib/staticScan.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED = 42;
const GRADER_VERSION = "1.0.0";
const TASK_ID = "patch-webhook";
const TASK_VERSION = "1.0";
const CRITICAL_REQUIREMENTS = ["exactly-once-processing", "api-contract-preserved", "no-duplicate-ledger-entry"];

function emptyCategory(detail) {
  return { passed: 0, failed: 1, total: 1, cases: [{ id: "grader-error", ok: false, detail: String(detail).slice(0, 2000) }] };
}

function pct(cat) {
  if (!cat || cat.total === 0) return 0;
  return Math.round((cat.passed / cat.total) * 10000) / 100;
}

/**
 * Runs the full grader against `workspaceDir`. Pure-ish: only side effect is
 * spawning/killing a child server process; never writes into workspaceDir.
 */
export async function runGrader(workspaceDir) {
  const determinism = { seed: SEED, flaky_retries: 3, majority_vote: true };
  let hidden_functional, regression, security, criticalSignals, testDeterminism;
  let serverHandle = null;
  let failure_stage_hint = null;

  const serverEntry = path.join(workspaceDir, "src", "server.ts");
  if (!fs.existsSync(serverEntry)) {
    const detail = `src/server.ts not found in workspace at ${workspaceDir}`;
    hidden_functional = emptyCategory(detail);
    regression = emptyCategory(detail);
    security = emptyCategory(detail);
    criticalSignals = {};
    failure_stage_hint = "setup";
  } else {
    try {
      const port = await freePort();
      serverHandle = await startServer(workspaceDir, port);
      const result = await runHiddenTests(serverHandle.base, { trials: 3, concurrency: 25 });
      hidden_functional = result.hidden_functional;
      regression = result.regression;
      security = result.security;
      criticalSignals = result.criticalSignals;
      testDeterminism = result.determinism;
    } catch (err) {
      const detail = `server/test-run failure: ${err.stack || err.message || err}`;
      hidden_functional = emptyCategory(detail);
      regression = emptyCategory(detail);
      security = emptyCategory(detail);
      criticalSignals = {};
      failure_stage_hint = "execution";
    } finally {
      stopServer(serverHandle);
    }
  }

  // --- static: typecheck ---
  const tc = runTypecheck(workspaceDir);
  const staticCases = [{ id: "static-typecheck", ok: tc.ok, detail: tc.detail }];
  const staticCat = {
    passed: staticCases.filter((c) => c.ok).length,
    failed: staticCases.filter((c) => !c.ok).length,
    total: staticCases.length,
    cases: staticCases,
  };

  // --- maintainability: TODO/stub scan (not a "tests" category per schema;
  // folded straight into the subscore) ---
  const stubHits = scanForStubs(workspaceDir, ["src"]);
  const maintainability = Math.max(0, 100 - stubHits.length * 20);

  // --- scope: contract-preservation proxy (regression + security all pass) ---
  const contractPreserved = regression.failed === 0 && security.failed === 0 && regression.total > 0;
  const scope = contractPreserved ? 100 : Math.max(0, 100 - (regression.failed + security.failed) * 15);

  const subscores = {
    functional: pct(hidden_functional),
    regression: pct(regression),
    security: pct(security),
    static: tc.ok ? 100 : 0,
    scope,
    maintainability,
  };

  const critical_failures = [];
  if (criticalSignals["exactly-once-processing"] === false) critical_failures.push("exactly-once-processing");
  if (criticalSignals["no-duplicate-ledger-entry"] === false) critical_failures.push("no-duplicate-ledger-entry");
  if (criticalSignals["api-contract-preserved"] === false) critical_failures.push("api-contract-preserved");

  const hidden_functional_all_pass = hidden_functional.total > 0 && hidden_functional.total === hidden_functional.passed && hidden_functional.failed === 0;
  const critical_failures_count = critical_failures.length;
  const solved = hidden_functional_all_pass && critical_failures_count === 0;

  const quality_score =
    Math.round(
      (subscores.functional * 0.6 +
        subscores.regression * 0.15 +
        subscores.security * 0.1 +
        subscores.static * 0.05 +
        subscores.scope * 0.05 +
        subscores.maintainability * 0.05) *
        100
    ) / 100;

  if (!failure_stage_hint && !solved) {
    failure_stage_hint = critical_failures_count > 0 ? "grading" : "grading";
  }

  return {
    grader_version: GRADER_VERSION,
    task_id: TASK_ID,
    task_version: TASK_VERSION,
    workspace_frozen: true,
    tests: { hidden_functional, regression, security, static: staticCat },
    subscores,
    quality_score,
    critical_failures,
    solved,
    solved_inputs: { hidden_functional_all_pass, critical_failures_count },
    determinism: {
      seed: determinism.seed,
      flaky_retries: testDeterminism ? testDeterminism.trials - 1 : determinism.flaky_retries,
      majority_vote: determinism.majority_vote,
    },
    failure_stage_hint: solved ? null : failure_stage_hint,
  };
}

async function main() {
  const workspaceDir = process.argv[2];
  if (!workspaceDir) {
    console.error("Usage: node grade.mjs <frozenWorkspaceAbsPath>");
    process.exitCode = 2;
    return;
  }
  const result = await runGrader(path.resolve(workspaceDir));
  process.stdout.write(JSON.stringify(result));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error(err.stack || err.message);
    process.exitCode = 1;
  });
}
