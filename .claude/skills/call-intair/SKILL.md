---
name: call-intair
description: Read from or write to Intair over its MCP tools or REST API. Invoke only when an agent or operator has already decided, in this step, to persist something to Intair or pull graph context out of it.
---

# Skill: call-intair

## When to use

Every Intair call is a deliberate step taken by an agent or operator. Use this skill when someone has decided, in a given step, to persist a decision, task, outcome, or piece of knowledge into Intair, or to pull graph context back out.

Never use it as an automatic consequence of a command finishing, a commit landing, a channel message being posted, or a task changing state. No skailr flow calls Intair on its own, and this skill does not change that.

### Preconditions

1. Intair connectivity is configured by the operator: an Intair MCP server registered in the environment, or a base URL plus (when Intair has auth enabled) a bearer token for the REST face. This pack ships neither.
2. If connectivity is not configured, **skip the Intair step and note it in your report**. Do not fail the run over it. Nothing else in skailr depends on Intair.

## Procedure

Pick the one operation the step actually needs. Each names the MCP tool and its REST equivalent.

| Step you are on | MCP tool | REST |
| --------------- | -------- | ---- |
| Record a decision, task, outcome, or agent run | `intair_write_node` | `POST /nodes` |
| Write discovered knowledge (a Concept or Entity) | `intair_write_node` | `POST /nodes` |
| Link two elements (`RELATES_TO`, `ABOUT`, `OWNS`, `MADE`, …) | `intair_write_edge` | `POST /edges` |
| Record a channel message as an Episode | `intair_write_node` | `POST /nodes` |
| Pull graph context around a scope | `intair_get_subgraph` | `POST /subgraph` |
| Ask a question in natural language | `intair_ask` | `POST /ask` |
| Check which types exist before writing | `intair_get_schema` | `GET /schema` |
| Propose an additive schema change | `intair_propose_schema_change` | `POST /schema/proposals` |

Then:

1. **Attribute the write.** Never omit attribution on a write. Build agent attribution: your agent id as the actor, `actor_kind: "agent"`, and `basis: "task:<task_id>"` for the task the write belongs to. Use system attribution (`actor_kind: "system"`, component name as actor) only for automation and housekeeping writes. The `at` timestamp is the current instant in UTC, ISO-8601.

2. **Propose, never approve.** Agents may propose additive schema changes. Approval is a human-operator action over REST and is not reachable from any MCP tool. If a write needs a schema change, propose it and stop; do not work around it with a different type name.

3. **Handle failure explicitly.** Both faces return `{"error": {"code", "message", "detail"?}}` and MCP tools never raise. On an error envelope, report the `code` and stop. No retry loop, no fallback, and never silently skip a write that was actually requested.

4. **Record what you did.** One line in your own report: which operation, which element id came back, and the basis you attributed it with.

## Common agent lifecycle writes

When an agent prompt says to follow this skill on start/completion (and Intair is available):

- **On start:** `intair_write_node` — operational `Agent` with `agent_id` / `role` / `status: active` / `task_id`.
- **On completion:** `intair_write_node` — operational `Outcome` with `kind: success|failure` and a one-sentence `summary`.
- Before acting: optional `intair_ask` with the current task question.

Skip silently when Intair tools are unavailable. Do not inline full JSON envelopes in role prompts.

## Reference

This skill is deliberately abbreviated. The full seam reference (all fifteen `intair_*` tools grouped by operation, every REST route, the auth and open/dev-mode rules, the complete attribution and element envelope, the nine error codes, the skailr to Intair concept map with its live-schema caveat, and the v1 out-of-scope list) lives in the pack repo at `docs/intair-seam.md`.
