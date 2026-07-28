# Parallel API fixture (CI / demo)

Minimal frozen-contract demo for ownership + stub + contract scripts.

## Layout

- `ownership.json` — disjoint eng owners
- `contracts/orders-api.md` + `orders-api.openapi.yaml` — frozen API seam
- `channels/program.md` — sample inbox message
- `ledger.md` — mid-build resume cursor

## Commands

```bash
node scripts/skailr/check-ownership.mjs --map examples/parallel-api/ownership.json --map-only
node scripts/skailr/check-contracts.mjs --dir examples/parallel-api/contracts --ledger examples/parallel-api/ledger.md
node scripts/skailr/validate-channels.mjs --dir examples/parallel-api/channels
node scripts/skailr/emit-stubs.mjs --dir examples/parallel-api/contracts --out examples/parallel-api/stubs
node scripts/skailr/ledger-status.mjs --ledger examples/parallel-api/ledger.md
```

Flow: plan → freeze → stubs → parallel WS → integrate → validate.
