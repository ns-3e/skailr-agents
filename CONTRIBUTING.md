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

## Adding an agent

1. Create `.claude/agents/<team-or-tier>/<name>.md` (e.g. `.claude/agents/engineering/architect.md`, `.claude/agents/content/content-lead.md`, `.claude/agents/design/design-lead.md`) with frontmatter: `name`, `description`, `tools`, `model`. No flat files under `.claude/agents/` root.
2. Set `name:` to the filename without `.md`.
3. Add `<name>` to **every** profile’s `roles` map in [`.claude/model-routing.json`](.claude/model-routing.json), then run `npm run models:check` (or `node scripts/skailr/apply-model-routing.mjs --check`).
4. If the agent is read-only over app code but may post to channels, grant `Write` only for channel appends and document that in the body.
5. Run `./scripts/remirror.sh`.
6. Regenerate `manifest.json` (remirror script updates it) or add the artifact by hand.
7. Smoke-test: `./install.sh /tmp/skailr-smoke && rm -rf /tmp/skailr-smoke`.

See [docs/MODEL_ROUTING.md](docs/MODEL_ROUTING.md) for profiles (`economy` / `balanced` / `quality`).

## Adding a skill

1. Create `.claude/skills/<name>/SKILL.md` with frontmatter `name` + `description`.
2. Prefer calling `scripts/skailr/*.mjs` for anything that must be mechanically true.
3. Run `./scripts/remirror.sh` (skills are listed in `manifest.json`).

## Adding a command

1. Create `.claude/commands/<name>.md` with `description` (and `argument-hint` / `allowed-tools` as needed).
2. Add `"<name>": "<tier>"` to the `COMMANDS` map in `scripts/remirror.sh` (`workstream` | `program` | `portfolio`). Without this, remirror still mirrors the Cursor file from the glob but **omits** the command from `manifest.json`.
3. Append the stem to `PACKAGED_COMMANDS` in `install.sh` and `$PackagedCommands` in `install.ps1` (Cursor install uses an allowlist; Claude copies all `*.md`).
4. Run `./scripts/remirror.sh`.
5. Smoke-test: `./install.sh /tmp/skailr-smoke` and confirm Claude + Cursor command paths exist.

## Pull requests

- Describe *why*, not only what.
- Keep unrelated refactors out of the PR.
- Ensure CI passes (manifest path check, agent name check, install smoke test).

## Code of conduct

Participation is governed by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
