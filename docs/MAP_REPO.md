# `/map-repo` brownfield bootstrap

Drop skailr into an **existing** codebase, then run `/map-repo` before you build features or programs. The command inventories what is already there, drafts path ownership, assesses gaps, and produces a ranked backlog. It does **not** write application code and does **not** open a live program (`brief.md` / `ledger.md`).

Business equivalent: **Brownfield onboarding / tech lead repo audit**.

## When to use

| Situation | Use |
| --------- | --- |
| Just installed skailr into a non-empty repo | `/map-repo` first |
| Want a durable map + backlog before `/yolo` or `/discover` | `/map-repo` |
| One-off “where is auth?” | Plain-chat ask mode (researcher), not `/map-repo` |
| Already know the next feature and house style | `/yolo` / `/patch` (orientation helps but is optional) |
| Clarifying **what to build** (new initiative) | `/discover` or `/yolo-program` (reads orientation if present) |

Plain chat with onboard / brownfield / “map this repo” signals routes here via intake ([INTAKE.md](INTAKE.md)).

## Phases

1. **Map** — `researcher` **repo mode** → `.claude/repo/orientation.md`
2. **Ownership** — draft `.claude/repo/ownership.json` (`skailr.ownership/v1`, `kernel.frozen: false`); validate with `check-ownership.mjs --map-only`
3. **Assess** — read-only lenses (researcher security/debt/tests; `design-reviewer` / `content-editor` when UI or public copy exists) → `findings.md`
4. **Backlog** — ranked items with suggested `/patch`, `/yolo`, or `/yolo-program` → `backlog.md` + draft `map-report.md`
5. **Confirm** — human gate (like `/discover`); revise or remap if needed
6. **Intair** (optional) — deliberate writes via skill `call-intair`; skip if unavailable → `intair-sync.md`
7. **Expert auto-mint** (internal, post-confirm) — when `auto_mint` is on and a vertical has enough independent signals, mints **internal** experts into `.claude/experts/` using the same procedure as [`/mint-expert`](experts.md); notifies via heads-up + durable log; never a second gate

Resume from incomplete `.claude/repo/progress.md` by re-entering `/map-repo` (empty args or “continue”).

## Artifacts (`.claude/repo/`)

Tracked by default (not gitignored like `.claude/tmp/` or most of `.claude/program/`). Commit the baseline so teammates share the same map.

| File | Role |
| ---- | ---- |
| `orientation.md` | Durable whole-repo map |
| `ownership.json` | Draft path ownership |
| `findings.md` | Assessment evidence |
| `backlog.md` | Ranked issues + lane hints |
| `map-report.md` | Summary + confirm status |
| `progress.md` | Phase checklist for resume |
| `intair-sync.md` | What Intair wrote or why skipped |

Templates live under `.claude/program/schemas/` (`orientation.template.md`, `backlog.template.md`, `map-repo-progress.template.md`, `map-report.template.md`).

## After confirm

Pick a backlog item and run the suggested command. For a new multi-part initiative on this codebase, run `/discover` or `/yolo-program`. Downstream flows prefer `.claude/repo/orientation.md` (and draft ownership when program ownership is absent).

`/map-repo` never auto-starts those builds. Post-confirm expert auto-mint (step 7) may create internal experts; it does not start a feature or program build.

## vs `/discover`

| | `/map-repo` | `/discover` |
| - | ----------- | ----------- |
| Question | What exists / what’s wrong? | What should we build? |
| Output | Orientation, ownership draft, backlog | Confirmed program `brief.md` |
| Opens program ledger? | No | After `/plan-program` freeze |

## Intair

Phase 5 may deliberately write orientation highlights and high/blocker findings into Intair when the client is configured. Intair is never required; see [intair-seam.md](intair-seam.md).

## See also

- [README Path: existing repo](../README.md#path-existing-repo-brownfield)
- [YOLO.md](YOLO.md) — prefer `/map-repo` on unfamiliar brownfield before first `/yolo`
- [INTAKE.md](INTAKE.md) — plain-chat routing
- [experts.md](experts.md) — post-confirm internal auto-mint and `/mint-expert`
