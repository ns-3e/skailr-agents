// DOC: report.mjs — bench:compare (FR-10) and bench:report --campaign
// single-campaign report. Reads schema-valid run.json campaigns (via
// aggregate.mjs), renders a headline table (row per task/arm/version), top
// KPIs, a promotion verdict (ACCEPT rule), Pareto dominance across stored
// versions, and diagnostics — as Markdown + self-contained HTML + CSV.
// Cross-series comparisons (different claude_code_version/model_id, i.e.
// different series_id — AC-7) render an explicit WARNING banner; every
// headline delta is shown beside its bootstrap CI, and deltas whose CIs
// overlap are flagged "not significant" rather than asserted as real.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getCachedAggregate, listRunRecords, median, mean } from "./aggregate.mjs";
import { loadConfig } from "./lib/config.mjs";
import { reconstructCost } from "./lib/pricing.mjs";
import { ensureDir } from "./lib/fsutil.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// task_id -> class, per fixture-layout contract's declared classes. run.json
// itself does not carry `class` (not part of the frozen sidecar), so this is
// report.mjs's own lookup for the "no task-class quality regression >5"
// promotion rule; unknown task_ids fall back to their own task_id as class.
export const TASK_CLASS = {
  "patch-webhook": "patch",
  "feature-api-keys": "cross-cutting",
  "program-rbac": "program",
};
export function taskClassOf(task_id) {
  return TASK_CLASS[task_id] || task_id;
}

function campaignLabel(dir) {
  return path.basename(path.resolve(dir));
}

/** Load one campaign: aggregate stats (cached) + raw entries for diagnostics. */
export function loadCampaign(dir) {
  const agg = getCachedAggregate(dir);
  const entries = listRunRecords(dir);
  return { label: campaignLabel(dir), dir: path.resolve(dir), agg, entries };
}

function tokTotal(t) {
  return (t?.input || 0) + (t?.output || 0) + (t?.cache_read || 0) + (t?.cache_create || 0);
}

let _pricingTable = null;
function getPricingTable() {
  if (_pricingTable === null) {
    try {
      _pricingTable = loadConfig().pricing_table;
    } catch {
      _pricingTable = false; // sentinel: unavailable
    }
  }
  return _pricingTable || null;
}

/** Best-effort per-run subagent cost estimate; null if the model isn't in the pinned pricing table. */
function subagentCostOf(record) {
  const pricingTable = getPricingTable();
  if (!pricingTable) return null;
  try {
    const { cost_reconstructed_usd } = reconstructCost(
      record.usage.by_source.subagent,
      pricingTable,
      record.environment.model_id
    );
    return cost_reconstructed_usd;
  } catch {
    return null; // model not in pinned pricing table (e.g. a cross-series sample) — diagnostics degrade gracefully
  }
}

/** Headline table: one row per (task_id, arm, campaign/version). */
export function buildHeadlineRows(campaigns) {
  const rows = [];
  for (const campaign of campaigns) {
    for (const g of campaign.agg.groups) {
      const groupEntries = campaign.entries.filter(
        (e) => e.record.identity.task_id === g.task_id && e.record.identity.arm === g.arm
      );
      const records = groupEntries.map((e) => e.record);
      const toolCalls = records.map((r) => r.trajectory.tool_calls);
      const tokensIn = records.map((r) => r.usage.tokens.input);
      const tokensOut = records.map((r) => r.usage.tokens.output);
      const tokensCache = records.map((r) => r.usage.tokens.cache_read + r.usage.tokens.cache_create);
      const subagentCosts = records.map(subagentCostOf).filter((v) => v !== null);
      rows.push({
        version: campaign.label,
        task_id: g.task_id,
        arm: g.arm,
        n: g.n,
        quality_median: g.quality.median,
        quality_ci: g.quality.ci,
        solve_rate: g.solve_rate,
        solve_rate_ci: g.solve_rate_ci,
        wall_clock_s_median: g.wall_clock_s.median,
        cost_usd_median: g.cost_usd.median,
        tokens_in_median: median(tokensIn),
        tokens_out_median: median(tokensOut),
        tokens_cache_median: median(tokensCache),
        tool_calls_median: median(toolCalls),
        subagent_cost_usd_median: subagentCosts.length ? median(subagentCosts) : null,
        cost_per_solve_usd: g.cost_per_solve_usd,
        quality_adjusted_cost_usd: g.quality_adjusted_cost_usd,
      });
    }
  }
  return rows;
}

