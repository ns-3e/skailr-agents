#!/usr/bin/env node
// DOC: hidden grader entrypoint for program-rbac (FR-8). Invocation matches
// bench/src/grade.mjs runGraderProcess: `node grade.mjs
// <frozenWorkspaceAbsPath>`, cwd=this dir; prints ONE grader-json object to
// stdout, exit 0. Isolation: lives only under bench/graders/program-rbac/**.
// Hosts the workspace's own apps/api/src/server.ts createServer()
// IN-PROCESS (dynamic import of the declared "api" entrypoint) sharing
// module state with dynamic imports of the declared "db"/"email_adapter"
// entrypoints plus the (undeclared but manifest-stable) packages/audit
// module, so it can seed org/user fixtures the same way
// apps/api/test/helpers.ts does (no signup endpoint) and read back through
// ONLY pre-existing stable accessors (audit.listEvents, email.findEmailsTo).
// New invitation/RBAC behavior is exercised strictly over HTTP (black-box).
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runHiddenTests } from "./hidden-tests.mjs";
import { runTypecheck, scanForStubs } from "./lib/staticScan.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED = 42;
const GRADER_VERSION = "1.0.0";
const TASK_ID = "program-rbac";
const TASK_VERSION = "1.0";
const CRITICAL_IDS = ["cross-org-isolation", "last-admin-protected", "invitation-single-use", "audit-events-emitted"];

function emptyCategory(detail) {
  return { passed: 0, failed: 1, total: 1, cases: [{ id: "grader-error", ok: false, detail: String(detail).slice(0, 2000) }] };
}
function pct(cat) {
  if (!cat || cat.total === 0) return 0;
  return Math.round((cat.passed / cat.total) * 10000) / 100;
}
async function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}
function allFailedCriticalSignals() {
  return Object.fromEntries(CRITICAL_IDS.map((id) => [id, false]));
}

export async function runGrader(workspaceDir) {
  let hidden_functional, regression, security, criticalSignals;
  let failure_stage_hint = null;
  let server = null;

  const dbPath = path.join(workspaceDir, "packages", "db", "src", "db.ts");
  const auditPath = path.join(workspaceDir, "packages", "audit", "src", "audit.ts");
  const emailPath = path.join(workspaceDir, "packages", "email", "src", "adapter.ts");
  const serverPath = path.join(workspaceDir, "apps", "api", "src", "server.ts");

  if (![dbPath, auditPath, emailPath, serverPath].every((p) => fs.existsSync(p))) {
    const detail = `expected entrypoints missing under ${workspaceDir} (db.ts/audit.ts/adapter.ts/server.ts)`;
    hidden_functional = emptyCategory(detail);
    regression = emptyCategory(detail);
    security = emptyCategory(detail);
    criticalSignals = allFailedCriticalSignals();
    failure_stage_hint = "setup";
  } else {
    try {
      const db = await import(pathToFileURL(dbPath).href);
      const audit = await import(pathToFileURL(auditPath).href);
      const email = await import(pathToFileURL(emailPath).href);
      const serverMod = await import(pathToFileURL(serverPath).href);

      if (typeof db.__resetDbForTests === "function") db.__resetDbForTests();
      if (typeof audit.__resetAuditForTests === "function") audit.__resetAuditForTests();
      if (typeof email.__resetOutboxForTests === "function") email.__resetOutboxForTests();

      const orgA = db.createOrg("Grader Org A");
      const orgB = db.createOrg("Grader Org B");
      const { hashSecret } = await import(pathToFileURL(path.join(workspaceDir, "apps", "api", "src", "auth", "hash.ts")).href);
      const seeded = {
        orgA,
        orgB,
        adminA: { email: "grader-admin-a@bench.test", password: "grader-pass-a1!" },
        memberA: { email: "grader-member-a@bench.test", password: "grader-pass-a2!" },
        adminB: { email: "grader-admin-b@bench.test", password: "grader-pass-b1!" },
        // The invitee has an account (with known credentials) but is not yet
        // a member of any org — mirrors "invite an existing platform user by
        // email" and lets the probe authenticate as them before accepting.
        // Without this, discoverAccept has no way to ever produce a session
        // for the invitee, and every reasonable implementation that gates
        // accept behind auth (matching every other endpoint this fixture
        // ships, per PUBLIC_API.md) is structurally unreachable — see
        // docs/audits/2026-08-10-program-rbac-diagnosis.md.
        invitee: { email: "invitee@bench.test", password: "grader-pass-invitee1!" },
      };
      const userAdminA = db.createUser({ email: seeded.adminA.email, passwordHash: hashSecret(seeded.adminA.password) });
      const userMemberA = db.createUser({ email: seeded.memberA.email, passwordHash: hashSecret(seeded.memberA.password) });
      const userAdminB = db.createUser({ email: seeded.adminB.email, passwordHash: hashSecret(seeded.adminB.password) });
      const userInvitee = db.createUser({ email: seeded.invitee.email, passwordHash: hashSecret(seeded.invitee.password) });
      db.addMember(orgA.id, userAdminA.id, "admin");
      db.addMember(orgA.id, userMemberA.id, "member");
      db.addMember(orgB.id, userAdminB.id, "admin");
      seeded.adminA.id = userAdminA.id;
      seeded.memberA.id = userMemberA.id;
      seeded.adminB.id = userAdminB.id;
      seeded.invitee.id = userInvitee.id;

      const port = await freePort();
      server = serverMod.createServer();
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, "127.0.0.1", resolve);
      });
      const base = `http://127.0.0.1:${port}`;

      const result = await runHiddenTests(base, { db, audit, email, workspaceDir, seeded });
      hidden_functional = result.hidden_functional;
      regression = result.regression;
      security = result.security;
      criticalSignals = result.criticalSignals;
      if (!result.meta.discovered) failure_stage_hint = "execution";
    } catch (err) {
      const detail = `grader execution failure: ${err.stack || err.message || err}`;
      hidden_functional = emptyCategory(detail);
      regression = emptyCategory(detail);
      security = emptyCategory(detail);
      criticalSignals = allFailedCriticalSignals();
      failure_stage_hint = "execution";
    } finally {
      if (server) {
        try {
          server.close();
        } catch {
          /* noop */
        }
      }
    }
  }

  const tc = runTypecheck(workspaceDir);
  const staticCases = [{ id: "static-typecheck", ok: tc.ok, detail: tc.detail }];
  const staticCat = { passed: tc.ok ? 1 : 0, failed: tc.ok ? 0 : 1, total: 1, cases: staticCases };

  const rootDirs = ["apps/api/src", "apps/web/src", "packages/db/src", "packages/contracts/src", "packages/email/src", "packages/audit/src"];
  const stubHits = scanForStubs(workspaceDir, rootDirs);
  const maintainability = Math.max(0, 100 - stubHits.length * 15);

  const contractPreserved = regression.failed === 0 && regression.total > 0;
  const scope = contractPreserved ? 100 : Math.max(0, 100 - regression.failed * 20);

  const subscores = {
    functional: pct(hidden_functional),
    regression: pct(regression),
    security: pct(security),
    static: tc.ok ? 100 : 0,
    scope,
    maintainability,
  };

  const critical_failures = Object.entries(criticalSignals || {})
    .filter(([, ok]) => ok === false)
    .map(([id]) => id);

  const hidden_functional_all_pass =
    hidden_functional.total > 0 && hidden_functional.total === hidden_functional.passed && hidden_functional.failed === 0;
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
    determinism: { seed: SEED, flaky_retries: 0, majority_vote: false },
    failure_stage_hint: solved ? null : failure_stage_hint || "grading",
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
