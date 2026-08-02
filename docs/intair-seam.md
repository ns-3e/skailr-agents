# skailr ↔ Intair seam

**This is the reference for the one optional integration skailr has: a knowledge graph agents can read and write on purpose.** Its structure is deliberately rigid — this document is the client side of frozen contracts, validated by `scripts/skailr/check-intair-seam.mjs`.

skailr agents are **clients** of an Intair-hosted graph service that exposes one backend behind two faces: a REST API and an MCP tool surface. There is **no live runtime coupling** between this pack and Intair, so every call documented here is one an agent or operator makes deliberately, and every other skailr capability keeps working with Intair absent.

## Chooser

| You want to… | MCP tool | REST |
| ------------ | -------- | ---- |
| Record a decision, task, outcome, or agent run | `intair_write_node` | `POST /nodes` |
| Link two elements | `intair_write_edge` | `POST /edges` |
| Read one element back | `intair_get_node` | `GET /nodes/{id}` |
| Pull graph context around a scope | `intair_get_subgraph` | `POST /subgraph` |
| Ask a question in natural language | `intair_ask` | `POST /ask` |
| Run a graph algorithm | `intair_analyze` | `POST /analyze` |
| See which types exist right now | `intair_get_schema` | `GET /schema` |
| Propose an additive schema change | `intair_propose_schema_change` | `POST /schema/proposals` |