/** Top KPIs for one campaign, per arm, aggregated across all its tasks. */
export function computeKPIs(campaign) {
  const byArm = {};
  for (const g of campaign.agg.groups) {
    if (!byArm[g.arm]) byArm[g.arm] = { n: 0, solved: 0, totalCost: 0, qualities: [] };
    const bucket = byArm[g.arm];
    bucket.n += g.n;
    bucket.solved += g.solved_count;
    bucket.totalCost += g.cost_usd.median * g.n; // approximate total via median*n (per-run costs not retained at this layer)
    bucket.qualities.push(g.quality.median);
  }
  const kpis = {};
  for (const [arm, b] of Object.entries(byArm)) {
    const solveRate = b.n ? b.solved / b.n : null;
    const medianQuality = median(b.qualities);
    const costPerSolve = b.solved > 0 ? Math.round((b.totalCost / b.solved) * 1e6) / 1e6 : null;
    const qualityAdjustedCost =
      costPerSolve !== null && medianQuality > 0 ? Math.round((costPerSolve / (medianQuality / 100)) * 1e6) / 1e6 : null;
    kpis[arm] = { solve_rate: solveRate, median_quality: medianQuality, cost_per_solve_usd: costPerSolve, quality_adjusted_cost_usd: qualityAdjustedCost };
  }
  return kpis;
}

/** True if two [lo,hi] CIs overlap (or either is null -> treated as unknown/overlap). */
export function ciOverlaps(a, b) {
  if (!a || !b || a.lo === null || b.lo === null) return true;
  return a.lo <= b.hi && b.lo <= a.hi;
}

/**
 * Promotion verdict (ACCEPT rule), comparing arm="skailr" groups matched by
 * task_id between incumbent (refA) and candidate (refB) — release-to-release
 * comparison of the thing actually being iterated on. Baseline-arm rows
 * still appear in the headline table/diagnostics for context, but are not
 * part of the gate (design decision — no frozen contract prescribes which
 * arm the verdict gates on).
 */
