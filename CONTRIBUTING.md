# Contributing

Thanks for helping improve skailr-agents.

## Source of truth

- **Edit `.claude/` first** — agents under `.claude/agents/`, commands under `.claude/commands/`, registry at `.claude/teams/registry.md`, intake at `.claude/intake.md`, channel templates under `.claude/program/channels/`.
- **Re-mirror Cursor** after Claude changes:

```bash
./scripts/remirror.sh
```

Do **not** hand-edit generated `.cursor/rules/*.mdc`, `.cursor/commands/*.md`, or root `CLAUDE.md` except via the remirror script. Those files are derived from `.claude/`. Remirror special-cases **registry** and **intake** as `alwaysApply: true` Cursor rules (and regenerates `CLAUDE.md` from intake).

## Maintainer conventions (when changing this repo)

- Prefer the smallest diff that solves the problem; avoid speculative abstractions.
- State assumptions; don’t silently invent missing agents or teams.
- After changing agent `name:` frontmatter, keep it equal to the filename stem.
- Agent and command **bodies** follow Anthropic’s labeled 10-step prompt structure (below). Skills are exempt.

### Prompt body structure (agents and commands)

After YAML frontmatter, the body **must** use these exact H2s in order. Relocate existing content; do not invent new voice. Empty steps get a one-line `N/A.`

1. Task context — role identity (`You are the …`)
2. Tone context — stance / persona
3. Background data, documents, and images — inputs to read
4. Detailed task description & rules — process, prime directive, modes, Intair, channels
5. Examples — few-shots only; else `N/A.`
6. Conversation history — `N/A.` for static role prompts
7. Immediate task description or request — do-the-job-now, `$ARGUMENTS`, completion criteria
8. Thinking step by step — short CoT cue
9. Output formatting — output contract / report shapes; **last line must be** `Be extremely concise. Sacrifice grammar for the sake of concision.`
10. Prefillled response (if any) — `N/A.` unless the prompt truly prefills assistant text

Hard rule: the concision line appears **only once**, as the last line of §9 — never after frontmatter, never after §10.

## Adding an agent

1. Create `.claude/agents/<team-or-tier>/<name>.md` (e.g. `.claude/agents/engineering/architect.md`, `.claude/agents/content/content-lead.md`, `.claude/agents/design/design-lead.md`) with frontmatter: `name`, `description`, `tools`, `model`. No flat files under `.claude/agents/` root.
2. Set `name:` to the filename without `.md`.
3. Write the body using the 10-step prompt structure above (concision line only at end of §9).
4. Add `<name>` to **every** profile’s `roles` map in [`.claude/model-routing.json`](.claude/model-routing.json), then run `npm run models:check` (or `node scripts/skailr/apply-model-routing.mjs --check`).
5. If the agent is read-only over app code but may post to channels, grant `Write` and `Edit` only for channel appends (and other allowed artifacts) and document that in the body (§4). Claude Code prefers `Edit` for existing files; `Write` without `Edit` forces full-file rewrites. Run `npm run check:agent-tools` to verify.
6. Run `./scripts/remirror.sh`.
7. Regenerate `manifest.json` (remirror script updates it) or add the artifact by hand.
8. Smoke-test: `./install.sh /tmp/skailr-smoke && rm -rf /tmp/skailr-smoke`.

See [docs/MODEL_ROUTING.md](docs/MODEL_ROUTING.md) for profiles (`economy` / `balanced` / `quality`).

## Adding a skill

1. Create `.claude/skills/<name>/SKILL.md` with frontmatter `name` + `description`.
2. Prefer calling `scripts/skailr/*.mjs` for anything that must be mechanically true.
3. Run `./scripts/remirror.sh` (skills are listed in `manifest.json`).

## Adding a command

1. Create `.claude/commands/<name>.md` with `description` (and `argument-hint` / `allowed-tools` as needed). Standard orchestrator allowlist: `Task, Read, Grep, Glob, Write, Edit, Bash`. If you include `Write`, include `Edit`; if you include `Read`, include `Grep` and `Glob`. Verify with `npm run check:agent-tools`.
2. Write the body using the 10-step prompt structure above (orchestrator identity → §1; rules/phases → §4; `$ARGUMENTS` → §7; final report → §9 + concision).
3. Add `"<name>": "<tier>"` to the `COMMANDS` map in `scripts/remirror.sh` (`workstream` | `program` | `portfolio`). Without this, remirror still mirrors the Cursor file from the glob but **omits** the command from `manifest.json`.
4. Append the stem to `PACKAGED_COMMANDS` in `install.sh` and `$PackagedCommands` in `install.ps1` (Cursor install uses an allowlist; Claude copies all `*.md`).
5. Run `./scripts/remirror.sh`.
6. Smoke-test: `./install.sh /tmp/skailr-smoke` and confirm Claude + Cursor command paths exist.

## Pull requests

- Describe *why*, not only what.
- Keep unrelated refactors out of the PR.
- Ensure CI passes (manifest path check, agent name check, agent-tools Write⇒Edit check, install smoke test).

## Code of conduct

Participation is governed by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
