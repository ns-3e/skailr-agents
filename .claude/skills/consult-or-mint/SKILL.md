---
name: consult-or-mint
description: Match existing expert bands and optionally auto-mint internal experts (T2/T3) when signal threshold is met. Empty roster is not a skip. Re-consult after mint; carry matched slugs for co-author/gate. Use from build and map-repo expert setup.
---

# Skill: consult-or-mint

## When to use

When a build or map command reaches its expert setup (or mint-after-evidence) step: `/yolo`, `/ship-feature`, `/patch`, `/plan-program`, `/yolo-program`, `/build-program` (recovery), `/map-repo` post-confirm.

Caller must pass:

| Input | Meaning |
| --- | --- |
| `mode` | `consult-only` \| `consult-and-mint` |
| `trigger` | `map-repo` (T2) or `build-consult` (T3); ignored for `consult-only` |
| `request` | Path or text of the active ask (request.md, patch-request, `$ARGUMENTS`, brief) |
| `carry_to` | Where to write the carry-forward note (`progress.md` Notes, `plan.md`, `brief.md`, etc.) |
| `evidence` | Optional paths that may supply T3 signals (`research.md`, `orientation.md`, `backlog.md`, `brief.md`, `plan.md`) |

Not for plain-chat intake (intake never mints). Not for explicit `/mint-expert` (T1). Not for curate.

## Non-negotiables

1. **Missing `.claude/experts/` or `registry.md` = empty roster for consult.** It does **not** skip mint evaluation.
2. **Missing `config.json` = all defaults** (`gate_mode: soft`, `auto_mint: true`, `roster_cap: 7`, `mint_threshold: 2`). Not a skip.
3. **Degrade (continue normally) only for:** missing `/mint-expert` command (or mint procedure), `auto_mint: false`, missing `check-experts.mjs`, `no-expert` dispatch return, below-threshold signals. **Not** for empty roster.
4. **Silence:** never warn or narrate absent roster, missing config, or skipped gate/co-author to the user. Chatter only when something was minted (or a channel near-miss heads-up).
5. **T2/T3 mint `internal` only**, always `provisional` + `gate: soft`. Cap: at most one mint per vertical per run.
6. **Gate/co-author read the carry-forward note**, never “does registry exist?”

## Procedure

### 1. Resolve config

Read `.claude/experts/config.json`. Missing → defaults above. Unparseable / bad `gate_mode` → report usage error and stop mint (consult may still run with empty matches). Record `auto_mint`, `mint_threshold`, `roster_cap`.

### 2. Consult

Read the Roster table in `.claude/experts/registry.md`. Missing file → treat as empty table (0 matches).

Select every non-`deprecated` row whose `route-when` covers the active request (and, when minting later for a workstream, that workstream’s scope). Record matched slugs, or `none`.

Do **not** open profiles to decide; the roster table is the whole routing surface. Ambiguity (0 or 2+ equally plausible bands for a single ask) is caller-context dependent: feature intake-style asks use exact-one for advise; build setup may record **every** covering band for co-author/gate.

### 3. Mint eval (only if `mode: consult-and-mint`)

Skip this entire step when `mode: consult-only`.

Skip mint (continue with consult results only) when:

- `auto_mint` is false
- `.claude/commands/mint-expert.md` is missing
- `scripts/skailr/check-experts.mjs` is missing

Otherwise, for each candidate **vertical** (a distinct domain/subsystem named by signals below), count **independent** signals. Independent means different sources. Require at least `mint_threshold` (default 2).

| Qualifying signal | Counts as |
| --- | --- |
| A Directory Boundaries entry in `.claude/repo/orientation.md` for that vertical | 1 |
| Two or more `.claude/repo/backlog.md` items sharing a category for that vertical | 1 total, not one each |
| Explicit human mention of the vertical in the active request (`request.md` / patch-request / `$ARGUMENTS` / brief goals) | 1 |
| A researcher/architect artifact names that vertical against **concrete repo paths** (`.claude/tmp/research.md` Prior Art, or brief/plan subsystem cut that cites real paths) | 1 |
| Three or more consult attempts **in this run** that found no band for the same vertical | 1 total |

Below threshold: mint nothing. You may post a single channel `heads-up` naming the near-miss vertical. Write the tally into the carry-forward note. A one-signal vertical is no mint (typical `/patch`).

Do **not** mint a vertical whose band is already covered by a non-deprecated roster row.

### 4. Mint (when a vertical qualifies)

Follow `.claude/commands/mint-expert.md` §Reuse by the auto-mint triggers exactly (nine steps), with:

- `classification: internal`, `maturity: provisional`, `gate: soft`
- `minted.by: map-repo` when `trigger: map-repo`, else `build-consult`
- Abandon at first failure; delete invalid profiles
- Notify via `heads-up` to `@all` + durable registry log line (never `to: @human`, never `type: contract-change`)
- Soft `roster_cap` check after mint (heads-up only; never block)

At most one mint per vertical per invocation of this skill.

### 5. Re-consult

After any successful mint, re-read `.claude/experts/registry.md` and update matched slugs for this run (newly minted experts are eligible immediately for advise/co-author; gate remains advisory while `provisional`).

### 6. Carry forward

Append or update a short structured note at `carry_to` (caller path). Shape:

```markdown
### Experts (consult-or-mint)
- matched: <slug, …> | none
- mode: consult-only | consult-and-mint
- trigger: map-repo | build-consult | n/a
- mint: <slug> (<signals>) | skip (<reason>) | near-miss (<vertical>: <n>/<threshold>)
- signal tally: <vertical>: <list of signal sources>
```

Later co-author and gate steps **must** read `matched:` from this note. Empty `matched: none` → skip co-author/gate with **no user-facing mention**.

### 7. Silence check

Before ending: confirm you did not tell the user that the registry/config was missing, or that you “skipped the expert gate because no registry.” Those are internal no-ops, not status lines.

## Caller timing (summary)

| Command | Early | Mint (`consult-and-mint`) |
| --- | --- | --- |
| `/yolo`, `/ship-feature` | Before Phase 1: `consult-only` | After research, before story |
| `/patch` | Setup: `consult-and-mint` (usually below threshold) | Same step |
| `/plan-program` | Before decomposition: `consult-only` | After brief confirmed, with orientation/brief evidence; carry into `plan.md` |
| `/yolo-program` | Before Phase 1: `consult-only` | After auto-brief, before/with plan; carry into `plan.md` |
| `/map-repo` | — | Post-confirm: `consult-and-mint`, `trigger: map-repo` |
| `/build-program` | Use plan carry-forward | If plan says `none` but orientation+brief now qualify: one recovery `consult-and-mint` at Phase B start |

## Do not

- Treat empty roster as “experts off”
- Lower `mint_threshold` or mint on one signal
- Mint `external` / `hybrid` from this skill
- Promote provisional → established
- Narrate skipped gate/co-author or absent roster to the user
- Hand-edit the generated regions of `registry.md`
