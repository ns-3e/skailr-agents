# Plain-chat intake

**You shouldn't have to memorize fifteen slash commands.** With skailr installed, you just talk — intake classifies the ask and routes it into the operating model, so the default agent never freestyles application work outside it.

## How an ask routes

| Ask looks like… | Route |
| --------------- | ----- |
| Question in **exactly one** registered expert's band (`.claude/experts/registry.md`) | Task `expert` **advise mode** → `.claude/tmp/ask.md` + answer in chat (names the expert). Zero or two-or-more matches fall through |
| Question / explain / where / how (**no** code change) | Task `researcher` **ask mode** → `.claude/tmp/ask.md` + answer in chat |
| Map / onboard / brownfield baseline / audit this repo | [`/map-repo`](MAP_REPO.md) |
| Small / localized change | [`/patch`](../.claude/commands/patch.md) |
| One cohesive feature | [`/yolo`](YOLO.md) |
| Whole app / MVP / many parts | [`/yolo-program`](YOLO.md) |

Two tie-breakers fire before any build row commits:

- **Unmapped brownfield.** A build ask on a non-trivial repo with no `.claude/repo/orientation.md` gets a one-sentence `/map-repo` offer first — build immediately if declined, never auto-run.
- **Multi-feature phrased as one.** An ask naming three or more separable capabilities is program-shaped; intake confirms `/yolo-program` in one sentence before falling back to `/yolo`.

## The rules behind the table

**Slash commands always win.** If you ran a command (or are clearly continuing one), intake never re-triages.

**Incomplete runs resume, never restart.** A killed feature/program/map-repo run resumes via `/continue-feature` / `/continue-program` / `/map-repo` (or by re-entering YOLO with no new prompt) — not a fresh `/patch`.

**Plain-chat auto-build is YOLO-only.** Talking never puts you behind approval gates you didn't ask for; it also never adds them. For human gates, invoke `/ship-feature` or `/discover` → `/plan-program` → `/build-program` explicitly.

**Plain chat never mints.** Intake consults the expert roster; only [`/mint-expert`](experts.md) writes to it.

**`/patch` size-gates upward.** If the ask is clearly a feature or a whole app, `/patch` stops and points at `/yolo` or `/yolo-program`. A one-off "where is X?" stays on ask-mode researcher; inventory/backlog/onboard goes to `/map-repo`.

## Where routing lives

| Runtime | Always-on file |
| ------- | -------------- |
| Claude Code | `CLAUDE.md` (generated from [`.claude/intake.md`](../.claude/intake.md)) |
| Cursor | [`.cursor/rules/intake.mdc`](../.cursor/rules/intake.mdc) (`alwaysApply: true`) |

Authoritative source: [`.claude/intake.md`](../.claude/intake.md). Detailed heuristics: skill `route-intake`. Never hand-edit generated `CLAUDE.md` or `intake.mdc` — edit `.claude/intake.md` and run `./scripts/remirror.sh`.

## The four build routes, side by side

| Command | Use when | Business equivalent |
| ------- | -------- | ------------------- |
| `/map-repo` | Existing repo: inventory, ownership draft, assessment backlog; confirm before build | **Brownfield onboarding / tech lead repo audit** |
| `/patch` | Bug fix, typo, tweak, single-surface change — syncs lineage/docs; no human gates; light verify | **Hotfix / small change request** |
| `/yolo` | One feature, full pipeline (research → validate → docs) | **Feature delivery without approval gates** |
| `/yolo-program` | Whole product / multi-workstream initiative | **Program delivery without approval gates** |

See also [MAP_REPO.md](MAP_REPO.md), [YOLO.md](YOLO.md), [experts.md](experts.md), and the [README Command reference](../README.md#command-reference).
