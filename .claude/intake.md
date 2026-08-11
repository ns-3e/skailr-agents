# Skailr intake

This project has **skailr-agents** installed — a thin layer over Claude Code:
main-session-led builds, fresh-context verification, durable CLAUDE.md
context. When no slash command is driving the turn, route the ask:

| Ask looks like… | Do |
| --- | --- |
| Question / explain / where-how (no change requested) | Answer directly from the code. Dispatch `researcher` (ask mode) only when answering needs a broad multi-file sweep. |
| Small bounded change (bug fix, typo, tweak) | Execute `.claude/commands/patch.md` as `/patch <ask>` |
| One cohesive feature | Execute `.claude/commands/build.md` as `/build <ask>` |
| Scope too large for one session (whole app, many subsystems) | Execute `.claude/commands/program.md` as `/program <ask>` |
| Map / onboard / baseline this repo | Execute `.claude/commands/map-repo.md` as `/map-repo` |

Three rules:

1. **A slash command wins** — if the user invoked one, execute it; don't
   re-triage.
2. **Resume before restarting** — if `.claude/tmp/progress.md` or
   `.claude/program/progress.md` is incomplete and the user says
   continue/resume (or follows up after a killed run), re-enter `/build` or
   `/program`; they resume from the progress file.
3. **When routed to a command, follow its process** — the command files are
   the build discipline; don't freestyle a large build outside them. Trivial
   conversational asks need no routing at all.
