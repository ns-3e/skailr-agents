# Cursor mirror

These rules and commands are **generated from** the authoritative Claude Code tree at `.claude/`.

| Claude Code | Cursor |
|---|---|
| `.claude/agents/<subdir>/*.md` | `.cursor/rules/<name>.mdc` |
| `.claude/commands/*.md` | `.cursor/commands/<name>.md` |
| `.claude/intake.md` | `.cursor/rules/intake.mdc` (always-applied plain-chat triage) + root `CLAUDE.md` |

**Edit `.claude/` first**, then re-mirror into `.cursor/` (`./scripts/remirror.sh`, pack maintainers only). Do not treat this directory as the source of truth.

Agent rules use `alwaysApply: false` with a `description` so they are agent-requestable (Apply Intelligently) rather than always loaded. The **intake** pointer rule is always applied.

Cursor cannot hard-restrict tools the way Claude Code agent frontmatter can. Restricted roles (`researcher`, `verifier`) carry an explicit prose restriction at the top of their rule.

Cursor has no native cross-agent Task dispatch: commands that dispatch subagents in Claude Code run in one Cursor session by invoking the corresponding rules in sequence (or via Background Agents for parallel steps) — each command file carries a note to that effect.
