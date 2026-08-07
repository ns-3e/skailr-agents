import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { publishCampaign } from "./publish-campaign.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BENCH_ROOT = path.resolve(HERE, "..");
const SYNTH = path.join(BENCH_ROOT, "results-synthetic", "v1.12.0");

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "bench-publish-"));
}

test("publishCampaign distills a campaign into a committable dir", () => {
  const out = mkTmp();
  const { dir, label, meta } = publishCampaign({
    resultsDir: SYNTH,
    outRoot: out,
    label: "test-campaign",
    now: "2026-08-07T18:43:30Z",
  });

  assert.equal(label, "test-campaign");
  assert.equal(dir, path.join(out, "test-campaign"));

  // Core artifacts exist.
  for (const f of ["aggregate.json", "report.md", "report.html", "report.csv", "SUMMARY.md", "meta.json"]) {
    assert.ok(fs.existsSync(path.join(dir, f)), `missing ${f}`);
  }
  // Raw run.json stats copied.
  const runs = fs.readdirSync(path.join(dir, "runs")).filter((f) => f.endsWith(".json"));
  assert.ok(runs.length >= 6, `expected copied run.json files, got ${runs.length}`);

  // Both arms represented in metadata.
  assert.deepEqual(meta.arms, ["baseline", "skailr"]);
  assert.ok(meta.tasks.length >= 1);
  assert.equal(meta.n_runs, runs.length);

  // SUMMARY names both arms; report is embedded.
  const summary = fs.readFileSync(path.join(dir, "SUMMARY.md"), "utf8");
  assert.match(summary, /baseline/);
  assert.match(summary, /skailr/);

  // Index + latest pointer written.
  assert.ok(fs.existsSync(path.join(out, "index.md")));
  const latest = JSON.parse(fs.readFileSync(path.join(out, "latest.json"), "utf8"));
  assert.equal(latest.label, "test-campaign");

  fs.rmSync(out, { recursive: true, force: true });
});

test("publishCampaign refuses an empty results dir", () => {
  const empty = mkTmp();
  const out = mkTmp();
  assert.throws(() => publishCampaign({ resultsDir: empty, outRoot: out }), /no run\.json/);
  fs.rmSync(empty, { recursive: true, force: true });
  fs.rmSync(out, { recursive: true, force: true });
});
