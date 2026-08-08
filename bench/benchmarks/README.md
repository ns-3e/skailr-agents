# Published benchmark campaigns

This directory holds **committed benchmark results** — the stats and metrics from
real A/B campaigns, pushed here by the
[`bench-smoke` workflow](../../.github/workflows/bench-smoke.yml).

Unlike `bench/results/` (gitignored, raw per-run artifacts regenerated on every
run), everything under `benchmarks/` is durable and tracked in git.

## Layout

Each campaign is one directory, `benchmarks/<label>/`, where `<label>` is
`<timestamp>-<series_id_short>`:

```
benchmarks/<label>/
├── SUMMARY.md        # headline: metadata + baseline-vs-skailr report (read this first)
├── report.md         # single-campaign comparison report (both arms)
├── report.html       # same, self-contained HTML
├── report.csv        # headline rows as CSV
├── aggregate.json    # per-(task, arm) aggregation + bootstrap 95% CIs
├── meta.json         # campaign metadata (model, CC version, skailr sha/version, series)
└── runs/<run_id>.json  # the individual run.json records (the raw stats)
```

Plus two roll-up files at this level:

- `index.md` — append-only ledger of every published campaign.
- `latest.json` — pointer to the most recently published campaign.

## Arms

- **`baseline`** — plain Claude Code.
- **`skailr`** — Claude Code + Skailr installed at the ref recorded in `meta.json`.

The task prompt is byte-identical across arms; the only difference is whether
Skailr is installed. See the top-level [`bench/README.md`](../README.md) for how
campaigns are run and graded.

## How results get here

The `bench-smoke` GitHub Actions workflow (manual `workflow_dispatch`) runs a
real smoke campaign (1 rep × all tasks × both arms) on a GitHub-hosted
`ubuntu-latest` runner, authenticated with a Claude Code subscription token,
then runs `scripts/publish-campaign.mjs` and commits the distilled output
here.
