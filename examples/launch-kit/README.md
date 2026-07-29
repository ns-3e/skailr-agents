# Launch kit fixture (multi-domain)

Stub program showing how engineering, finance, content, design, and marketing compose via frozen contracts. Artifacts are illustrative — not a runnable product.

## Cross-domain DAG

```
finance (pricing) ──┐
                    ├──► content (copy) ──► design (visuals) ──► marketing (campaign)
marketing (positioning, early) ──┘                                    ▲
engineering (feature facts) ──────────────────────────────────────────┤
finance (pricing) ────────────────────────────────────────────────────┘
```

Positioning is a **separate early marketing workstream** so content/design can consume it without a cycle against the later campaign plans.

## Layout

| Path | Purpose |
| ---- | ------- |
| `brief.md` | Program intent |
| `plan.md` | Workstreams, team routing, DAG |
| `ownership.json` | Named domain units (not only file globs) |
| `contracts/` | Sample frozen seams (`financial`, `content`, `design`, `campaign`, `api`) |

## Commands

```bash
node scripts/skailr/check-ownership.mjs --map examples/launch-kit/ownership.json --map-only
node scripts/skailr/check-contracts.mjs --dir examples/launch-kit/contracts
```

At `/build-program` time the orchestrator loads only each workstream's lead (`fin-lead`, `content-lead`, `design-lead`, `mkt-lead`, or the engineering feature pipeline).
