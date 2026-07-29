---
schema: skailr.contract/v1
id: gtm-positioning
version: 1
status: frozen
producers: [gtm-positioning]
consumers: [launch-copy, landing-design]
kind: campaign
supersedes: null
---

# Contract: GTM positioning

## Purpose

Early marketing-owned positioning and message pillars that content and design build to. Channel calendars are a later workstream (`gtm-campaign`) and do not feed back into this contract.

## Interface

| Field | Requirement |
| ----- | ----------- |
| Positioning sentence | Who / category / differentiator / why believe |
| Message pillars | 2–4 pillars with proof needs |
| Primary CTA | Single desired action for launch window |
| Success metrics | Primary metric + source + target for email and LinkedIn |

## Stub policy

Content/design may proceed against a draft positioning stub; must re-sync when marketing marks the campaign plan fulfilled.

## Change control

Frozen contracts change only via `type: contract-change` → program-architect → human approval → version bump.
