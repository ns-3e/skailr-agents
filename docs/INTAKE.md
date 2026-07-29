# Plain-chat intake

When skailr-agents is installed, **plain chat** (no slash command) is routed automatically so the default agent does not freestyle outside the operating model.

| Runtime | Always-on file |
| ------- | -------------- |
| Claude Code | `CLAUDE.md` (generated from [`.claude/intake.md`](../.claude/intake.md)) |
| Cursor | [`.cursor/rules/intake.mdc`](../.cursor/rules/intake.mdc) (`alwaysApply: true`) |

Authoritative source: [`.claude/intake.md`](../.claude/intake.md). Detailed heuristics: skill `route-intake`. Do not hand-edit generated `CLAUDE.md` or `intake.mdc` — edit `.claude/intake.md` and run `./scripts/remirror.sh`.

## Chooser

| Ask looks like… | Route |
| --------------- | ----- |
| Question / explain / where / how (**no** code change) | Task `researcher` **ask mode** → `.claude/tmp/ask.md` + answer in chat |
| Map / onboard / brownfield baseline / audit this repo | [`/map-repo`](MAP_REPO.md) |
| Small / localized change | [`/patch`](../.claude/commands/patch.md) |
| One cohesive feature | [`/yolo`](YOLO.md) |
| Whole app / MVP / many parts | [`/yolo-program`](YOLO.md) |

**Slash commands always win.** Incomplete feature/program/map-repo runs resume via `/continue-feature` / `/continue-program` / `/map-repo` (or re-enter YOLO with no new prompt) — not a fresh patch.

Plain-chat auto-build uses **YOLO** paths only (plus `/map-repo` for brownfield baseline). For human gates on product initiatives, invoke `/ship-feature` or `/discover` → `/plan-program` → `/build-program` explicitly.

**Business roles (intake routes):** `/map-repo` = brownfield onboarding / tech lead repo audit; `/patch` = hotfix / small change request; `/yolo` = feature delivery without approval gates; `/yolo-program` = program delivery without approval gates (VP initiative, ungated). Full mapping: [README Command reference](../README.md#command-reference).

## `/map-repo` vs `/patch` vs `/yolo` vs `/yolo-program`

| Command | Use when | Business equivalent |
| ------- | -------- | ------------------- |
| `/map-repo` | Existing repo: inventory, ownership draft, assessment backlog; confirm before build | **Brownfield onboarding / tech lead repo audit** |
| `/patch` | Bug fix, typo, tweak, single-surface change — syncs lineage/docs; YOLO-style (no human gates); light verify | **Hotfix / small change request** |
| `/yolo` | One feature, full pipeline (research → validate → docs) | **Feature delivery without approval gates** |
| `/yolo-program` | Whole product / multi-workstream initiative | **Program delivery without approval gates** |

`/patch` size-gates upward: if the ask is clearly a feature or whole app, it stops and points at `/yolo` or `/yolo-program`. One-off “where is X?” stays on ask-mode researcher; inventory/backlog/onboard goes to `/map-repo`.

See also [MAP_REPO.md](MAP_REPO.md), [YOLO.md](YOLO.md), and the [README](../README.md) [Command reference](../README.md#command-reference).
