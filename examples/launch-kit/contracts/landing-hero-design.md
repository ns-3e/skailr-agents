---
schema: skailr.contract/v1
id: landing-hero-design
version: 1
status: frozen
producers: [landing-design]
consumers: [launch-surface, gtm-campaign]
kind: design
supersedes: null
---

# Contract: Landing hero design

## Purpose

Design handoff for the landing hero and pricing section that engineering implements and marketing references for asset needs.

## Interface

Artifact shape: markdown artboard specs under the design workstream (`assets/hero-artboard.md`, `assets/pricing-section-artboard.md`) including:

- Layout zones and breakpoints
- Design-system components/tokens
- Copy placement by `launch-copy-blocks` block id
- Accessibility notes (contrast, alt, focus order)
- Eng handoff (components, states, responsive rules)

## Stub policy

Engineering may scaffold against zone names before final specs land; integration must replace stubs with the real handoff.

## Change control

Frozen contracts change only via `type: contract-change` → program-architect → human approval → version bump.
