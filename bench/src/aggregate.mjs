// DOC: aggregate.mjs turns a directory of schema-valid run.json records
// (a "campaign") into per task×arm statistics (FR-9): solve rate, quality
// distribution, cost/wall/token central tendency, cost-per-solve,
// quality-adjusted cost, and deterministic bootstrap 95% CIs (>=1000
// resamples, fixed seed — reruns of the same campaign always produce the
// same CI bounds, which report.mjs depends on for reproducible verdicts).
// A campaign used repeatedly as a baseline (e.g. across many `bench:compare`
// calls) can be aggregated once and reused via `getCachedAggregate` instead
// of recomputing on every compare invocation.
import fs from "node:fs";
import path from "node:path";
import { atomicWriteJson } from "./lib/fsutil.mjs";

/** Recursively find every `run.json` under `campaignDir` and parse it. */
export function listRunRecords(campaignDir) {
  const records = [];
  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name === "run.json") {
        const record = JSON.parse(fs.readFileSync(full, "utf8"));
        records.push({ record, runDir: dir, path: full });
      }
    }
  }
  walk(campaignDir);
  return records;
}

export function groupByTaskArm(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const { task_id, arm } = entry.record.identity;
    const key = `${task_id}|${arm}`;
    if (!groups.has(key)) groups.set(key, { task_id, arm, entries: [] });
    groups.get(key).entries.push(entry);
  }
  return groups;
}

export function mean(values) {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function median(values) {
  return percentile(values, 50);
}

/** Linear-interpolation percentile (0-100), matching numpy's default. */
export function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  const frac = rank - lo;
  return sorted[lo] + (sorted[hi] - sorted[lo]) * frac;
}

/** Deterministic PRNG (mulberry32) — no external deps, seeded for reproducible CIs. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generic percentile bootstrap CI. `statFn(sampleArray) -> number`.
 * Deterministic given the same `seed` (default 42) and `resamples` (>=1000
 * per spec; default 1000).
 */
export function bootstrapCI(values, statFn, { resamples = 1000, seed = 42, alpha = 0.05 } = {}) {
  if (values.length === 0) return { lo: null, hi: null, resamples };
  const rand = mulberry32(seed);
  const n = values.length;
  const stats = new Array(resamples);
  for (let r = 0; r < resamples; r++) {
    const sample = new Array(n);
    for (let i = 0; i < n; i++) {
      sample[i] = values[Math.floor(rand() * n)];
    }
    stats[r] = statFn(sample);
  }
  const lo = percentile(stats, (alpha / 2) * 100);
  const hi = percentile(stats, (1 - alpha / 2) * 100);
  return { lo, hi, resamples };
}

export function bootstrapSolveRateCI(solvedBooleans, opts = {}) {
  const nums = solvedBooleans.map((b) => (b ? 1 : 0));
  return bootstrapCI(nums, mean, opts);
}

export function bootstrapMedianCI(values, opts = {}) {
  return bootstrapCI(values, median, opts);
}

function tokenTotal(tokens) {
  return (tokens?.input || 0) + (tokens?.output || 0) + (tokens?.cache_read || 0) + (tokens?.cache_create || 0);
}

function statBlock(values) {
  return {
    median: median(values),
    p25: percentile(values, 25),
    p75: percentile(values, 75),
    mean: mean(values),
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null,
  };
}

/**
 * Aggregate one task×arm group of run records into the FR-9 stats bundle.
 */
export function aggregateGroup({ task_id, arm, entries }, opts = {}) {
  const records = entries.map((e) => e.record);
  const n = records.length;
  const solved = records.map((r) => r.outcome.solved);
  const solvedCount = solved.filter(Boolean).length;
  const solveRate = n ? solvedCount / n : null;

  const qualityValues = records.map((r) => r.quality.quality_score);
  const costValues = records.map((r) => r.cost.cost_reconstructed_usd);
  const wallValues = records.map((r) => r.time.wall_clock_s);
  const tokenValues = records.map((r) => tokenTotal(r.usage.tokens));

  const totalCost = costValues.reduce((a, b) => a + b, 0);
  const costPerSolve = solvedCount > 0 ? totalCost / solvedCount : null;
  const medianQuality = median(qualityValues);
  // Quality-adjusted cost: cost-per-solve inflated by how far median quality
  // falls short of a perfect 100 — a cheap-but-low-quality arm is penalized
  // relative to an equally-cheap high-quality arm.
  const qualityAdjustedCost =
    costPerSolve !== null && medianQuality !== null && medianQuality > 0
      ? Math.round((costPerSolve / (medianQuality / 100)) * 1e6) / 1e6
      : null;

  return {
    task_id,
    arm,
    n,
    solved_count: solvedCount,
    solve_rate: solveRate,
    solve_rate_ci: bootstrapSolveRateCI(solved, opts.bootstrap),
    quality: { ...statBlock(qualityValues), ci: bootstrapMedianCI(qualityValues, opts.bootstrap) },
    cost_usd: statBlock(costValues),
    wall_clock_s: statBlock(wallValues),
    tokens_total: statBlock(tokenValues),
    cost_per_solve_usd: costPerSolve !== null ? Math.round(costPerSolve * 1e6) / 1e6 : null,
    quality_adjusted_cost_usd: qualityAdjustedCost,
  };
}

/**
 * Aggregate an entire campaign directory into groups keyed by task×arm.
 * Pure w.r.t. the filesystem beyond reading run.json files.
 */
export function aggregateCampaign(campaignDir, opts = {}) {
  const entries = listRunRecords(campaignDir);
  const groups = groupByTaskArm(entries);
  const seriesIds = new Set(entries.map((e) => e.record.identity.series_id));
  return {
    campaign_dir: campaignDir,
    n_runs: entries.length,
    series_ids: [...seriesIds],
    groups: [...groups.values()].map((g) => aggregateGroup(g, opts)),
  };
}

/**
 * Reusable stored baseline campaigns: compute `aggregateCampaign` once and
 * cache the result to disk (`<campaignDir>/.aggregate-cache.json` by
 * default) so repeated `bench:compare` calls against the same baseline
 * campaign don't recompute bootstrap resampling every time. Cache is
 * invalidated by run.json count changing (cheap staleness check — campaigns
 * are otherwise immutable per-run).
 */
export function getCachedAggregate(campaignDir, opts = {}) {
  const cachePath = opts.cacheFile || path.join(campaignDir, ".aggregate-cache.json");
  if (fs.existsSync(cachePath)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cachePath, "utf8"));
      const liveCount = listRunRecords(campaignDir).length;
      if (cached.n_runs === liveCount) return cached;
    } catch {
      // fall through to recompute on any cache read/parse failure
    }
  }
  const fresh = aggregateCampaign(campaignDir, opts);
  try {
    atomicWriteJson(cachePath, fresh);
  } catch {
    // caching is best-effort; aggregation itself must still succeed
  }
  return fresh;
}
