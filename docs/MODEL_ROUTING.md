# Model routing

**Every role on the biggest model burns budget; every role on the cheapest fails gates.** Skailr ships a role → model profile map so each agent runs on the model its job actually needs — without inventing a new runtime. Skailr never calls models itself; Claude Code and Cursor do.

## Switch profiles (10 seconds)

Default is **`balanced`** (matches the committed agent `model:` frontmatter).

```bash
node scripts/skailr/apply-model-routing.mjs --profile economy   # stretch limits
node scripts/skailr/apply-model-routing.mjs --profile quality   # prefer opus
node scripts/skailr/apply-model-routing.mjs --check             # verify (CI runs this)
# or: npm run models:check
```

Pack maintainers run `./scripts/remirror.sh` after applying a profile. Installed projects only need the apply script — Claude Code reads agent frontmatter; Cursor reads `.cursor/model-routing.md` and the Model note on each rule.

## The profiles

| Profile | Intent |
| ------- | ------ |
| `balanced` | Worker roles that execute against an Opus-authored spec — research/story **and** the backend/frontend engineers, plus `content-writer`, `designer`, `fin-modeler` — on Sonnet; architect, leads, planners (`pm-planner`, `channel-planner`), verifiers, and validators on Opus. `data-engineer` stays Opus (schema reasoning often lacks a full upstream spec) |
| `economy` | Digests (`status-reporter`, `risk-analyst`) and templated workers (`legal-analyst`; planners drop to Haiku in this profile only) → Haiku; writers/docs → Sonnet; engineers and hard-judgment roles stay Opus |
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

- **Claude Code:** named agents use their frontmatter `model:`. Keep it in sync with the active profile via the apply script.
- **Cursor:** remirror injects `**Model (Cursor Task):** …` into each rule and generates `.cursor/model-routing.md`. Pass that model on Task / Background Agent dispatch.

Before every subagent Task, orchestrators (skill `route-models`):

1. Resolve the role's model from the active profile.
2. **Downgrade** one tier for thin channel answers / pure digests (never below Haiku; never for `protected` roles).
3. **Escalate once** on quality-gate retry (thin research, ownership overlap, failed e2e, DO NOT SHIP / SHIP WITH FIXES).
4. **Log** one line to `.claude/tmp/model-usage.md` (feature) or `.claude/program/model-usage.md` (program).

YOLO commands honor the active profile and escalate-on-retry like everything else.

## Spending the savings where they matter

- **Cheaper models** (economy) stretch usage limits on digests and drafting roles.
- **Smaller context beats cheaper models** on long programs: keep JIT disclosure (registry → lead → workers), pass only the channel thread when routing answers, and prefer "read path X" over pasting artifacts into every re-dispatch.
- Keep **validators and contract owners on Opus** even in economy — a cheap failure there costs more rebuild tokens than it saves.

<details>
<summary><strong>Adding an agent</strong> (pack maintainers)</summary>

1. Add the agent under `.claude/agents/<team-or-tier>/` (no flat files at agents root).
2. Add its name to **every** profile's `roles` map in `model-routing.json`.
3. Run `npm run models:check`.
4. Run `./scripts/remirror.sh`.

See [CONTRIBUTING.md](../CONTRIBUTING.md).

</details>
