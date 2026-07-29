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
| Small / localized change | [`/patch`](../.claude/commands/patch.md) |
| One cohesive feature | [`/yolo`](YOLO.md) |
| Whole app / MVP / many parts | [`/yolo-program`](YOLO.md) |

**Slash commands always win.** Incomplete feature/program runs resume via `/continue-feature` / `/continue-program` (or re-enter YOLO with no new prompt) — not a fresh patch.

Plain-chat auto-build uses **YOLO** paths only. For human gates, invoke `/ship-feature` or `/discover` → `/plan-program` → `/build-program` explicitly.

**Business roles (intake routes):** `/patch` = hotfix / small change request; `/yolo` = feature delivery without approval gates; `/yolo-program` = program delivery without approval gates (VP initiative, ungated). Full mapping: [README Command reference](../README.md#command-reference).

## `/patch` vs `/yolo` vs `/yolo-program`

| Command | Use when | Business equivalent |
| ------- | -------- | ------------------- |
| `/patch` | Bug fix, typo, tweak, single-surface change — syncs lineage/docs; YOLO-style (no human gates); light verify | **Hotfix / small change request** |
| `/yolo` | One feature, full pipeline (research → validate → docs) | **Feature delivery without approval gates** |
| `/yolo-program` | Whole product / multi-workstream initiative | **Program delivery without approval gates** |

`/patch` size-gates upward: if the ask is clearly a feature or whole app, it stops and points at `/yolo` or `/yolo-program`.

See also [YOLO.md](YOLO.md) and the [README](../README.md) [Command reference](../README.md#command-reference).
