# `/map-repo` — brownfield bootstrap

**Agents that build on a repo they've never read produce code in someone else's house style, on top of risks nobody surfaced.** `/map-repo` fixes that: drop skailr into an existing codebase and get a durable orientation, draft path ownership, an honest assessment, and a ranked backlog — before anything builds.

```
/map-repo
/map-repo auth and public UI     # optional focus lenses
```

It does **not** write application code and does **not** open a live program (`brief.md` / `ledger.md`). You confirm the baseline (a real human gate), then pick what to build. Business equivalent: **brownfield onboarding / tech lead repo audit**. Plain chat with onboard / brownfield / "map this repo" signals routes here via intake ([INTAKE.md](INTAKE.md)).

## When to use it — and when not to

| Situation | Use |
| --------- | --- |
| Just installed skailr into a non-empty repo | `/map-repo` first |
| Want a durable map + backlog before `/yolo` or `/discover` | `/map-repo` |
| One-off "where is auth?" | Plain-chat ask mode (researcher), not `/map-repo` |
| Already know the next feature and house style | `/yolo` / `/patch` (orientation helps but is optional) |
| Clarifying **what to build** (new initiative) | `/discover` or `/yolo-program` (reads orientation if present) |

## What runs

1. **Map** — `researcher` **repo mode** → `.claude/repo/orientation.md`
2. **Ownership** — draft `.claude/repo/ownership.json` (`skailr.ownership/v1`, `kernel.frozen: false`); validated with `check-ownership.mjs --map-only`
3. **Assess** — read-only lenses (researcher security/debt/tests; `design-reviewer` / `content-editor` when UI or public copy exists) → `findings.md`
4. **Backlog** — ranked items with suggested `/patch`, `/yolo`, or `/yolo-program` → `backlog.md` + draft `map-report.md`
5. **Confirm** — human gate (like `/discover`); revise or remap if needed
6. **Expert auto-mint** (internal, post-confirm) — skill `consult-or-mint` with `trigger: map-repo`. When `auto_mint` is on and a vertical shows enough independent signals, mints **internal** experts into `.claude/experts/` (same procedure as [`/mint-expert`](experts.md)); notifies via heads-up + durable log; never a second gate. An empty roster does not skip mint evaluation

Interrupted? Re-enter `/map-repo` (empty args or "continue") — it resumes from `.claude/repo/progress.md`.

## What you get (`.claude/repo/`)

Tracked by default — **commit the baseline** so teammates share the same map (unlike gitignored `.claude/tmp/` and most of `.claude/program/`).

| File | Role |
| ---- | ---- |
| `orientation.md` | Durable whole-repo map |
| `ownership.json` | Draft path ownership |
| `findings.md` | Assessment evidence |
| `backlog.md` | Ranked issues + lane hints |
| `map-report.md` | Summary + confirm status |
| `progress.md` | Phase checklist for resume |

Templates: `.claude/program/schemas/` (`orientation.template.md`, `backlog.template.md`, `map-repo-progress.template.md`, `map-report.template.md`).

## After you confirm

Pick a backlog item and run its suggested command. For a new multi-part initiative on this codebase, run `/discover` or `/yolo-program` — both prefer `.claude/repo/orientation.md` (and the draft ownership, when program ownership is absent). `/map-repo` never auto-starts a build; post-confirm auto-mint may create internal experts but starts nothing.

## `/map-repo` vs `/discover`

| | `/map-repo` | `/discover` |
| - | ----------- | ----------- |
| Question | What exists / what's wrong? | What should we build? |
| Output | Orientation, ownership draft, backlog | Confirmed program `brief.md` |
| Opens program ledger? | No | After `/plan-program` freeze |

## See also

- [README: existing repo path](../README.md#the-paths-end-to-end)
- [YOLO.md](YOLO.md) — prefer `/map-repo` on unfamiliar brownfield before the first `/yolo`
- [INTAKE.md](INTAKE.md) — plain-chat routing
- [experts.md](experts.md) — post-confirm internal auto-mint and `/mint-expert`
