import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  compareCampaigns,
  reportSingleCampaign,
  writeReport,
  ciOverlaps,
  detectCrossSeries,
  computeVerdict,
  computeParetoFrontier,
  loadCampaign,
  resolveCampaignDir,
} from "./report.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SYNTHETIC = path.resolve(__dirname, "../results-synthetic");
const V1_11 = path.join(SYNTHETIC, "v1.11.0");
const V1_12 = path.join(SYNTHETIC, "v1.12.0");
const CROSS = path.join(SYNTHETIC, "cross-series-v2");

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "bench-report-"));
}

test("robustness: resolveCampaignDir resolves bare synthetic labels but THROWS on a bogus ref (no phantom dir)", () => {
  assert.equal(resolveCampaignDir("v1.11.0"), V1_11);
  const bogus = `no-such-campaign-${Date.now()}`;
  assert.throws(() => resolveCampaignDir(bogus), /campaign not found/);
  assert.equal(fs.existsSync(path.resolve(__dirname, "..", bogus)), false, "must not create a phantom dir");
  assert.equal(fs.existsSync(path.resolve(__dirname, "..", "results-synthetic", bogus)), false);
});

test("ciOverlaps: overlapping ranges are not significant, disjoint ranges are significant", () => {
  assert.equal(ciOverlaps({ lo: 10, hi: 20 }, { lo: 15, hi: 25 }), true);
  assert.equal(ciOverlaps({ lo: 10, hi: 20 }, { lo: 21, hi: 30 }), false);
  assert.equal(ciOverlaps(null, { lo: 1, hi: 2 }), true); // unknown CI treated conservatively
});

test("AC-5/AC-7: compare on committed synthetic campaigns (v1.11.0 vs v1.12.0) emits MD+HTML+CSV with ALL sections", () => {
  const result = compareCampaigns(V1_11, V1_12);
  for (const section of ["Headline Table", "Top KPIs", "Promotion Verdict", "Pareto Frontier", "Diagnostics"]) {
    assert.ok(result.markdown.includes(section), `markdown missing section: ${section}`);
    assert.ok(result.html.includes(section) || result.html.includes(section.toLowerCase()), `html missing section: ${section}`);
  }
  assert.ok(result.csv.startsWith("version,task_id,arm"));
  assert.equal(result.banner, null, "same-series campaigns must NOT render a banner");
  assert.ok(["ACCEPT", "REJECT", "INCONCLUSIVE"].includes(result.verdict.verdict));
});

test("AC-5: promotion verdict is ACCEPT for v1.12.0 vs v1.11.0 (quality/solve-rate improve, cost/solve drops, no class regression)", () => {
  const result = compareCampaigns(V1_11, V1_12);
  assert.equal(result.verdict.verdict, "ACCEPT", JSON.stringify(result.verdict.reasons));
});

test("AC-7: compare across series (different model_id) renders a WARNING banner", () => {
  const result = compareCampaigns(V1_11, CROSS);
  assert.ok(result.banner, "expected a cross-series banner");
  assert.match(result.banner, /series_id/);
  assert.ok(result.markdown.includes("WARNING"));
  assert.ok(result.html.includes("WARNING"));
  assert.ok(result.html.includes('class="banner"'));
});

test("detectCrossSeries: same series_id -> null (no banner); disjoint series_ids -> banner string", () => {
  const a = loadCampaign(V1_11);
  const b = loadCampaign(V1_12);
  assert.equal(detectCrossSeries(a, b), null);
  const c = loadCampaign(CROSS);
  assert.ok(detectCrossSeries(a, c));
});

test("headline table has a row per arm/version and per-row CI columns beside quality/solve-rate", () => {
  const result = compareCampaigns(V1_11, V1_12);
  const patchRows = result.rows.filter((r) => r.task_id === "patch-webhook");
  // baseline+skailr x 2 versions = 4 rows for this task.
  assert.equal(patchRows.length, 4);
  for (const r of patchRows) {
    assert.ok(r.quality_ci && "lo" in r.quality_ci && "hi" in r.quality_ci);
    assert.ok(r.solve_rate_ci && "lo" in r.solve_rate_ci && "hi" in r.solve_rate_ci);
  }
});

test("AC-4 at the analytics layer: the planted-defect rep in v1.12.0/patch-webhook/skailr is reflected as unsolved despite high quality contribution", () => {
  const agg = loadCampaign(V1_12).agg;
  const group = agg.groups.find((g) => g.task_id === "patch-webhook" && g.arm === "skailr");
  assert.equal(group.n, 5);
  assert.equal(group.solved_count, 4, "exactly one rep (the planted defect) must be unsolved");
  assert.ok(group.quality.median > 80, "quality stays high because the planted-defect rep still scores well");
});

test("CI-overlap deltas are flagged 'not significant' in rendered markdown/html when CIs overlap", () => {
  const result = compareCampaigns(V1_11, V1_12);
  const hasOverlapFlag = result.verdict.deltas.some((d) => d.quality_ci_overlap || d.solve_rate_ci_overlap);
  assert.ok(hasOverlapFlag, "expected at least one delta with overlapping small-n bootstrap CIs");
  assert.ok(result.markdown.includes("not significant"));
});