export function computeVerdict(refA, refB, { armForVerdict = "skailr" } = {}) {
  const groupsA = new Map(refA.agg.groups.filter((g) => g.arm === armForVerdict).map((g) => [g.task_id, g]));
  const groupsB = new Map(refB.agg.groups.filter((g) => g.arm === armForVerdict).map((g) => [g.task_id, g]));
  const matchedTasks = [...groupsA.keys()].filter((t) => groupsB.has(t));

  const reasons = [];
  if (matchedTasks.length === 0) {
    return { verdict: "INCONCLUSIVE", reasons: [`no matched task_id under arm="${armForVerdict}" between the two campaigns`], matchedTasks };
  }

  let totalA = 0, solvedA = 0, totalB = 0, solvedB = 0;
  const qualitiesA = [], qualitiesB = [];
  const classRegressions = new Map(); // class -> max (qualityA - qualityB)
  const deltas = [];

  for (const task_id of matchedTasks) {
    const a = groupsA.get(task_id);
    const b = groupsB.get(task_id);
    totalA += a.n; solvedA += a.solved_count;
    totalB += b.n; solvedB += b.solved_count;
    qualitiesA.push(a.quality.median);
    qualitiesB.push(b.quality.median);

    const cls = taskClassOf(task_id);
    const regression = a.quality.median - b.quality.median;
    classRegressions.set(cls, Math.max(classRegressions.get(cls) ?? -Infinity, regression));

    deltas.push({
      task_id,
      quality_delta: b.quality.median - a.quality.median,
      quality_ci_overlap: ciOverlaps(a.quality.ci, b.quality.ci),
      solve_rate_delta: b.solve_rate - a.solve_rate,
      solve_rate_ci_overlap: ciOverlaps(a.solve_rate_ci, b.solve_rate_ci),
      cost_per_solve_delta:
        a.cost_per_solve_usd !== null && b.cost_per_solve_usd !== null ? b.cost_per_solve_usd - a.cost_per_solve_usd : null,
      wall_clock_delta: b.wall_clock_s.median - a.wall_clock_s.median,
    });
  }

  const solveRateA = totalA ? solvedA / totalA : 0;
  const solveRateB = totalB ? solvedB / totalB : 0;
  const medianQualityA = median(qualitiesA);
  const medianQualityB = median(qualitiesB);

  const solveRateOk = solveRateB >= solveRateA;
  if (!solveRateOk) reasons.push(`solve_rate regressed: ${solveRateB.toFixed(3)} < incumbent ${solveRateA.toFixed(3)}`);

  const qualityFloorOk = medianQualityB >= medianQualityA - 1;
  if (!qualityFloorOk) reasons.push(`median_quality dropped more than 1pt: ${medianQualityB} < incumbent-1 (${medianQualityA - 1})`);

  const worstClassRegression = Math.max(0, ...[...classRegressions.values()]);
  const noClassRegression = worstClassRegression <= 5;
  if (!noClassRegression) reasons.push(`task-class quality regression > 5 detected (worst=${worstClassRegression.toFixed(1)})`);

  const totalCostA = deltas.reduce((s, d, i) => s + (groupsA.get(d.task_id).cost_usd.median * groupsA.get(d.task_id).n), 0);
  const totalCostB = deltas.reduce((s, d, i) => s + (groupsB.get(d.task_id).cost_usd.median * groupsB.get(d.task_id).n), 0);
  const costPerSolveA = solvedA > 0 ? totalCostA / solvedA : null;
  const costPerSolveB = solvedB > 0 ? totalCostB / solvedB : null;
  const wallA = median(matchedTasks.map((t) => groupsA.get(t).wall_clock_s.median));
  const wallB = median(matchedTasks.map((t) => groupsB.get(t).wall_clock_s.median));

  const improvedSomething =
    (costPerSolveA !== null && costPerSolveB !== null && costPerSolveB < costPerSolveA) ||
    (wallA !== null && wallB !== null && wallB < wallA) ||
    solveRateB > solveRateA ||
    medianQualityB > medianQualityA;
  if (!improvedSomething) reasons.push("no improvement in cost/solve, wall/solve, solve_rate, or quality");

  const accept = solveRateOk && qualityFloorOk && noClassRegression && improvedSomething;

  return {
    verdict: accept ? "ACCEPT" : "REJECT",
    reasons,
    matchedTasks,
    incumbent: { solve_rate: solveRateA, median_quality: medianQualityA, cost_per_solve_usd: costPerSolveA, wall_clock_s_median: wallA },
    candidate: { solve_rate: solveRateB, median_quality: medianQualityB, cost_per_solve_usd: costPerSolveB, wall_clock_s_median: wallB },
    deltas,
  };
}

/**
 * Pareto dominance (quality vs cost/solve) across "stored versions" — every
 * sibling directory found alongside refA/refB that itself looks like a
 * campaign (contains at least one run.json), so a compare of two versions
 * still situates them against other committed campaigns.
 */
export function computeParetoFrontier(campaigns, { arm = "skailr" } = {}) {
  const points = campaigns
    .map((c) => {
      const kpis = computeKPIs(c)[arm];
      if (!kpis || kpis.cost_per_solve_usd === null || kpis.median_quality === null) return null;
      return { label: c.label, quality: kpis.median_quality, cost_per_solve_usd: kpis.cost_per_solve_usd };
    })
    .filter(Boolean);
  const dominated = (p, other) =>
    other.label !== p.label &&
    other.quality >= p.quality &&
    other.cost_per_solve_usd <= p.cost_per_solve_usd &&
    (other.quality > p.quality || other.cost_per_solve_usd < p.cost_per_solve_usd);
  return points.map((p) => ({ ...p, pareto_optimal: !points.some((other) => dominated(p, other)) }));
}

function findSiblingCampaigns(dir) {
  const parent = path.dirname(path.resolve(dir));
  let entries = [];
  try {
    entries = fs.readdirSync(parent, { withFileTypes: true }).filter((e) => e.isDirectory());
  } catch {
    return [];
  }
  const dirs = [];
  for (const e of entries) {
    const full = path.join(parent, e.name);
    if (listRunRecords(full).length > 0) dirs.push(full);
  }
  return dirs;
}

