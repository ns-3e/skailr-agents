# Telemetry emission

**A Skailr Console has no on-disk record of what the orchestrator actually did — it would have to poll and infer dispatch timing from `ledger.md`/`progress.md`/channels.** Skailr now emits append-only JSONL span records around every subagent dispatch, matching Console's fixed v1 schema — **opt-in, and structurally incapable of blocking or failing your run.** Skailr never sends this data anywhere; it only writes local files under `.skailr/`.

## Turn it on / verify (30 seconds)

Telemetry is **off by default**. It activates only when a project has opted in:

```bash
mkdir -p .skailr                         # simplest opt-in: presence of .skailr/ turns it on
# then run any command that dispatches a subagent, e.g. /patch, /yolo, /build-program
ls .skailr/telemetry/                    # → <YYYY-MM-DD>-<emitter-id>.jsonl once a dispatch fires
node scripts/skailr/telemetry-smoke.mjs  # executable proof: emit → re-read → recompute event_hash
```

To force it on or off regardless of `.skailr/` presence, add a `telemetry` block to `.claude/settings.skailr.json`:

```jsonc
{ "hooks": { /* unchanged */ }, "telemetry": { "enabled": false } }   // true | false
```

The pack ships this file **without** the `telemetry` key, so the default stays "derive from `.skailr/` presence."

## Gating rule

| `.claude/settings.skailr.json` | `.skailr/` exists? | Emits? |
| ------------------------------ | ------------------ | ------ |
| `telemetry.enabled: false`     | either             | no     |
| `telemetry.enabled: true`      | either             | yes    |
| key absent                     | no                 | **no** (safe default) |
| key absent                     | yes                | yes    |

A project that never set up Console never gets a `.skailr/telemetry/` file or directory. The gate lives inside the emitter script, not in command prose — it cannot be half-applied.

## What gets emitted, and when

Every subagent Task dispatch across all **11 orchestrator commands** (`patch`, `yolo`, `ship-feature`, `build-feature`, `continue-feature`, `map-repo`, `yolo-program`, `discover`, `plan-program`, `build-program`, `continue-program`), plus nested lead→worker dispatches (`run-feature-queue`, `run-ticket-board`, and the 8 dispatching domain leads), is wrapped in a pair:

- `span.start` — appended **before/at** dispatch: fresh `span_id`, `start_ts` = dispatch instant, `end_ts`/`duration_ms` null, `status: "ok"`.
- `span.end` — appended when the dispatch returns: same `span_id`, `end_ts` = return instant, `duration_ms = end_ts − start_ts` (exact ms), and `status` = `ok` / `error` / `timeout` / `cancelled` / `blocked` / `over-budget`. On `error`/`timeout`, a non-null `error: { code, message }`.

One `trace_id` is minted per run and threaded through every span — including dispatches made after a `/continue-feature` or `/continue-program` resume (persisted in `<ARTIFACT_ROOT>/telemetry.json`, a consumer-runtime file). Root dispatches carry `parent_span_id: null`; a lead's worker carries the lead's `span_id`.

## File location, naming, rotation

```text
<repo>/.skailr/telemetry/<YYYY-MM-DD>-<emitter-id>.jsonl
```

- `<YYYY-MM-DD>` — current **UTC** date. `<emitter-id>` — the command's kebab slug (`patch`, `yolo`, `build-program`, …), `[a-z0-9-]{1,32}`.
- One compact JSON object per line, LF-terminated, UTF-8 no BOM. Each line is written in a single atomic `O_APPEND` syscall — a killed process never leaves a partial line, and no line is ever rewritten in place.
- **Rotation:** on UTC date rollover, appends move to the new date's file. When the active file would cross **100 MiB**, appends move to `<date>-<emitter-id>-<k>.jsonl` (smallest `k ≥ 1` that fits). Existing files are never truncated.
- Files are consumer runtime state: `install.sh` never creates, modifies, or deletes anything under `.skailr/`, and `.skailr/` is added to the installed project's `.gitignore`.

## Reading and verifying a record

A real emitted `span.start` line (formatted here for reading — on disk it is one line):

```jsonc
{
  "v": 1,
  "event_hash": "sha256:f14e62d4323a4cc03aada97c18e81fe3268e3001dd29388241e7f909da5e68c6",
  "emit_seq": 1,
  "ts": "2026-08-04T16:18:28.553Z",
  "start_ts": "2026-08-04T16:18:28.553Z", "end_ts": null, "duration_ms": null,
  "event_type": "span.start",
  "trace_id": "1979bf1e-5289-4045-9863-de53c17a2e0b",
  "span_id": "e8477bf4-778a-43b0-88ef-cbb2a05748ba",
  "parent_span_id": null,
  "hierarchy_path": "portfolio:default/repo:demo-repo/agent-run:e8477bf4-778a-43b0-88ef-cbb2a05748ba",
  "repo": "demo-repo", "program": null, "workstream": null, "feature": null, "ticket": null,
  "agent_role": "researcher", "agent_name": "researcher", "model": null,
  "tokens_in": null, "tokens_out": null, "cache_read_tokens": null, "cache_write_tokens": null,
  "cost_usd": null, "price_table_version": null,
  "status": "ok", "corrects_event_hash": null, "error": null, "attrs": {}
}
```