test("computeVerdict: REJECT when candidate regresses solve_rate below incumbent", () => {
  const incumbent = {
    agg: { groups: [{ task_id: "t", arm: "skailr", n: 5, solved_count: 5, solve_rate: 1.0, solve_rate_ci: { lo: 0.8, hi: 1 }, quality: { median: 90, ci: { lo: 85, hi: 95 } }, cost_usd: { median: 0.1 }, cost_per_solve_usd: 0.1, wall_clock_s: { median: 100 } }] },
  };
  const candidate = {
    agg: { groups: [{ task_id: "t", arm: "skailr", n: 5, solved_count: 2, solve_rate: 0.4, solve_rate_ci: { lo: 0.1, hi: 0.6 }, quality: { median: 90, ci: { lo: 85, hi: 95 } }, cost_usd: { median: 0.05 }, cost_per_solve_usd: 0.125, wall_clock_s: { median: 90 } }] },
  };
  const verdict = computeVerdict(incumbent, candidate);
  assert.equal(verdict.verdict, "REJECT");
  assert.ok(verdict.reasons.some((r) => r.includes("solve_rate regressed")));
});

test("computeVerdict: REJECT on task-class quality regression > 5", () => {
  const incumbent = {
    agg: { groups: [{ task_id: "patch-webhook", arm: "skailr", n: 5, solved_count: 5, solve_rate: 1, solve_rate_ci: { lo: 1, hi: 1 }, quality: { median: 90, ci: { lo: 85, hi: 95 } }, cost_usd: { median: 0.1 }, cost_per_solve_usd: 0.1, wall_clock_s: { median: 100 } }] },
  };
  const candidate = {
    agg: { groups: [{ task_id: "patch-webhook", arm: "skailr", n: 5, solved_count: 5, solve_rate: 1, solve_rate_ci: { lo: 1, hi: 1 }, quality: { median: 80, ci: { lo: 75, hi: 85 } }, cost_usd: { median: 0.05 }, cost_per_solve_usd: 0.05, wall_clock_s: { median: 90 } }] },
  };
  const verdict = computeVerdict(incumbent, candidate);
  assert.equal(verdict.verdict, "REJECT");
  assert.ok(verdict.reasons.some((r) => r.includes("task-class quality regression")));
});

test("computeParetoFrontier: dominated version is not pareto_optimal", () => {
  const cheap_high_quality = { label: "b", agg: { groups: [{ task_id: "t", arm: "skailr", n: 1, solved_count: 1, cost_usd: { median: 0.01 }, quality: { median: 99 } }] } };
  const expensive_low_quality = { label: "a", agg: { groups: [{ task_id: "t", arm: "skailr", n: 1, solved_count: 1, cost_usd: { median: 0.5 }, quality: { median: 50 } }] } };
  // computeKPIs reads cost_per_solve_usd/median_quality via groups, so wire those in directly.
  cheap_high_quality.agg.groups[0].cost_usd.median = 0.01;
  const frontier = computeParetoFrontier(
    [
      { label: "cheap-good", agg: { groups: [{ task_id: "t", arm: "skailr", n: 1, solved_count: 1, cost_usd: { median: 0.01 }, quality: { median: 99 } }] } },
      { label: "expensive-bad", agg: { groups: [{ task_id: "t", arm: "skailr", n: 1, solved_count: 1, cost_usd: { median: 0.5 }, quality: { median: 50 } }] } },
    ].map((c) => ({ ...c, agg: { ...c.agg, groups: c.agg.groups } }))
  );
  const good = frontier.find((p) => p.label === "cheap-good");
  const bad = frontier.find((p) => p.label === "expensive-bad");
  assert.equal(good.pareto_optimal, true);
  assert.equal(bad.pareto_optimal, false);
});

test("bench:report --campaign <id> (single-campaign report) has no verdict/comparison but includes headline+KPIs+diagnostics", () => {
  const result = reportSingleCampaign(V1_11);
  assert.ok(result.markdown.includes("Headline Table"));
  assert.ok(result.markdown.includes("Diagnostics"));
  assert.ok(result.rows.length > 0);
});

test("writeReport: writes .md/.html/.csv files to an output directory", () => {
  const outDir = mkTmp();
  const result = compareCampaigns(V1_11, V1_12);
  const paths = writeReport(outDir, result, "compare");
  assert.ok(fs.existsSync(paths.md));
  assert.ok(fs.existsSync(paths.html));
  assert.ok(fs.existsSync(paths.csv));
  assert.ok(fs.readFileSync(paths.html, "utf8").includes("<style>"), "HTML must be self-contained (inline CSS)");
  assert.ok(!/https?:\/\//.test(fs.readFileSync(paths.html, "utf8")), "HTML must not reference external assets");
});
