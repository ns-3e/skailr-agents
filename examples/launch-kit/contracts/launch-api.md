---
schema: skailr.contract/v1
id: launch-api
version: 1
status: frozen
producers: [launch-surface]
consumers: [launch-copy]
kind: api
supersedes: null
---

# Contract: Launch feature facts (API)

## Purpose

Engineering-owned feature facts content may cite (endpoint or documented capability list).

## Interface

`GET /v1/launch/feature` returns `{ "name": string, "capabilities": string[] }` for announcement accuracy.

Acceptance: content only claims capabilities present in this response (or a documented stub list until the endpoint exists).

## Stub policy

Content may use a frozen stub capability list until engineering fulfills the contract.

## Change control

Frozen contracts change only via `type: contract-change` → program-architect → human approval → version bump.
