---
name: emit-telemetry
description: Emit `span.start`/`span.end` telemetry around every subagent Task dispatch via `scripts/skailr/emit-telemetry.mjs`. Mint the run's trace once, thread parent_span_id through nested dispatches, derive status from the caller's own success/failure handling. Use before and after every Task dispatch in orchestrator commands, the nested-dispatch skills, and dispatching lead agents.
---

# Skill: emit-telemetry

## When to use

Before and after **every** `Task` (subagent) dispatch — in the 11 orchestrator commands, in the nested-dispatch skills (`run-ticket-board`, `run-feature-queue`), and in every lead agent that dispatches its own workers. Pairs with skill `route-models` (same dispatch points).

The script self-gates: when telemetry is disabled it prints a `{"disabled":true}` handle and `span-end` no-ops. So the calls below are **unconditional** — never branch on enabled/disabled in prose. Every fault is swallowed and every subcommand exits 0; instrumentation never changes the caller's own exit behavior.

## Mint the trace once per run

At the **start** of a top-level command run, mint and persist the run identity — **once**:

1. If `<TELEMETRY_JSON>` already exists (a `/continue-*` resume — EC-2), **read** it; do **not** re-mint.
2. Otherwise mint two ids and write the file:
   ```bash
   TRACE_ID=$(node scripts/skailr/emit-telemetry.mjs new-id)
   ROOT_SPAN_ID=$(node scripts/skailr/emit-telemetry.mjs new-id)
   ```
   Then write `<TELEMETRY_JSON>`:
   ```json
   { "trace_id": "<TRACE_ID>", "root_span_id": "<ROOT_SPAN_ID>", "emitter_id": "<cmd-slug>" }
   ```

`<TELEMETRY_JSON>` path (consumer runtime, never pack-shipped):
- **Program commands** (`/yolo-program`, `/discover`, `/plan-program`, `/build-program`, `/continue-program`): `.claude/program/telemetry.json` — one trace per program run, shared by every nested feature/workstream.
- **Feature / patch / map commands** (`/patch`, `/yolo`, `/ship-feature`, `/build-feature`, `/continue-feature`, `/map-repo`): `<ARTIFACT_ROOT>/telemetry.json` (default `.claude/tmp/telemetry.json`).

`emitter_id` = the command's kebab slug (`patch`, `yolo`, `ship-feature`, `build-feature`, `continue-feature`, `map-repo`, `yolo-program`, `discover`, `plan-program`, `build-program`, `continue-program`). Resumes of the same command reuse the persisted id, so they append to the same file.

## Wrap every Task dispatch

Immediately **before** each Task dispatch, capture a handle:

```bash
HANDLE=$(node scripts/skailr/emit-telemetry.mjs span-start \
  --emitter-id <slug> \
  --trace-id "<TRACE_ID>" \
  --parent-span-id "<PARENT_SPAN_ID or omit>" \
  --agent-role <worker-role> \
  --agent-name <worker-name> \
  <hierarchy flags per table below>)
```

Immediately **after** the dispatch resolves, close it — passing the handle **verbatim**:

```bash
node scripts/skailr/emit-telemetry.mjs span-end \
  --handle "$HANDLE" \
  --status <ok|error|timeout|cancelled|blocked|over-budget> \
  [--error-code <code> --error-message <msg>]   # required together iff status ∈ {error,timeout}
```

Rules:
- **Capture** `span-start` stdout as `$HANDLE` and pass it **unchanged** to `span-end`. The handle carries `span_id`/`start_ts`/identity so start and end match (AC-1/AC-2/AC-8). Never reconstruct these by hand.
- **One handle per dispatch.** For a fan-out of N concurrent Tasks, capture N handles (one per Task) and close each with its own handle.
- `--status` (AC-2/AC-3/AC-19) is derived from **this caller's own** success/failure/blocked handling — do not invent a new decision:
  - normal `DONE:` return → `ok`
  - the caller's own error/gate-fail path → `error` with `--error-code`/`--error-message`
  - a timed-out / cancelled dispatch → `timeout` (with error fields) / `cancelled`
  - a worker that reports blocked, or a dispatch the caller refuses on budget → `blocked` / `over-budget` (AC-19, carried on the eventual `span-end`).

## parent_span_id (AC-5 / AC-6)

- **Root dispatch** — a Task issued directly by the top-level command, not from inside another in-flight span → **omit** `--parent-span-id` (⇒ `null`).
- **Nested dispatch** — a Task issued by an in-flight span (a lead agent dispatching a worker, or a nested-dispatch skill claiming+dispatching a worker) → `--parent-span-id` = **the dispatching span's own `span_id`** (the lead/board span). `--agent-role`/`--agent-name` name the **worker**, never the lead (AC-6). The nested caller reads `trace_id`/`emitter_id` from `<TELEMETRY_JSON>`; it does not mint a new trace.

## hierarchy_path per command (AC-7 / AC-8)

Pass only the levels the command can know at dispatch time, in fixed order `portfolio → repo → program → workstream → feature → ticket`; the script appends `agent-run:<span_id>`. Truncate at the deepest known level — never skip an intermediate level. Each present flag also sets the matching top-level record field; absent levels are `null` (`--ticket` keeps declared case in the field, lowercased in the path).

| Command(s) | Levels to pass |
|---|---|
| `/patch`, `/map-repo` | `--repo` only (script derives repo if omitted) |
| `/yolo`, `/ship-feature`, `/build-feature`, `/continue-feature` | `--feature`; add `--workstream` when nested under a program; add `--ticket` when a ticket board is active |
| `/yolo-program`, `/discover`, `/plan-program`, `/build-program`, `/continue-program` | `--program` + `--workstream`; add `--feature`/`--ticket` once a workstream's engineering queue starts |

`--repo` is auto-derived by the script when omitted (git remote basename → cwd basename). `--portfolio` defaults to `default`.

## Examples

Root dispatch from `/patch` (no parent, repo tier):

```bash
H=$(node scripts/skailr/emit-telemetry.mjs span-start --emitter-id patch \
  --trace-id "$TRACE_ID" --agent-role engineer --agent-name backend-engineer)
# ... dispatch the Task, await DONE: ...
node scripts/skailr/emit-telemetry.mjs span-end --handle "$H" --status ok
```

Nested worker dispatch from a lead (parent = lead's span_id; trace from telemetry.json):

```bash
H=$(node scripts/skailr/emit-telemetry.mjs span-start --emitter-id yolo-program \
  --trace-id "$TRACE_ID" --parent-span-id "$LEAD_SPAN_ID" \
  --agent-role content-writer --agent-name content-writer \
  --program "$PROGRAM" --workstream "$WS" --feature "$FEATURE")
# ... worker returns error ...
node scripts/skailr/emit-telemetry.mjs span-end --handle "$H" \
  --status error --error-code gate_failed --error-message "brand check failed"
```

## Scope note (AC-20)

This instrumentation is authored once under `.claude/`. It reaches `.cursor/` only via `remirror.sh` (commands and lead agent files are mirrored; this SKILL.md is not). v1 emission is scoped to the Claude Code Task-dispatch runtime — Cursor has no native Task-dispatch equivalent, so emission there is not asserted.
