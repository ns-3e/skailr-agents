---
schema: skailr.contract/v1
id: launch-copy-blocks
version: 1
status: frozen
producers: [launch-copy]
consumers: [landing-design, gtm-campaign]
kind: content
supersedes: null
---

# Contract: Launch copy blocks

## Purpose

Approved copy blocks design lays out and marketing redistributes.

## Interface

| Block id | Channel | Max length | Required elements |
| -------- | ------- | ---------- | ----------------- |
| hero-headline | landing | 70 chars | Product name + outcome |
| hero-sub | landing | 160 chars | One proof point |
| price-callout | landing | 120 chars | Exact figures from `launch-pricing` |
| announce-body | email/social | 400 words | Sourced claims only |

## Stub policy

Design/marketing may use `[PLACEHOLDER: hero-headline]` until content publishes final blocks.

## Change control

Frozen contracts change only via `type: contract-change` → program-architect → human approval → version bump.
