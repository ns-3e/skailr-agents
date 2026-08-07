// DOC: bench:verify-isolation — static reachability assertion (AC-3, NFR
// no-leakage). Enforces the isolation invariant encoded in fixture-layout +
// grader-json + install-arm contracts: no grader path (`bench/graders/**`)
// may be present in, symlinked from, traversal-reachable from, or
// referenced-by-path from any fixture (`bench/fixtures/**`). This is a
// STATIC filesystem/text check — it never executes fixture or grader code.
// CI-runnable; exits nonzero on any leak so a fixtures/graders authoring
// mistake is caught mechanically rather than by review.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sha256File } from "./lib/fsutil.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TEXT_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".json", ".yaml", ".yml", ".md", ".txt", ".sh"]);

function walkFiles(rootDir) {
  const files = [];
  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        files.push({ path: full, isSymlink: true, isDir: false });
        continue;
      }
      if (entry.isDirectory()) {
        files.push({ path: full, isSymlink: false, isDir: true });
        walk(full);
      } else if (entry.isFile()) {
        files.push({ path: full, isSymlink: false, isDir: false });
      }
    }
  }
  walk(rootDir);
  return files;
}

function realOrNull(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return null; // dangling symlink / traversal target that doesn't exist
  }
}

function isWithin(childReal, parentReal) {
  if (!childReal || !parentReal) return false;
  const rel = path.relative(parentReal, childReal);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/**
 * Check 1/2: any fixture entry (symlink OR regular path) that resolves —
 * after following symlinks and normalizing `..` — inside gradersRoot.
 */
function findReachabilityLeaks(fixtureFiles, gradersRootReal) {
  const leaks = [];
  if (!gradersRootReal) return leaks;
  for (const f of fixtureFiles) {
    const real = f.isSymlink ? realOrNull(f.path) : realOrNull(f.path);
    if (isWithin(real, gradersRootReal)) {
      leaks.push({
        type: f.isSymlink ? "symlink-into-graders" : "path-resolves-into-graders",
        fixturePath: f.path,
        detail: `resolves to ${real}, which is inside grader dir ${gradersRootReal}`,
      });
    }
  }
  return leaks;
}

/**
 * Check 3: content-based copy detection — a fixture file whose basename AND
 * sha256 content exactly match a file that exists under gradersRoot. Basename
 * match alone is not sufficient (common names like "index.js" would false
 * positive); content equality is the signal of an actual copy.
 */
function findCopiedGraderFiles(fixtureFiles, graderFilesByBasename) {
  const leaks = [];
  for (const f of fixtureFiles) {
    if (f.isDir || f.isSymlink) continue;
    const base = path.basename(f.path);
    const candidates = graderFilesByBasename.get(base);
    if (!candidates || candidates.length === 0) continue;
    let fixtureHash;
    try {
      fixtureHash = sha256File(f.path);
    } catch {
      continue;
    }
    for (const graderFile of candidates) {
      if (graderFile.hash === fixtureHash) {
        leaks.push({
          type: "grader-file-copied-into-fixture",
          fixturePath: f.path,
          detail: `content-identical to grader file ${graderFile.path}`,
        });
      }
    }
  }
  return leaks;
}

/**
 * Check 4: fixture source/text files that reference a grader path by string
 * (import/require/open of `bench/graders/...` or a relative `../`-style
 * traversal into a sibling "graders" directory). Catches path-reachability
 * expressed in code even when the filesystem entry itself isn't a symlink.
 */
function findPathReferenceLeaks(fixtureFiles) {
  const leaks = [];
  const patterns = [/bench\/graders\//, /\.\.\/graders\//, /\.\.\\graders\\/, /require\(['"].*graders/, /from\s+['"].*graders/];
  for (const f of fixtureFiles) {
    if (f.isDir || f.isSymlink) continue;
    const ext = path.extname(f.path);
    if (!TEXT_EXTENSIONS.has(ext)) continue;
    let text;
    try {
      text = fs.readFileSync(f.path, "utf8");
    } catch {
      continue;
    }
    for (const re of patterns) {
      if (re.test(text)) {
        leaks.push({ type: "grader-path-referenced-in-fixture", fixturePath: f.path, detail: `matches ${re}` });
        break;
      }
    }
  }
  return leaks;
}

function indexGraderFilesByBasename(gradersRoot) {
  const index = new Map();
  if (!fs.existsSync(gradersRoot)) return index;
  for (const f of walkFiles(gradersRoot)) {
    if (f.isDir || f.isSymlink) continue;
    const base = path.basename(f.path);
    let hash;
    try {
      hash = sha256File(f.path);
    } catch {
      continue;
    }
    if (!index.has(base)) index.set(base, []);
    index.get(base).push({ path: f.path, hash });
  }
  return index;
}

/**
 * Run every check for one fixture directory. Returns {ok, leaks[]}.
 */
export function verifyFixtureIsolation(fixtureDir, gradersRoot) {
  const gradersRootReal = fs.existsSync(gradersRoot) ? realOrNull(gradersRoot) : null;
  const fixtureFiles = walkFiles(fixtureDir);
  const graderIndex = indexGraderFilesByBasename(gradersRoot);

  const leaks = [
    ...findReachabilityLeaks(fixtureFiles, gradersRootReal),
    ...findCopiedGraderFiles(fixtureFiles, graderIndex),
    ...findPathReferenceLeaks(fixtureFiles),
  ];
  return { ok: leaks.length === 0, leaks };
}

/**
 * Run isolation verification for every fixture under `fixturesRoot` against
 * every grader under `gradersRoot`. Returns {ok, leaks:[{fixture, ...}]}.
 */
export function verifyIsolation({ fixturesRoot, gradersRoot }) {
  const results = [];
  let entries = [];
  try {
    entries = fs.readdirSync(fixturesRoot, { withFileTypes: true }).filter((e) => e.isDirectory());
  } catch {
    return { ok: true, leaks: [], fixtures_checked: 0, note: `fixturesRoot ${fixturesRoot} does not exist (nothing to check)` };
  }
  for (const entry of entries) {
    const fixtureDir = path.join(fixturesRoot, entry.name);
    const { ok, leaks } = verifyFixtureIsolation(fixtureDir, gradersRoot);
    if (!ok) {
      for (const leak of leaks) results.push({ fixture: entry.name, ...leak });
    }
  }
  return { ok: results.length === 0, leaks: results, fixtures_checked: entries.length };
}

async function main() {
  const fixturesRoot = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, "../fixtures");
  const gradersRoot = process.argv[3] ? path.resolve(process.argv[3]) : path.resolve(__dirname, "../graders");
  const result = verifyIsolation({ fixturesRoot, gradersRoot });
  if (result.ok) {
    console.log(`bench:verify-isolation OK — ${result.fixtures_checked ?? 0} fixture(s) checked, 0 leaks.`);
  } else {
    console.error(`bench:verify-isolation FAILED — ${result.leaks.length} leak(s) found:`);
    for (const leak of result.leaks) {
      console.error(`  [${leak.type}] fixture=${leak.fixture} path=${leak.fixturePath} :: ${leak.detail}`);
    }
    process.exitCode = 1;
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error(err.stack || err.message);
    process.exitCode = 1;
  });
}
