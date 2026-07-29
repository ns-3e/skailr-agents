---
schema: skailr.contract/v1
id: launch-pricing
version: 1
status: frozen
producers: [pricing-model]
consumers: [launch-copy, gtm-campaign]
kind: financial
supersedes: null
---

# Contract: Launch pricing

## Purpose

Finance-owned list price and packaging figures that content and marketing must cite without reinterpretation.

## Interface

| SKU | List price (USD) | Billing period | Notes |
| --- | ---------------- | -------------- | ----- |
| Pro | 49 | month | Launch SKU |
| Pro annual | 470 | year | ~2 months free |

Acceptance: downstream copy/campaigns quote these figures exactly or mark placeholders until this contract is fulfilled in the ledger.

## Stub policy

Consumers may use `Pro $49/mo` as a stub until finance marks the model audited.

## Change control

Frozen contracts change only via `type: contract-change` → program-architect → human approval → version bump.
