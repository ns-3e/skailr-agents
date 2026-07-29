# Cursor mirror

These rules and commands are **generated from** the authoritative Claude Code tree at `.claude/`.

| Claude Code | Cursor |
|---|---|
| `.claude/agents/<subdir>/*.md` | `.cursor/rules/<name>.mdc` (includes Model Task note) |
| `.claude/commands/*.md` | `.cursor/commands/<name>.md` |
| `.claude/teams/registry.md` | `.cursor/rules/registry.mdc` (thin always-applied pointer) |
| `.claude/intake.md` | `.cursor/rules/intake.mdc` (always-applied plain-chat triage) + root `CLAUDE.md` |
| `.claude/model-routing.json` | `.cursor/model-routing.md` (active profile role table) |

**Edit `.claude/` first**, then re-mirror into `.cursor/`. Do not treat this directory as the source of truth.

Agent rules use `alwaysApply: false` with a `description` so they are agent-requestable (Apply Intelligently) rather than always loaded — preserving just-in-time disclosure. The **registry** and **intake** pointer rules are always applied.

Cursor cannot hard-restrict tools the way Claude Code agent frontmatter can. Restricted roles (`researcher`, `validator`, `program-validator`) carry an explicit prose restriction at the top of their rule.

**Model routing:** switch profiles with `node scripts/skailr/apply-model-routing.mjs --profile economy` (then remirror). Docs: [docs/MODEL_ROUTING.md](../docs/MODEL_ROUTING.md).
