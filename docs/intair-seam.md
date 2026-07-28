# Intair seam (Skailr ↔ Intair)

Intair is a **separate** ontology / reasoning knowledge-base project. Skailr does not embed the ontology engine. Agents may call Intair tools for context and temporary analysis graphs; **official** org knowledge only lands after a Skailr approval event.

## MCP / tool contract (stub)

| Tool | Purpose |
|------|---------|
| `intair.query` | Read entities/relations from a named ontology |
| `intair.propose_schema_change` | Propose ontology/schema mutation (not applied) |
| `intair.spawn_temp` | Create an ephemeral ontology for analysis |
| `intair.merge_findings` | Propose promoting temp findings into a persistent ontology |

## Approval gating

1. Any `propose_schema_change` or `merge_findings` that should become official posts a Skailr channel `contract-change` or `@human` blocker with blast radius.
2. If the change is compliance-tagged, route through the **legal** team gate before human approval.
3. On human approve (channel `type: decision` / answer), Intair applies only after that decision id is presented (idempotent).
4. On reject/defer, Intair must not apply; temp ontologies may be discarded.

## Stub client

See [`intair-client.stub.ts`](./intair-client.stub.ts) for the TypeScript interface agents can depend on before Intair ships.
