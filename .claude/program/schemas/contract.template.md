---
schema: skailr.contract/v1
id: <contract-id>
version: 1
status: draft | frozen | superseded
producers: [<workstream>]
consumers: [<workstream>]
kind: api | schema | event | content | compliance | delivery | design | campaign | financial
supersedes: null
---

# Contract: <title>

## Purpose

One paragraph: what this seam guarantees between producer and consumer.

## Interface

Exact shapes, types, errors, and semantics. For APIs include method, path, auth, request, response, error cases. For non-code seams include the artifact shape and acceptance criteria.

## Machine sidecar

When present, a JSON Schema or OpenAPI fragment lives beside this file as `<id>.openapi.yaml` or `<id>.schema.json`. Consumers and `emit-stubs` prefer the sidecar.

## Stub policy

Consumers may build against stubs until the producer marks this contract fulfilled in the ledger. Integration must replace stubs with real producers before SHIP.

## Change control

Frozen contracts change only via `type: contract-change` → program-architect → human approval → version bump.
