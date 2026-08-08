# Benchmark campaign: 20260807T213205Z-series_1

- Generated: 2026-08-07T21:32:05.045Z
- Runs: 6  ·  Tasks: feature-api-keys, patch-webhook, program-rbac  ·  Arms: baseline, skailr
- Model: `claude-sonnet-4-5-20250929`  ·  Claude Code: `2.1.224`
- Skailr arm ref: `1.13.0` (sha `1380bcf6920996db2c3dba83151d38953962b127`)
- Series: series_1355e0a7d637

Arm `baseline` = plain Claude Code. Arm `skailr` = Claude Code + Skailr @ the ref above.

---

# Skailr Bench Comparison: results vs results

## Headline Table

| Version | Task | Arm | n | Quality (median) | Quality CI | Solve Rate | Solve Rate CI | Wall (s, median) | Cost (USD, median) | Tokens in | Tokens out | Tokens cache | Tool calls | Subagent cost (USD) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| results | feature-api-keys | baseline | 1 | 94.00 | [94.00, 94.00] | 100.0% | [1.00, 1.00] | 423.8 | 1.1252 | 345 | 23768 | 2024313 | 0 | 0.0000 |
| results | feature-api-keys | skailr | 1 | 24.00 | [24.00, 24.00] | 0.0% | [0.00, 0.00] | 30.2 | 0.0963 | 25 | 1264 | 92670 | 0 | 0.0000 |
| results | patch-webhook | baseline | 1 | 95.00 | [95.00, 95.00] | 100.0% | [1.00, 1.00] | 132.1 | 0.4006 | 145 | 7597 | 649656 | 0 | 0.0000 |
| results | patch-webhook | skailr | 1 | 80.00 | [80.00, 80.00] | 0.0% | [0.00, 0.00] | 280.5 | 0.3765 | 131 | 5021 | 633428 | 0 | 0.0000 |
| results | program-rbac | baseline | 1 | 88.25 | [88.25, 88.25] | 0.0% | [0.00, 0.00] | 449.7 | 1.3223 | 285 | 32708 | 1973304 | 0 | 0.0000 |
| results | program-rbac | skailr | 1 | 23.50 | [23.50, 23.50] | 0.0% | [0.00, 0.00] | 32.8 | 0.1050 | 33 | 1189 | 125346 | 0 | 0.0000 |

## Top KPIs

| Version | Arm | Solve Rate | Median Quality | Cost/Solve (USD) | Quality-Adjusted Cost (USD) |
|---|---|---|---|---|---|
| results | baseline | 66.7% | 94.00 | 1.4240 | 1.5149 |
| results | skailr | 0.0% | 24.00 | — | — |

## Promotion Verdict

**N/A** — single-campaign report — no comparison performed

| Task | Quality delta | Significant? | Solve-rate delta | Significant? | Cost/solve delta | Wall delta (s) |
|---|---|---|---|---|---|---|

## Pareto Frontier (quality vs cost/solve, arm=skailr, across stored versions)

| Version | Quality | Cost/Solve (USD) | Pareto-optimal |
|---|---|---|---|

## Diagnostics

### results

- Cost/tokens by agent role: `{}`
- Cache read/create ratio: 26.093
- Compactions (median): 0.0
- Contract-change events (skailr arm): 0
- Gate failures (skailr arm): 0
- Validator catch rate by task class: `{"cross-cutting":0,"patch":0,"program":0}`
- Failure-stage distribution: `{"none":2,"validation":4}`
- Duplicate file reads: not derivable from run.json (no per-file read log in the frozen contract)

### results

- Cost/tokens by agent role: `{}`
- Cache read/create ratio: 26.093
- Compactions (median): 0.0
- Contract-change events (skailr arm): 0
- Gate failures (skailr arm): 0
- Validator catch rate by task class: `{"cross-cutting":0,"patch":0,"program":0}`
- Failure-stage distribution: `{"none":2,"validation":4}`
- Duplicate file reads: not derivable from run.json (no per-file read log in the frozen contract)


