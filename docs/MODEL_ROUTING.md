# Model routing

Skailr does not call models itself — Claude Code and Cursor do. This pack ships a **role → model profile map** so you can optimize token usage and stretch rate limits without inventing a new agent runtime.

## Quick start

Default profile is **`balanced`** (matches the committed agent `model:` frontmatter).

```bash
# Switch profile and patch .claude/agents/**/model: frontmatter
node scripts/skailr/apply-model-routing.mjs --profile economy

# Verify agents match the active profile (CI uses this)
node scripts/skailr/apply-model-routing.mjs --check
# or: npm run models:check
```

Pack maintainers after applying a profile:

```bash
./scripts/remirror.sh
```

Installed projects only need `apply-model-routing.mjs` — Claude Code reads agent frontmatter; Cursor reads `.cursor/model-routing.md` (copied at install) and the Model notes on each rule.

## Profiles

| Profile | Intent |
| ------- | ------ |
| `balanced` | Current defaults: research/story/PM workers on Sonnet; architects, engineers, validators on Opus |
| `economy` | Digests (`status-reporter`, `risk-analyst`) → Haiku; writers/docs → Sonnet; hard judgment roles stay Opus |
| `quality` | Almost everything Opus; only `status-reporter` stays Sonnet |

Config: [`.claude/model-routing.json`](../.claude/model-routing.json).

## How it works

```text
.claude/model-routing.json
        │
        ▼
apply-model-routing.mjs ──► .claude/agents/**/*.md  (model: frontmatter)
        │
        ▼ (pack maintainers)
remirror.sh ──► .cursor/rules/*.mdc  +  .cursor/model-routing.md
        │
        ▼
Orchestrators (skill route-models) resolve model per Task dispatch
```

- **Claude Code:** named agents use their frontmatter `model:`. Keep frontmatter in sync with the active profile via the apply script.
- **Cursor:** remirror injects `**Model (Cursor Task):** …` into each rule and generates `.cursor/model-routing.md`. Pass that model on Task / Background Agent dispatch.

## Orchestrator rules (skill `route-models`)

Before every subagent Task:

1. Resolve the role’s model from the active profile.
2. **Downgrade** one tier for thin channel answers / pure digests (never below Haiku; never for `protected` roles).
3. **Escalate once** on quality-gate retry (thin research, ownership overlap, failed e2e, DO NOT SHIP / SHIP WITH FIXES).
4. **Log** one line to `.claude/tmp/model-usage.md` (feature) or `.claude/program/model-usage.md` (program).

YOLO commands still honor the active profile and escalate-on-retry.

## Token usage vs rate limits

- **Cheaper models** (economy profile) stretch usage limits on digests and drafting roles.
- **Smaller context** still matters more than model choice for long programs: keep JIT disclosure (registry → lead → workers), pass only the channel thread when routing answers, and prefer “read path X” over pasting full artifacts into every re-dispatch.
- Keep **validators and contract owners on Opus** even in economy — cheap failures there cost more rebuild tokens than they save.

## Adding an agent

1. Add the agent under `.claude/agents/<team-or-tier>/` (e.g. `engineering/`, `content/`, `design/`, `marketing/`, `finance/`). No flat files at agents root.
2. Add its name to **every** profile’s `roles` map in `model-routing.json`.
3. Run `npm run models:check` (or `apply-model-routing.mjs --check`).
4. Run `./scripts/remirror.sh`.

See [CONTRIBUTING.md](../CONTRIBUTING.md).