/** Diagnostics section — everything derivable from run.json fields. */
export function computeDiagnostics(campaign) {
  const records = campaign.entries.map((e) => e.record);
  const byAgentRole = {};
  for (const r of records) {
    for (const [agent, tokens] of Object.entries(r.usage.by_agent || {})) {
      if (!byAgentRole[agent]) byAgentRole[agent] = { totalTokens: 0, n: 0 };
      byAgentRole[agent].totalTokens += tokTotal(tokens);
      byAgentRole[agent].n += 1;
    }
  }
  const cacheRead = records.reduce((s, r) => s + r.usage.tokens.cache_read, 0);
  const cacheCreate = records.reduce((s, r) => s + r.usage.tokens.cache_create, 0);
  const failedTestToRepair = records.map((r) => ({ test_failures: r.process.test_failures, repair_loops: r.process.repair_loops }));
  const compactions = median(records.map((r) => r.trajectory.compactions));

  const skailrRecords = records.filter((r) => r.identity.arm === "skailr" && r.skailr_diagnostics);
  const contractEvents = skailrRecords.reduce((s, r) => s + r.skailr_diagnostics.contract_events, 0);
  const gateFailures = skailrRecords.reduce((s, r) => s + r.skailr_diagnostics.gate_failures, 0);
  const validatorCatchByClass = {};
  for (const r of skailrRecords) {
    const cls = taskClassOf(r.identity.task_id);
    if (!validatorCatchByClass[cls]) validatorCatchByClass[cls] = { findings: 0, n: 0 };
    validatorCatchByClass[cls].findings += r.skailr_diagnostics.validator_findings;
    validatorCatchByClass[cls].n += 1;
  }
  const validatorCatchRateByClass = Object.fromEntries(
    Object.entries(validatorCatchByClass).map(([cls, v]) => [cls, v.n ? v.findings / v.n : null])
  );

  const failureStageDistribution = {};
  for (const r of records) {
    failureStageDistribution[r.failure_stage] = (failureStageDistribution[r.failure_stage] || 0) + 1;
  }

  return {
    cost_tokens_by_agent_role: Object.fromEntries(
      Object.entries(byAgentRole).map(([agent, v]) => [agent, { total_tokens: v.totalTokens, n_runs_seen: v.n }])
    ),
    cache_read_create_ratio: cacheCreate > 0 ? Math.round((cacheRead / cacheCreate) * 1000) / 1000 : cacheRead > 0 ? Infinity : null,
    failed_test_to_repair_cycles: failedTestToRepair,
    compactions_median: compactions,
    contract_change_events: contractEvents,
    gate_failures: gateFailures,
    validator_catch_rate_by_task_class: validatorCatchRateByClass,
    failure_stage_distribution: failureStageDistribution,
    duplicate_file_reads: null, // NOT derivable from run.json (no per-file read log in the frozen contract) — reported as unavailable, not silently omitted
  };
}

function fmtNum(n, digits = 2) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  if (!Number.isFinite(n)) return "∞";
  return Number(n).toFixed(digits);
}
function fmtPct(n) {
  return n === null || n === undefined ? "—" : `${(n * 100).toFixed(1)}%`;
}
function fmtCI(ci) {
  if (!ci || ci.lo === null) return "—";
  return `[${fmtNum(ci.lo)}, ${fmtNum(ci.hi)}]`;
}

