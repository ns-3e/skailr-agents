// DOC: publish-campaign.mjs — freeze a completed campaign's stats + metrics
// into a tracked, committable directory so CI can push them to `main`.
//
// The live `bench/results/` tree is gitignored (raw per-run artifacts, some
// large). This script distills a campaign into `bench/benchmarks/<label>/`:
//   - runs/<run_id>.json     copied run.json records (the stats)
//   - aggregate.json         per-(task,arm) aggregation + bootstrap CIs
//   - report.{md,html,csv}   single-campaign report (baseline vs skailr arms)
//   - SUMMARY.md             human headline (metadata + report markdown)
// and appends a row to `bench/benchmarks/index.md` + refreshes
// `bench/benchmarks/latest.json`. Dependency-free ESM; safe to run in CI.
//
// Usage:
//   node scripts/publish-campaign.mjs [--results-dir <dir>] [--out-root <dir>]
//        [--label <name>] [--now <iso>] [--campaign-id <id>]
// Defaults: --results-dir bench/results, --out-root bench/benchmarks.
// --label / --now exist so tests are deterministic; in CI, label is derived
// from the run timestamp + series_id.
// --campaign-id scopes publishing to exactly one campaign invocation's own
// runs (the `campaign_id` printed by `run.mjs` at the end of a campaign) —
// see "Known issues" in bench/README.md: without it, this script reports on
// whatever run.json files happen to be sitting in --results-dir, which can
// silently include stale runs from an earlier invocation.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { aggregateCampaign, listRunRecords } from "../src/aggregate.mjs";
import { reportSingleCampaign, writeReport } from "../src/report.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BENCH_ROOT = path.resolve(HERE, "..");

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--results-dir") out.resultsDir = argv[++i];
    else if (a === "--out-root") out.outRoot = argv[++i];
    else if (a === "--label") out.label = argv[++i];
    else if (a === "--now") out.now = argv[++i];
    else if (a === "--campaign-id") out.campaignId = argv[++i];
  }
  return out;
}

/** Slug a timestamp to a filesystem-safe token: 2026-08-07T18:43:30Z -> 20260807T184330Z */
function tsSlug(iso) {
  return iso.replace(/[-:]/g, "").replace(/\.\d+/, "");
}

function uniq(arr) {
  return [...new Set(arr)];
}

/**
 * Publish one campaign. Pure-ish: reads runs from resultsDir, writes into
 * outRoot/<label>/. Returns { dir, label, meta }.
 */
export function publishCampaign({ resultsDir, outRoot, label, now, campaignId } = {}) {
  resultsDir = resultsDir || path.join(BENCH_ROOT, "results");
  outRoot = outRoot || path.join(BENCH_ROOT, "benchmarks");
  const nowIso = now || new Date().toISOString();

  const entries = listRunRecords(resultsDir, { campaignId });
  if (entries.length === 0) {
    throw new Error(
      campaignId
        ? `publish-campaign: no run.json with campaign_id "${campaignId}" found under ${resultsDir}`
        : `publish-campaign: no run.json found under ${resultsDir}`
    );
  }
  const records = entries.map((e) => e.record);

  const seriesIds = uniq(records.map((r) => r.identity.series_id));
  const arms = uniq(records.map((r) => r.identity.arm)).sort();
  const taskIds = uniq(records.map((r) => r.identity.task_id)).sort();
  // "latest Skailr" provenance: pull the concrete sha/version the skailr arm ran at.
  const skailrRec = records.find((r) => r.identity.arm === "skailr");
  const skailrSha = skailrRec?.identity.skailr_sha ?? null;
  const skailrVersion = skailrRec?.identity.skailr_version ?? null;
  const modelId = records[0]?.environment?.model_id ?? null;
  const ccVersion = records[0]?.environment?.claude_code_version ?? null;

  const seriesShort = (seriesIds[0] || "unknown").slice(0, 8);
  const resolvedLabel = label || `${tsSlug(nowIso)}-${seriesShort}`;
  const dir = path.join(outRoot, resolvedLabel);
  const runsDir = path.join(dir, "runs");
  fs.mkdirSync(runsDir, { recursive: true });

  // 1. Copy run.json stats (flattened, keyed by run_id).
  for (const { record } of entries) {
    const id = record.identity.run_id;
    fs.writeFileSync(path.join(runsDir, `${id}.json`), JSON.stringify(record, null, 2) + "\n");
  }

  // 2. Aggregate (per task x arm, with bootstrap CIs).
  const agg = aggregateCampaign(resultsDir, { campaignId });
  fs.writeFileSync(path.join(dir, "aggregate.json"), JSON.stringify(agg, null, 2) + "\n");

  // 3. Single-campaign report (both arms side by side): md/html/csv.
  const report = reportSingleCampaign(resultsDir, { campaignId });
  writeReport(dir, report, "report");

  // 4. Metadata + SUMMARY.md.
  const meta = {
    label: resolvedLabel,
    generated_at: nowIso,
    n_runs: records.length,
    tasks: taskIds,
    arms,
    series_ids: seriesIds,
    cross_series: seriesIds.length > 1,
    model_id: modelId,
    claude_code_version: ccVersion,
    skailr_sha: skailrSha,
    skailr_version: skailrVersion,
  };
  fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify(meta, null, 2) + "\n");

  const summary = [
    `# Benchmark campaign: ${resolvedLabel}`,
    "",
    `- Generated: ${nowIso}`,
    `- Runs: ${records.length}  ·  Tasks: ${taskIds.join(", ")}  ·  Arms: ${arms.join(", ")}`,
    `- Model: \`${modelId}\`  ·  Claude Code: \`${ccVersion}\``,
    `- Skailr arm ref: \`${skailrVersion ?? "n/a"}\` (sha \`${skailrSha ?? "n/a"}\`)`,
    `- Series: ${seriesIds.join(", ")}${seriesIds.length > 1 ? "  ⚠️ CROSS-SERIES" : ""}`,
    "",
    "Arm `baseline` = plain Claude Code. Arm `skailr` = Claude Code + Skailr @ the ref above.",
    "",
    "---",
    "",
    report.markdown,
    "",
  ].join("\n");
  fs.writeFileSync(path.join(dir, "SUMMARY.md"), summary);

  // 5. latest.json pointer + index.md (append-only ledger of campaigns).
  fs.writeFileSync(
    path.join(outRoot, "latest.json"),
    JSON.stringify({ label: resolvedLabel, ...meta }, null, 2) + "\n"
  );
  const indexPath = path.join(outRoot, "index.md");
  const header = "# Benchmark campaigns\n\nAppend-only index of published campaigns (newest at bottom).\n\n| label | generated | runs | tasks | arms | model | skailr | series |\n|---|---|---|---|---|---|---|---|\n";
  if (!fs.existsSync(indexPath)) fs.writeFileSync(indexPath, header);
  const row = `| [${resolvedLabel}](${resolvedLabel}/SUMMARY.md) | ${nowIso} | ${records.length} | ${taskIds.length} | ${arms.join("+")} | ${modelId} | ${skailrVersion ?? "n/a"} | ${seriesIds.length > 1 ? "cross" : seriesShort} |\n`;
  fs.appendFileSync(indexPath, row);

  return { dir, label: resolvedLabel, meta };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  const { dir, label, meta } = publishCampaign(args);
  console.log(`publish-campaign: wrote ${meta.n_runs} run(s) → ${path.relative(process.cwd(), dir)} (label ${label})`);
}
