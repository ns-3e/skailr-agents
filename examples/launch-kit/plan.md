# Program plan: Product launch kit

## Team routing

| Workstream | Team | Lead |
| ---------- | ---- | ---- |
| pricing-model | finance | `fin-lead` |
| gtm-positioning | marketing | `mkt-lead` |
| launch-copy | content | `content-lead` |
| landing-design | design | `design-lead` |
| gtm-campaign | marketing | `mkt-lead` |
| launch-surface | engineering | skill `run-feature-queue` |

## Workstreams (excerpt)

### launch-surface

Team: engineering. Goal: ship the public launch surface and feature-facts API.
Owns: `apps/web/**`, `apps/api/launch/**`.
Produces contracts: launch-api. Consumes: landing-hero-design, launch-pricing (read-only facts).

Features (MECE):

| ID | Slug | Title | Goal | Depends-on | Maps-to brief |
|----|------|-------|------|------------|---------------|
| F-001 | launch-api | Launch feature facts API | Expose pricing/feature facts for copy and portal | — | Feature facts for GTM |
| F-002 | launch-landing | Launch landing surface | Public landing wired to design + API | F-001 | Launch marketing site |

MECE proof: brief launch outcomes map to F-001 (API facts) and F-002 (landing UI); no overlap.

## Execution DAG

1. **pricing-model** (finance) — freeze list price + packaging.
2. **gtm-positioning** (marketing) — freeze positioning / message pillars (early; before copy and design).
3. **launch-surface** (engineering) — feature queue F-001 → F-002 (parallel with copy after brief).
4. **launch-copy** (content) — consumes pricing, positioning, feature facts; produces approved copy blocks.
5. **landing-design** (design) — consumes copy + positioning; produces design handoff.
6. **gtm-campaign** (marketing) — consumes copy, design assets, pricing; produces channel plans (no reverse contract into content/design).
7. Integration → program validation → documenter.

## Contracts

| id | kind | Producer | Consumers |
| -- | ---- | -------- | --------- |
| launch-pricing | financial | pricing-model | launch-copy, gtm-campaign |
| gtm-positioning | campaign | gtm-positioning | launch-copy, landing-design |
| launch-copy-blocks | content | launch-copy | landing-design, gtm-campaign |
| landing-hero-design | design | landing-design | launch-surface, gtm-campaign |
| launch-api | api | launch-surface | launch-copy |

## Ownership

See `ownership.json` — finance/content/design/marketing use named units; engineering uses path globs.
