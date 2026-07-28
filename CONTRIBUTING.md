# Contributing

Thanks for helping improve skailr-agents.

## Source of truth

- **Edit `.claude/` first** — agents under `.claude/agents/`, commands under `.claude/commands/`, registry at `.claude/teams/registry.md`, channel templates under `.claude/program/channels/`.
- **Re-mirror Cursor** after Claude changes:

```bash
./scripts/remirror.sh
```

Do **not** hand-edit generated `.cursor/rules/*.mdc` or `.cursor/commands/*.md` except via the remirror script. Those files are derived from `.claude/`.

## Maintainer conventions (when changing this repo)

- Prefer the smallest diff that solves the problem; avoid speculative abstractions.
- State assumptions; don’t silently invent missing agents or teams.
- After changing agent `name:` frontmatter, keep it equal to the filename stem.

## Adding an agent

1. Create `.claude/agents/<name>.md` (or `.claude/agents/<team>/<name>.md` for a domain team) with frontmatter: `name`, `description`, `tools`, `model`.
2. Set `name:` to the filename without `.md`.
3. If the agent is read-only over app code but may post to channels, grant `Write` only for channel appends and document that in the body.
4. Run `./scripts/remirror.sh`.
5. Regenerate `manifest.json` (remirror script updates it) or add the artifact by hand.
6. Smoke-test: `./install.sh /tmp/skailr-smoke && rm -rf /tmp/skailr-smoke`.

## Adding a skill

1. Create `.claude/skills/<name>/SKILL.md` with frontmatter `name` + `description`.
2. Prefer calling `scripts/skailr/*.mjs` for anything that must be mechanically true.
3. Run `./scripts/remirror.sh` (skills are listed in `manifest.json`).

## Adding a command

1. Create `.claude/commands/<name>.md` with `description` (and `argument-hint` / `allowed-tools` as needed).
2. Run `./scripts/remirror.sh`.
3. Smoke-test install as above.

## Pull requests

- Describe *why*, not only what.
- Keep unrelated refactors out of the PR.
- Ensure CI passes (manifest path check, agent name check, install smoke test).

## Code of conduct

Participation is governed by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
