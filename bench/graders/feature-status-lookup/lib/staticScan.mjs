// DOC: static-analysis helpers shared by feature-status-lookup's grader —
// typecheck (tsc --noEmit, if a tsconfig is present) and a TODO/skip/stub/
// placeholder scan used as a maintainability proxy per FR-8. Read-only;
// never mutates the frozen workspace.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function resolveTscBin(workspaceDir) {
  // Prefer the workspace's own vendored tsc (npm ci'd node_modules) to avoid
  // version drift; fall back to whatever `tsc` resolves on PATH.
  const local = path.join(workspaceDir, "node_modules", "typescript", "bin", "tsc");
  if (fs.existsSync(local)) return { cmd: process.execPath, args: [local, "--noEmit"] };
  return { cmd: "tsc", args: ["--noEmit"] };
}

export function runTypecheck(workspaceDir, { timeoutMs = 60000 } = {}) {
  const tsconfig = path.join(workspaceDir, "tsconfig.json");
  if (!fs.existsSync(tsconfig)) {
    return { ok: true, skipped: true, detail: "no tsconfig.json found; typecheck skipped" };
  }
  const { cmd, args } = resolveTscBin(workspaceDir);
  const res = spawnSync(cmd, args, { cwd: workspaceDir, encoding: "utf8", timeout: timeoutMs });
  if (res.error) {
    return { ok: false, skipped: false, detail: `tsc invocation failed: ${res.error.message}` };
  }
  const ok = res.status === 0;
  return { ok, skipped: false, detail: ok ? "tsc --noEmit clean" : (res.stdout || res.stderr || "").slice(0, 2000) };
}

const STUB_PATTERNS = [/\bTODO\b/i, /\bFIXME\b/i, /\bXXX\b/i, /not implemented/i, /\bstub\b/i, /\bplaceholder\b/i];

function walk(dir, out, exclude) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (exclude.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out, exclude);
    else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) out.push(full);
  }
}

/** Scans `rootDirs` (relative to workspaceDir) for TODO/stub-style markers. */
export function scanForStubs(workspaceDir, rootDirs = ["src"]) {
  const exclude = new Set(["node_modules", ".git", "test", "tests"]);
  const files = [];
  for (const rd of rootDirs) {
    const abs = path.join(workspaceDir, rd);
    if (fs.existsSync(abs)) walk(abs, files, exclude);
  }
  const hits = [];
  for (const f of files) {
    const text = fs.readFileSync(f, "utf8");
    const lines = text.split("\n");
    lines.forEach((line, idx) => {
      for (const pat of STUB_PATTERNS) {
        if (pat.test(line)) {
          hits.push(`${path.relative(workspaceDir, f)}:${idx + 1}`);
          break;
        }
      }
    });
  }
  return hits;
}