Full 1:1 mapping: [MCP tools](#mcp-tools) and [REST endpoints](#rest-endpoints).

## Before you start

This pack ships **no Intair server and no MCP server configuration**. Connectivity is yours to arrange, in whichever of the two faces you intend to use:

- **MCP face.** Your environment (Claude Code or Cursor) must already have an Intair MCP server registered. Once registered, the `intair_*` tools below are callable by name. skailr registers no MCP servers for anything.
- **REST face.** You need Intair's base URL plus, if Intair has auth enabled, a bearer token. Base path is `<INTAIR_BASE_URL>/api/v1`.

If neither is configured, this document still reads as complete reference material and nothing in the pack breaks. Skip the Intair step and note it in your run report.

## MCP tools

Fifteen tools, all `intair_` prefixed, grouped by the operation they serve. Every tool maps 1:1 onto a REST route (see the next section).

**No MCP tool ever raises.** On failure a tool returns the shared error envelope described in [Errors and failure modes](#errors-and-failure-modes), so treat a returned `error` object as the failure path rather than expecting an exception.

### Write knowledge / nodes / edges

| Tool | Does |
| ---- | ---- |
| `intair_write_node` | Create or revise one node in a layer, carrying attribution |
| `intair_write_edge` | Create or revise one typed edge between two elements |

### Query / subgraph / schema

| Tool | Does |
| ---- | ---- |
| `intair_get_node` | Fetch one element by id, optionally including superseded revisions |
| `intair_get_subgraph` | Fetch a bounded neighbourhood around a seed or scope |
| `intair_query` | Run a read query and get matching elements back |
| `intair_get_schema` | Read the live ontology: layers, node types, edge types, property specs |

### Schema proposal (propose only)

| Tool | Does |
| ---- | ---- |
| `intair_propose_schema_change` | Submit an **additive** schema proposal for human review |

There is deliberately no approve or reject tool on this face. See [Schema evolution](#schema-evolution).

### Scope lifecycle

| Tool | Does |
| ---- | ---- |
| `intair_open_scope` | Open a working scope so writes land in isolation |
| `intair_discard_scope` | Throw a working scope away without promoting it |
| `intair_promote_scope` | Promote a working scope's contents into the shared graph |

### Reasoning / analysis

| Tool | Does |
| ---- | ---- |
| `intair_analyze` | Run a named graph algorithm (centrality, community, paths, cycles, gaps, anomaly) |
| `intair_ask` | Ask a natural-language question and get an answer grounded in the graph |

### Job submission

| Tool | Does |
| ---- | ---- |
| `intair_submit_global_job` | Submit a longer-running analysis as a job |
| `intair_get_job` | Poll one job's status and result |
| `intair_list_algorithms` | List the algorithms available to `intair_analyze` and to jobs |

## REST endpoints

Same backend, same semantics, same error envelope. Base path for every route below is `<INTAIR_BASE_URL>/api/v1`.

**Auth.** Send `Authorization: Bearer <token>`. Intair's interface layer currently reads comma-separated bearer tokens from the `INTAIR_API_TOKENS` environment variable on the Intair side; treat that as Intair's present mechanism rather than a versioned contract field. When no token is configured, Intair runs in **open / dev mode** and accepts unauthenticated calls. When auth is enabled and the token is missing or invalid, the call fails with `UNAUTHORIZED` (401). This pack never stores, manages, or rotates that token: the operator configures it. `GET /health` is unauthenticated.

### 1:1 with the MCP face

| Group | MCP tool | Method and path |
| ----- | -------- | --------------- |
| Write knowledge / nodes / edges | `intair_write_node` | `POST /nodes` |
| Write knowledge / nodes / edges | `intair_write_edge` | `POST /edges` |
| Query / subgraph / schema | `intair_get_node` | `GET /nodes/{id}?include_superseded=` |
| Query / subgraph / schema | `intair_get_subgraph` | `POST /subgraph` |
| Query / subgraph / schema | `intair_query` | `POST /query` |
| Query / subgraph / schema | `intair_get_schema` | `GET /schema` |
| Schema proposal (propose only) | `intair_propose_schema_change` | `POST /schema/proposals` |
| Scope lifecycle | `intair_open_scope` | `POST /scopes` |
| Scope lifecycle | `intair_discard_scope` | `DELETE /scopes/{id}` |
| Scope lifecycle | `intair_promote_scope` | `POST /scopes/{id}/promote` |
| Reasoning / analysis | `intair_analyze` | `POST /analyze` |
| Reasoning / analysis | `intair_ask` | `POST /ask` |
| Job submission | `intair_submit_global_job` | `POST /jobs` |
| Job submission | `intair_get_job` | `GET /jobs/{id}` |
| Job submission | `intair_list_algorithms` | `GET /algorithms` |

### REST only, with no MCP tool

| Route | Why it is REST only |
| ----- | ------------------- |
| `GET /health` | Liveness probe, unauthenticated |
| `GET /schema/proposals?status=` | Operator review surface |
| `POST /schema/proposals/{id}/approve` | Approval is a human-operator action, deliberately absent from the MCP face |
| `POST /schema/proposals/{id}/reject` | Same as approval |

Schema-proposal **approval is reachable over REST only and never as an MCP tool call**. An agent has no route to it on either face.

## Attribution

Every write to Intair carries attribution. The wire shape has four fields and **all four are required**:

```json
{
  "actor": "backend-engineer",
  "actor_kind": "agent",
  "at": "2026-07-29T03:45:56Z",
  "basis": "task:T-14"
}
```

| Field | Type | Notes |
| ----- | ---- | ----- |
| `actor` | string | Who wrote. Opaque to this pack |
| `actor_kind` | `agent` \| `human` \| `system` | Which kind of caller |
| `at` | string | ISO-8601 timestamp in UTC |
| `basis` | string | Why this write happened. Nullable on the convenience side, required on the wire |

### Convenience forms

Do not hand-build the wire shape. Build one of two skailr-facing forms (`{author_id, author_kind, basis}`) and let the call site translate it, injecting `at` as the current UTC instant:

| Convenience form | Inputs | Produces |
| ---------------- | ------ | -------- |
| **agent attribution** | agent id, optional task id, optional basis | `actor_kind: "agent"`; when a task id is given and no basis is passed, `basis` defaults to `task:<task_id>` |
| **system attribution** | component name | `actor_kind: "system"` |

Agent attribution is the normal case for a skailr agent write. System attribution is for automation and housekeeping writes.

`actor` and `basis` values pass through as **opaque strings**. Unicode, very long values, and unusual characters are Intair's problem to accept or refuse: it applies its own `VALIDATION` and `SCHEMA_VIOLATION` checks. This pack performs no sanitization and imposes no length limit.

### Element envelope

Attribution is one field of the element envelope every node and edge carries: `id`, `layer`, `type`, `scope{kind, scope_id}`, `attribution{actor, actor_kind, at, basis}`, `version{rev, supersedes, superseded_by, status}`, `properties`. Edges additionally carry `source_id` and `target_id`.

## Schema evolution

**Agents may propose additive schema changes. Approval is performed by a human operator, and it is not reachable from any MCP tool or any agent action.**

The propose side is `intair_propose_schema_change` (`POST /schema/proposals`). That is the whole of an agent's role in schema evolution. Review and the approve or reject decision happen operator-side over REST, as listed under [REST only, with no MCP tool](#rest-only-with-no-mcp-tool). A proposal already approved or rejected fails with `PROPOSAL_STATE` (409). A write that would require a non-additive schema change fails with `SCHEMA_VIOLATION` (422) rather than mutating the ontology.

## Concept map

How skailr vocabulary lands in Intair's three-layer ontology:

| skailr | Intair | Layer |
| ------ | ------ | ----- |
| Agent invocation | `Agent` | operational |
| Team | `Team` | operational |
| Task | `Task` | operational |
| Decision | `Decision` | operational |
| Outcome | `Outcome` | operational |
| Contract | `Contract` | operational |
| Channel | `Channel` | operational |
| Channel message | `Episode` | context |
| Discovered knowledge | `Concept` / `Entity` | semantic |
| Relationship | `RELATES_TO` (+ `ABOUT`) | semantic / cross-layer |

**Treat this table as defaults, not a frozen contract.** Intair owns the ontology and may evolve it, so fetch live schema with `intair_get_schema` (`GET /schema`) instead of hardcoding these rows as permanent.

Useful operational edges when linking the rows above: `MEMBER_OF` (Agent to Team), `OWNS` (Agent or Team to Task), `PRODUCES` (Task to Outcome), `MADE` (Agent to Decision), `LED_TO` (Decision to Outcome), `DEPENDS_ON` (Task to Task or Contract), `GOVERNS` (Contract to Task or Team), `POSTED_IN` (Agent to Channel), `ABOUT` (operational to semantic or context), `SUPERSEDES` (lineage, any type to any type).

## Errors and failure modes

Both faces return the identical envelope. Every non-2xx REST response and every failed MCP tool call looks like this:

```json
{ "error": { "code": "VALIDATION", "message": "…", "detail": {} } }
```

`detail` is optional. `code` is one of nine values:

| Code | REST status | Means |
| ---- | ----------- | ----- |
| `UNAUTHORIZED` | 401 | Auth is enabled and the bearer token is missing or invalid |
| `NOT_FOUND` | 404 | No such element, scope, proposal, or job |
| `VALIDATION` | 400 | The request body failed Intair's validation |
| `SCHEMA_VIOLATION` | 422 | The write does not fit the current ontology, including any non-additive change |
| `SUBGRAPH_TOO_LARGE` | 413 | The requested subgraph exceeds what Intair will serve in one call |
| `PROPOSAL_STATE` | 409 | The proposal is already approved or rejected |
| `QUERY` | 400 | The query could not be parsed or planned |
| `CONFLICT` | 409 | A concurrent write conflicted |
| `INTERNAL` | 500 | Intair-side fault |

What each awkward situation means for a caller:

- **Intair is unreachable or times out.** That surfaces as an ordinary call failure to the calling agent, not a skailr run crash. The agent or operator decides whether to retry, skip, or note the outage. This pack adds no automatic retry and no fallback path.
- **Two agents or two runs write the same element.** Intair owns conflict resolution and reports `CONFLICT`. This pack invents no locking and no merge behaviour of its own.
- **The subgraph or query is too big.** `SUBGRAPH_TOO_LARGE` means narrow the scope or split the request. This pack ships no paging wrapper.
- **The same write goes out twice.** Each call is independent server-side and Intair applies its own `rev` versioning, so a double submit creates another revision. There is no client-side deduplication here. Do not re-issue a write unless a new revision is genuinely intended.
- **An element you wrote earlier is superseded or soft-deleted.** Elements carry `version{rev, supersedes, superseded_by, status}`, and lineage is fetched explicitly (`intair_get_node` with `include_superseded`). skailr-side records do not track supersession on their own.

## Out of scope for v1

Explicitly **not** part of this seam:

1. Live runtime coupling into skailr.
2. Automatic ingest of channel messages into Intair Episodes.
3. Event subscriptions, webhooks, or push in either direction.
4. Document-to-graph or conversation-to-graph extraction.
5. skailr-side approval of schema proposals.

## Deliberate invocation

Every Intair call is a deliberate step taken by an agent or operator. No existing skailr command, skill, or hook calls Intair as part of its own flow **except** when that command’s playbook explicitly says to (today: optional Phase 5 of [`/map-repo`](MAP_REPO.md) after human confirm). Installing this pack changes nothing about when Intair is contacted unless you run that phase.

Two consequences worth stating plainly:

- **Nothing is backfilled.** skailr records that already exist locally (ledger entries, channel messages, contracts, decisions, progress notes, map-repo artifacts) stay local. They reach Intair only if an agent or operator deliberately issues a write for them, one at a time.
- **Intair is never a dependency.** Every other pack capability (YOLO, patch, map-repo, and program flows, plus the ownership, contract, and channel gates) works unmodified when Intair is absent or unconfigured. This seam is additive reference documentation. `/map-repo` Phase 5 writes a skip note to `.claude/repo/intair-sync.md` when Intair is unreachable.

The companion skill `call-intair` carries an abbreviated version of this guidance for consumer projects, and it is likewise invoked only when someone has decided to call Intair.

## Change control

This document is the skailr-agents client side of three Intair-owned frozen contracts: `interface-rest-api`, `interface-mcp-tools`, and `operational-layer-concept-map`. This pack consumes them and amends none of them.

If a shape here looks wrong, do not fix it locally and do not negotiate a new shape with a peer agent. Post one `type: contract-change` message addressed to `@architect` on the run's channel board, then stop on that point. Message format and posting discipline live in [`.claude/program/channels/PROTOCOL.md`](../.claude/program/channels/PROTOCOL.md).

## See also

| Document | For |
| -------- | --- |
| [README install details](../README.md#install-details) | How the pack lands in a consumer project, plus the optional gate scripts |
| [YOLO.md](YOLO.md) | One-shot feature and program delivery |
| [MAP_REPO.md](MAP_REPO.md) | Brownfield bootstrap (`/map-repo`) |
| [INTAKE.md](INTAKE.md) | How plain chat is routed to a command |
| [MODEL_ROUTING.md](MODEL_ROUTING.md) | Role to model profile mapping |
