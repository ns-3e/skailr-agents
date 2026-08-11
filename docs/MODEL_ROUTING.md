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
| `balanced` | Opus by default for every role, including workers (backend/frontend engineers, researcher, story-writer, and the rest of the individual-contributor roles) — the escalation logs on real campaigns showed retries after a validator/e2e failure almost never actually bumped tier in practice, so the floor moved up instead of relying on escalation to catch it. The three roles that own a program's or portfolio's high-level plan (`architect`, `program-architect`, `portfolio-architect`) route to **Fable** instead, when available, as the dedicated planning/design model. `status-reporter` is the one deliberate exception, staying on Sonnet — a pure digest-compile role with no judgment calls, matching the `quality` profile's own precedent |
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

**Note on escalation headroom in `balanced`:** most roles in this profile now start at Opus, the top of the `escalation` ladder (`haiku` → `sonnet` → `opus`) — a retry has nowhere left to escalate to, which is intentional (the role already gets the strongest tier on the ladder from its first dispatch, not just after a failure). Real campaign logs before this change showed step 3 rarely fired in practice even when it should have (a caught security bug's fix dispatch stayed on the same tier that produced it) — moving the floor up removes the dependency on that step actually triggering for these roles.

**High-level planning roles route to Fable, not the tier ladder.** `architect` (feature seam), `program-architect` (program decomposition/contracts), and `portfolio-architect` (portfolio decomposition) are mapped directly to `"fable"` in `model-routing.json`'s `balanced` profile, the same way any other role maps to `"opus"` or `"sonnet"` — there is no separate indirection key and no automatic fallback wired into `apply-model-routing.mjs`. If Fable turns out to be unavailable in a given account/environment, the dispatch will fail rather than silently downgrade; a maintainer switches that role back to `"opus"` in the config (and re-runs `apply-model-routing.mjs`) the same way any other role's tier gets changed. Not yet verified end-to-end against a real Claude Code subagent Task dispatch — confirmed only that the installed CLI (`claude --help`) lists `fable` as a recognized `--model` alias.

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
