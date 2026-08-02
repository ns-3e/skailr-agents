#!/usr/bin/env node
/**
 * skailr-agents npx entrypoint.
 *
 *   npx skailr-agents [target-dir] [--claude-only|--cursor-only]
 *
 * Thin cross-platform wrapper around the real installers: install.sh on POSIX,
 * install.ps1 on Windows. The installers own all copy/upgrade/protection logic
 * (including the .claude/experts/ never-touch guarantee) — this file only locates
 * the package root and forwards arguments.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { existsSync } from "node:fs";

const pkgRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith("--"));
const targets = args.filter((a) => !a.startsWith("--"));

if (flags.includes("--help") || flags.includes("-h")) {
  console.log("Usage: npx skailr-agents [target-dir] [--claude-only|--cursor-only]");
  console.log("Installs the skailr-agents operating model into target-dir (default: current directory).");
  process.exit(0);
}
if (targets.length > 1) {
  console.error(`Expected at most one target dir, got: ${targets.join(", ")}`);
  process.exit(2);
}
const target = resolve(targets[0] || process.cwd());
if (!existsSync(target)) {
  console.error(`Target directory does not exist: ${target}`);
  process.exit(2);
}

let result;
if (process.platform === "win32") {
  // install.ps1 uses -TargetPath / -ClaudeOnly / -CursorOnly
  const psFlags = flags
    .map((f) => (f === "--claude-only" ? "-ClaudeOnly" : f === "--cursor-only" ? "-CursorOnly" : null))
    .filter(Boolean);
  result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", join(pkgRoot, "install.ps1"), "-TargetPath", target, ...psFlags],
    { stdio: "inherit" },
  );
} else {
  result = spawnSync("bash", [join(pkgRoot, "install.sh"), target, ...flags], { stdio: "inherit" });
}
process.exit(result.status ?? 1);
