// DOC: Filesystem helpers shared by every bench/src consumer: dir ensure,
// atomic JSON write (write-tmp-then-rename — no torn writes if a run is
// killed mid-write), sha helpers, and immutable-dir marking. Completed run
// dirs are read-only "by convention" (brief NN): chmod best-effort, not a
// security boundary — re-grade must still be able to add grader.v2.json
// alongside without overwriting run.json (see grader-json contract).
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { validateOrThrow } from "../schema/validate.mjs";

export function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

/**
 * Write JSON atomically: serialize to a sibling tmp file, then rename over
 * the target. Rename is atomic on POSIX filesystems, so a reader never sees
 * a partially-written file.
 */
export function atomicWriteJson(filePath, obj) {
  ensureDir(path.dirname(filePath));
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmpPath, JSON.stringify(obj, null, 2) + "\n", "utf8");
  fs.renameSync(tmpPath, filePath);
  return filePath;
}

/**
 * Validate `obj` against `schemaName` (throws on failure — see prime
 * directive: invalid ⇒ never silently written) then atomically write it.
 */
export function atomicWriteValidatedJson(filePath, obj, schemaName) {
  validateOrThrow(obj, schemaName);
  return atomicWriteJson(filePath, obj);
}

/**
 * Mark a directory tree read-only by convention (chmod files 0o444, dirs
 * 0o555). Best-effort: does not prevent a root-privileged process from
 * writing; it is a guardrail against accidental mutation, not a sandbox.
 */
export function markReadOnly(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      markReadOnly(full);
      fs.chmodSync(full, 0o555);
    } else {
      fs.chmodSync(full, 0o444);
    }
  }
  fs.chmodSync(dirPath, 0o555);
  return dirPath;
}

/** Reverse of markReadOnly — needed so a re-grade can add grader.v2.json. */
export function markWritable(dirPath) {
  fs.chmodSync(dirPath, 0o755);
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      markWritable(full);
    } else {
      fs.chmodSync(full, 0o644);
    }
  }
  return dirPath;
}

export function sha256String(input) {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export function sha256File(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}
