# Cursor mirror

These rules and commands are **generated from** the authoritative Claude Code tree at `.claude/`.

| Claude Code | Cursor |
|---|---|
| `.claude/agents/*.md` (+ `content/`) | `.cursor/rules/<name>.mdc` |
| `.claude/commands/*.md` | `.cursor/commands/<name>.md` |
| `.claude/teams/registry.md` | `.cursor/rules/registry.mdc` (thin always-applied pointer) |

**Edit `.claude/` first**, then re-mirror into `.cursor/`. Do not treat this directory as the source of truth.

Agent rules use `alwaysApply: false` with a `description` so they are agent-requestable (Apply Intelligently) rather than always loaded — preserving just-in-time disclosure. The registry pointer rule is always applied.

Cursor cannot hard-restrict tools the way Claude Code agent frontmatter can. Restricted roles (`researcher`, `validator`, `program-validator`) carry an explicit prose restriction at the top of their rule.