`hierarchy_path` always begins with the `portfolio:default/repo:<repo>` base (every run knows its own repo, derived from `git remote`/cwd; `portfolio:default` is the schema's no-portfolio sentinel), then adds the deepest levels the command knows — `program:`/`workstream:`/`feature:`/`ticket:` — and ends with `agent-run:<span_id>`. The top-level `repo`/`program`/`workstream`/`feature`/`ticket` fields mirror their path segments (`ticket` keeps declared case, e.g. `T-003`, while the path segment is lowercased); absent levels are `null`.

### Verifying `event_hash`

`event_hash = "sha256:" + hex_lower(sha256(JCS(identity_subset)))` over exactly these 17 fields — `v, emit_seq, ts, event_type, trace_id, span_id, parent_span_id, hierarchy_path, agent_role, agent_name, model, tokens_in, tokens_out, cache_read_tokens, cache_write_tokens, status, corrects_event_hash`. Everything else (`attrs`, `error`, `cost_usd`, `start_ts`/`end_ts`/`duration_ms`, the `repo`/`program`/… mirror fields, `price_table_version`) is **excluded** — those are derivable, presentational, or correctable, and must not affect identity. JCS is [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785): keys sorted by UTF-16 code unit, no insignificant whitespace, integer numbers. In v1 all token fields are null, so no non-integer number ever enters the subset.

`node scripts/skailr/telemetry-smoke.mjs` emits a pair and recomputes the hash independently. To check a line already on disk:

```bash
node --input-type=module -e '
import{createHash}from"node:crypto";import{readFileSync}from"node:fs";
const SUB=["v","emit_seq","ts","event_type","trace_id","span_id","parent_span_id","hierarchy_path","agent_role","agent_name","model","tokens_in","tokens_out","cache_read_tokens","cache_write_tokens","status","corrects_event_hash"];
function jcs(v){if(v===null)return"null";const t=typeof v;if(t==="string")return JSON.stringify(v);if(t==="number"){if(!Number.isInteger(v))throw 0;return String(v);}if(t==="boolean")return v?"true":"false";if(Array.isArray(v))return"["+v.map(jcs).join(",")+"]";return"{"+Object.keys(v).sort().map(k=>JSON.stringify(k)+":"+jcs(v[k])).join(",")+"}";}
for(const l of readFileSync(process.argv[1],"utf8").replace(/\r/g,"").trim().split("\n")){
  const r=JSON.parse(l),s={};for(const k of SUB)s[k]=r[k];
  const got="sha256:"+createHash("sha256").update(jcs(s),"utf8").digest("hex");
  console.log(got===r.event_hash?"MATCH "+r.span_id:"MISMATCH "+r.span_id);
}
' .skailr/telemetry/<file>.jsonl
```

`emit_seq` is `1 + max(emit_seq)` scanned from the active file (0 if new), scoped per emitter-id per UTC day — not a global counter. Benign cross-session ties are acceptable; `span_id` + `ts` are the real per-event identity.

The record contract is the JSON Schema at [`.claude/program/schemas/telemetry-event.schema.json`](../.claude/program/schemas/telemetry-event.schema.json) (draft 2020-12; `$comment` carries the hashing algorithm verbatim). Skailr Console is a separate product that consumes these files; this repo only produces them.

## v1 scope boundary

v1 emits **`span.start` and `span.end` only**, plus `status: "blocked"` / `status: "over-budget"` carried on the eventual `span.end`. Deliberately **not** in v1 (reserved in the schema's enums, noted here so the gap is visible rather than silently absent):

- **`usage` events** — real `tokens_in`/`tokens_out`/`cache_read_tokens`/`cache_write_tokens`/`cost_usd`. No token/cost data is available from a Task result in this runtime, so these fields are hardcoded `null` and never fabricated. This is the largest deferred item.
- **`task.transition`, `channel.post`, `agent.status`, `budget.violation`** event types — Console already derives equivalent state from `plan.md`/`ledger.md`/channel files.
- **The 5-status ticket board** (`status: in-review`, `claimed_by`) and **channel `seen_by` markers** — each a separate, smaller follow-up.
- **`correction` emission** — the hash-exclusion rules for `corrects_event_hash` are respected, but no v1 flow issues corrections.
- **Cursor-native emission** — instrumentation is authored once under `.claude/` and mirrored to `.cursor/` via `remirror.sh`, but is not asserted to fire under Cursor (no Task-dispatch runtime there). v1 emission is scoped to the Claude Code Task-dispatch runtime.
- **Backfill** — no reconstruction of runs that happened before this shipped; the first dispatch after opt-in starts a fresh file.