function renderMarkdown({ refA, refB, banner, rows, kpisA, kpisB, verdict, pareto, diagA, diagB }) {
  const lines = [];
  lines.push(`# Skailr Bench Comparison: ${refA.label} vs ${refB.label}`);
  lines.push("");
  if (banner) {
    lines.push(`> **WARNING: cross-series comparison.** ${banner}`);
    lines.push("");
  }
  lines.push("## Headline Table");
  lines.push("");
  lines.push(
    "| Version | Task | Arm | n | Quality (median) | Quality CI | Solve Rate | Solve Rate CI | Wall (s, median) | Cost (USD, median) | Tokens in | Tokens out | Tokens cache | Tool calls | Subagent cost (USD) |"
  );
  lines.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const r of rows) {
    lines.push(
      `| ${r.version} | ${r.task_id} | ${r.arm} | ${r.n} | ${fmtNum(r.quality_median)} | ${fmtCI(r.quality_ci)} | ${fmtPct(r.solve_rate)} | ${fmtCI(r.solve_rate_ci)} | ${fmtNum(r.wall_clock_s_median, 1)} | ${fmtNum(r.cost_usd_median, 4)} | ${fmtNum(r.tokens_in_median, 0)} | ${fmtNum(r.tokens_out_median, 0)} | ${fmtNum(r.tokens_cache_median, 0)} | ${fmtNum(r.tool_calls_median, 0)} | ${r.subagent_cost_usd_median === null ? "—" : fmtNum(r.subagent_cost_usd_median, 4)} |`
    );
  }
  lines.push("");
  lines.push("## Top KPIs");
  lines.push("");
  lines.push("| Version | Arm | Solve Rate | Median Quality | Cost/Solve (USD) | Quality-Adjusted Cost (USD) |");
  lines.push("|---|---|---|---|---|---|");
  for (const [label, kpis] of [[refA.label, kpisA], [refB.label, kpisB]]) {
    for (const [arm, k] of Object.entries(kpis)) {
      lines.push(`| ${label} | ${arm} | ${fmtPct(k.solve_rate)} | ${fmtNum(k.median_quality)} | ${fmtNum(k.cost_per_solve_usd, 4)} | ${fmtNum(k.quality_adjusted_cost_usd, 4)} |`);
    }
  }
  lines.push("");
  lines.push("## Promotion Verdict");
  lines.push("");
  lines.push(`**${verdict.verdict}**${verdict.reasons.length ? ` — ${verdict.reasons.join("; ")}` : ""}`);
  lines.push("");
  lines.push("| Task | Quality delta | Significant? | Solve-rate delta | Significant? | Cost/solve delta | Wall delta (s) |");
  lines.push("|---|---|---|---|---|---|---|");
  for (const d of verdict.deltas) {
    lines.push(
      `| ${d.task_id} | ${fmtNum(d.quality_delta)} | ${d.quality_ci_overlap ? "not significant (CI overlap)" : "significant"} | ${fmtPct(d.solve_rate_delta)} | ${d.solve_rate_ci_overlap ? "not significant (CI overlap)" : "significant"} | ${d.cost_per_solve_delta === null ? "—" : fmtNum(d.cost_per_solve_delta, 4)} | ${fmtNum(d.wall_clock_delta, 1)} |`
    );
  }
  lines.push("");
  lines.push("## Pareto Frontier (quality vs cost/solve, arm=skailr, across stored versions)");
  lines.push("");
  lines.push("| Version | Quality | Cost/Solve (USD) | Pareto-optimal |");
  lines.push("|---|---|---|---|");
  for (const p of pareto) {
    lines.push(`| ${p.label} | ${fmtNum(p.quality)} | ${fmtNum(p.cost_per_solve_usd, 4)} | ${p.pareto_optimal ? "yes" : "no"} |`);
  }
  lines.push("");
  lines.push("## Diagnostics");
  lines.push("");
  for (const [label, diag] of [[refA.label, diagA], [refB.label, diagB]]) {
    lines.push(`### ${label}`);
    lines.push("");
    lines.push(`- Cost/tokens by agent role: \`${JSON.stringify(diag.cost_tokens_by_agent_role)}\``);
    lines.push(`- Cache read/create ratio: ${diag.cache_read_create_ratio === null ? "—" : diag.cache_read_create_ratio}`);
    lines.push(`- Compactions (median): ${fmtNum(diag.compactions_median, 1)}`);
    lines.push(`- Contract-change events (skailr arm): ${diag.contract_change_events}`);
    lines.push(`- Gate failures (skailr arm): ${diag.gate_failures}`);
    lines.push(`- Validator catch rate by task class: \`${JSON.stringify(diag.validator_catch_rate_by_task_class)}\``);
    lines.push(`- Failure-stage distribution: \`${JSON.stringify(diag.failure_stage_distribution)}\``);
    lines.push(`- Duplicate file reads: not derivable from run.json (no per-file read log in the frozen contract)`);
    lines.push("");
  }
  return lines.join("\n") + "\n";
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function renderHtml({ refA, refB, banner, rows, kpisA, kpisB, verdict, pareto, diagA, diagB }) {
  const style = `
    body { font-family: -apple-system, Helvetica, Arial, sans-serif; margin: 2rem; color: #1a1a1a; }
    h1, h2, h3 { color: #111; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 1.5rem; font-size: 0.9rem; }
    th, td { border: 1px solid #ccc; padding: 0.4rem 0.6rem; text-align: left; }
    th { background: #f2f2f2; }
    .banner { background: #fff3cd; border: 1px solid #ffcc00; padding: 1rem; margin-bottom: 1.5rem; font-weight: bold; }
    .verdict-ACCEPT { color: #0a7d00; font-weight: bold; }
    .verdict-REJECT { color: #b00020; font-weight: bold; }
    .verdict-INCONCLUSIVE { color: #806000; font-weight: bold; }
    code { background: #f2f2f2; padding: 0.1rem 0.3rem; }
  `;
  const headlineRows = rows
    .map(
      (r) =>
        `<tr><td>${r.version}</td><td>${r.task_id}</td><td>${r.arm}</td><td>${r.n}</td><td>${fmtNum(r.quality_median)}</td><td>${fmtCI(r.quality_ci)}</td><td>${fmtPct(r.solve_rate)}</td><td>${fmtCI(r.solve_rate_ci)}</td><td>${fmtNum(r.wall_clock_s_median, 1)}</td><td>${fmtNum(r.cost_usd_median, 4)}</td><td>${fmtNum(r.tokens_in_median, 0)}</td><td>${fmtNum(r.tokens_out_median, 0)}</td><td>${fmtNum(r.tokens_cache_median, 0)}</td><td>${fmtNum(r.tool_calls_median, 0)}</td><td>${r.subagent_cost_usd_median === null ? "—" : fmtNum(r.subagent_cost_usd_median, 4)}</td></tr>`
    )
    .join("\n");
  const kpiRows = [[refA.label, kpisA], [refB.label, kpisB]]
    .flatMap(([label, kpis]) =>
      Object.entries(kpis).map(
        ([arm, k]) =>
          `<tr><td>${label}</td><td>${arm}</td><td>${fmtPct(k.solve_rate)}</td><td>${fmtNum(k.median_quality)}</td><td>${fmtNum(k.cost_per_solve_usd, 4)}</td><td>${fmtNum(k.quality_adjusted_cost_usd, 4)}</td></tr>`
      )
    )
    .join("\n");
  const deltaRows = verdict.deltas
    .map(
      (d) =>
        `<tr><td>${d.task_id}</td><td>${fmtNum(d.quality_delta)}</td><td>${d.quality_ci_overlap ? "not significant (CI overlap)" : "significant"}</td><td>${fmtPct(d.solve_rate_delta)}</td><td>${d.solve_rate_ci_overlap ? "not significant (CI overlap)" : "significant"}</td><td>${d.cost_per_solve_delta === null ? "—" : fmtNum(d.cost_per_solve_delta, 4)}</td><td>${fmtNum(d.wall_clock_delta, 1)}</td></tr>`
    )
    .join("\n");
  const paretoRows = pareto
    .map((p) => `<tr><td>${p.label}</td><td>${fmtNum(p.quality)}</td><td>${fmtNum(p.cost_per_solve_usd, 4)}</td><td>${p.pareto_optimal ? "yes" : "no"}</td></tr>`)
    .join("\n");
  const diagSection = [[refA.label, diagA], [refB.label, diagB]]
    .map(
      ([label, diag]) => `
    <h3>${escapeHtml(label)}</h3>
    <ul>
      <li>Cost/tokens by agent role: <code>${escapeHtml(JSON.stringify(diag.cost_tokens_by_agent_role))}</code></li>
      <li>Cache read/create ratio: ${diag.cache_read_create_ratio === null ? "—" : diag.cache_read_create_ratio}</li>
      <li>Compactions (median): ${fmtNum(diag.compactions_median, 1)}</li>
      <li>Contract-change events (skailr arm): ${diag.contract_change_events}</li>
      <li>Gate failures (skailr arm): ${diag.gate_failures}</li>
      <li>Validator catch rate by task class: <code>${escapeHtml(JSON.stringify(diag.validator_catch_rate_by_task_class))}</code></li>
      <li>Failure-stage distribution: <code>${escapeHtml(JSON.stringify(diag.failure_stage_distribution))}</code></li>
      <li>Duplicate file reads: not derivable from run.json (no per-file read log in the frozen contract)</li>
    </ul>`
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Skailr Bench Comparison: ${escapeHtml(refA.label)} vs ${escapeHtml(refB.label)}</title>
<style>${style}</style>
</head>
<body>
<h1>Skailr Bench Comparison: ${escapeHtml(refA.label)} vs ${escapeHtml(refB.label)}</h1>
${banner ? `<div class="banner">WARNING: cross-series comparison. ${escapeHtml(banner)}</div>` : ""}
<h2>Headline Table</h2>
<table><thead><tr><th>Version</th><th>Task</th><th>Arm</th><th>n</th><th>Quality (median)</th><th>Quality CI</th><th>Solve Rate</th><th>Solve Rate CI</th><th>Wall (s, median)</th><th>Cost (USD, median)</th><th>Tokens in</th><th>Tokens out</th><th>Tokens cache</th><th>Tool calls</th><th>Subagent cost (USD)</th></tr></thead>
<tbody>
${headlineRows}
</tbody></table>
<h2>Top KPIs</h2>
<table><thead><tr><th>Version</th><th>Arm</th><th>Solve Rate</th><th>Median Quality</th><th>Cost/Solve (USD)</th><th>Quality-Adjusted Cost (USD)</th></tr></thead>
<tbody>
${kpiRows}
</tbody></table>
<h2>Promotion Verdict</h2>
<p class="verdict-${verdict.verdict}">${verdict.verdict}</p>
${verdict.reasons.length ? `<p>${escapeHtml(verdict.reasons.join("; "))}</p>` : ""}
<table><thead><tr><th>Task</th><th>Quality delta</th><th>Significant?</th><th>Solve-rate delta</th><th>Significant?</th><th>Cost/solve delta</th><th>Wall delta (s)</th></tr></thead>
<tbody>
${deltaRows}
</tbody></table>
<h2>Pareto Frontier (quality vs cost/solve, arm=skailr, across stored versions)</h2>
<table><thead><tr><th>Version</th><th>Quality</th><th>Cost/Solve (USD)</th><th>Pareto-optimal</th></tr></thead>
<tbody>
${paretoRows}
</tbody></table>
<h2>Diagnostics</h2>
${diagSection}
</body>
</html>
`;
}

function renderCsv(rows) {
  const headers = [
    "version", "task_id", "arm", "n", "quality_median", "quality_ci_lo", "quality_ci_hi",
    "solve_rate", "solve_rate_ci_lo", "solve_rate_ci_hi", "wall_clock_s_median", "cost_usd_median",
    "tokens_in_median", "tokens_out_median", "tokens_cache_median", "tool_calls_median",
    "subagent_cost_usd_median", "cost_per_solve_usd", "quality_adjusted_cost_usd",
  ];
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.version, r.task_id, r.arm, r.n, r.quality_median, r.quality_ci?.lo, r.quality_ci?.hi,
        r.solve_rate, r.solve_rate_ci?.lo, r.solve_rate_ci?.hi, r.wall_clock_s_median, r.cost_usd_median,
        r.tokens_in_median, r.tokens_out_median, r.tokens_cache_median, r.tool_calls_median,
        r.subagent_cost_usd_median, r.cost_per_solve_usd, r.quality_adjusted_cost_usd,
      ]
        .map((v) => (v === null || v === undefined ? "" : v))
        .join(",")
    );
  }
  return lines.join("\n") + "\n";
}

/**
 * Cross-series detection (AC-7): two campaigns are cross-series if the union
 * of series_ids observed in each is disjoint (or otherwise doesn't fully
 * overlap) — a model/claude_code_version change anywhere in either campaign.
 */
export function detectCrossSeries(refA, refB) {
  const a = new Set(refA.agg.series_ids);
  const b = new Set(refB.agg.series_ids);
  const overlap = [...a].some((s) => b.has(s));
  if (overlap && a.size === 1 && b.size === 1 && [...a][0] === [...b][0]) return null;
  if (overlap) return null;
  return `${refA.label} series_id(s)=${[...a].join(",")} vs ${refB.label} series_id(s)=${[...b].join(",")} — no overlapping series_id. Results are NOT directly comparable (different claude_code_version and/or model_id).`;
}

/** Pure builder: everything bench:compare needs, with no filesystem writes. */
export function compareCampaigns(refADir, refBDir) {
  const refA = loadCampaign(refADir);
  const refB = loadCampaign(refBDir);
  const banner = detectCrossSeries(refA, refB);
  const rows = buildHeadlineRows([refA, refB]);
  const kpisA = computeKPIs(refA);
  const kpisB = computeKPIs(refB);
  const verdict = computeVerdict(refA, refB);

  const siblingDirs = new Set([...findSiblingCampaigns(refADir), ...findSiblingCampaigns(refBDir), refA.dir, refB.dir]);
  const siblingCampaigns = [...siblingDirs].map((d) => (d === refA.dir ? refA : d === refB.dir ? refB : loadCampaign(d)));
  const pareto = computeParetoFrontier(siblingCampaigns);

  const diagA = computeDiagnostics(refA);
  const diagB = computeDiagnostics(refB);

  const ctx = { refA, refB, banner, rows, kpisA, kpisB, verdict, pareto, diagA, diagB };
  return {
    markdown: renderMarkdown(ctx),
    html: renderHtml(ctx),
    csv: renderCsv(rows),
    verdict,
    banner,
    rows,
  };
}

/** Pure builder for a single-campaign report (`bench:report --campaign <id>`) — no comparison/verdict. */
export function reportSingleCampaign(campaignDir) {
  const campaign = loadCampaign(campaignDir);
  const rows = buildHeadlineRows([campaign]);
  const kpis = computeKPIs(campaign);
  const diag = computeDiagnostics(campaign);
  const ctx = {
    refA: campaign,
    refB: campaign,
    banner: null,
    rows,
    kpisA: kpis,
    kpisB: {},
    verdict: { verdict: "N/A", reasons: ["single-campaign report — no comparison performed"], deltas: [] },
    pareto: computeParetoFrontier([campaign]),
    diagA: diag,
    diagB: diag,
  };
  return { markdown: renderMarkdown(ctx), html: renderHtml(ctx), csv: renderCsv(rows), rows };
}

export function writeReport(outDir, { markdown, html, csv }, basename = "report") {
  ensureDir(outDir);
  const paths = {
    md: path.join(outDir, `${basename}.md`),
    html: path.join(outDir, `${basename}.html`),
    csv: path.join(outDir, `${basename}.csv`),
  };
  fs.writeFileSync(paths.md, markdown, "utf8");
  fs.writeFileSync(paths.html, html, "utf8");
  fs.writeFileSync(paths.csv, csv, "utf8");
  return paths;
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
      out[key] = val;
    } else {
      out._.push(argv[i]);
    }
  }
  return out;
}

async function main() {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);
  if (argv[0] === "compare") {
    const [, refA, refB] = argv.filter((a) => !a.startsWith("--"));
    if (!refA || !refB) {
      console.error("Usage: bench:compare <ref-A> <ref-B>");
      process.exitCode = 2;
      return;
    }
    const result = compareCampaigns(refA, refB);
    const outDir = args.out ? path.resolve(args.out) : path.resolve(__dirname, "../results/reports", `${campaignLabel(refA)}_vs_${campaignLabel(refB)}`);
    const paths = writeReport(outDir, result, "compare");
    console.log(`Verdict: ${result.verdict.verdict}${result.banner ? " (CROSS-SERIES — see banner)" : ""}`);
    console.log(`Wrote ${paths.md}\nWrote ${paths.html}\nWrote ${paths.csv}`);
  } else if (args.campaign) {
    const result = reportSingleCampaign(args.campaign);
    const outDir = args.out ? path.resolve(args.out) : path.resolve(__dirname, "../results/reports", campaignLabel(args.campaign));
    const paths = writeReport(outDir, result, "report");
    console.log(`Wrote ${paths.md}\nWrote ${paths.html}\nWrote ${paths.csv}`);
  } else {
    console.error("Usage: bench:compare <ref-A> <ref-B>  |  bench:report --campaign <dir>");
    process.exitCode = 2;
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error(err.stack || err.message);
    process.exitCode = 1;
  });
}
