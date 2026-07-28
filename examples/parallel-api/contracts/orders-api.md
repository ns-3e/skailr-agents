---
schema: skailr.contract/v1
id: orders-api
version: 1
status: frozen
producers: [orders-api]
consumers: [orders-web]
kind: api
supersedes: null
---

# Contract: Orders API

## Purpose

List and create orders for the demo storefront.

## Interface

See sidecar `orders-api.openapi.yaml`.

## Stub policy

Consumers build against stubs until producer marks fulfilled.
