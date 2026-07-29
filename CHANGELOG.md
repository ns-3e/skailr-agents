# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Added

- **Design, marketing, and finance domain teams** (`status: built`) — agents under `.claude/agents/{design,marketing,finance}/`, contract kinds `design | campaign | financial`, skill `reconcile-model`, multi-domain fixture [examples/launch-kit/](examples/launch-kit/)
- Registry: restored missing `### content` header; flipped design/marketing/finance to built

## [1.5.0] — 2026-07-28

### Added

- **Plain-chat intake** — `.claude/intake.md` + skill `route-intake`; remirror emits always-applied `.cursor/rules/intake.mdc` and root `CLAUDE.md`. Questions → researcher ask mode; small changes → `/patch`; one feature → `/yolo`; whole app → `/yolo-program`. See [docs/INTAKE.md](docs/INTAKE.md)
- `/patch` — YOLO-style ad-hoc fix with lineage sync (skill `sync-lineage`), docs reconcile, light verify; size-gates up to `/yolo` / `/yolo-program`
- Researcher **ask mode** — writes `.claude/tmp/ask.md` for plain-chat Q&A
- Schema `patch-report.template.md`

### Changed

- **Uniform agent layout** — all agents live under `.claude/agents/<subdir>/` (`engineering/`, `program/`, `portfolio/`, `content/`, `legal/`, `pm/`); no flat files at agents root. Installers, remirror, CI, and model-routing discovery follow subdirs only
- Installers copy `CLAUDE.md`, `.claude/intake.md`, and the `intake` Cursor rule; `patch` added to packaged commands
- README / YOLO chooser document intake and `/patch`
- README Path D documents portfolio commands with a business-role mapping (CEO/PMO strategy → planning → exec status)
- README Paths A–C2 + **Command reference** map every slash command to a business role; command `description:` frontmatter (and remirror) include the same cues; YOLO/INTAKE cross-links updated

## [1.4.0] — 2026-07-28

### Added

- Mid-slice **context handoff**: schema `handoff.template.md`, skill `write-handoff-and-yield`, and orchestrator re-dispatch so build workers (`backend` / `frontend` / `data`) can yield a fresh Task before context quality collapses
- `feature-status.mjs` reports `handoffs` when `.claude/tmp/handoff/<slice>.md` exists; resume skills and build/continue/yolo commands continue-from-handoff

### Changed

- Feature progress template documents the `## Handoffs` convention
- Engineer agents and feature/program orchestrator commands honor `YIELD:` with a 5-yield cap per slice

## [1.3.0] — 2026-07-28

### Added

- `/yolo` — one-shot workstream pipeline (skip story/spec human gates); see [docs/YOLO.md](docs/YOLO.md)
- `/yolo-program` — one-shot program pipeline (skip discover/plan freezes; auto-decide mid-build escalations); see [docs/YOLO.md](docs/YOLO.md)
- Feature phase cursor: `.claude/tmp/progress.md` + `scripts/skailr/feature-status.mjs` + skill `resume-from-feature-progress` (survive Claude Code usage-limit / session death)
- README quick start for Claude Code CLI (greenfield → feature or whole-app paths)
- **Model routing** — `.claude/model-routing.json` profiles (`economy` / `balanced` / `quality`), `scripts/skailr/apply-model-routing.mjs`, skill `route-models`, Cursor mirror `.cursor/model-routing.md`; see [docs/MODEL_ROUTING.md](docs/MODEL_ROUTING.md)

### Removed

- Control plane monorepo: `@skailr/core`, `@skailr/server`, `@skailr/cli`, `@skailr/web` (CEO inbox UI)
- `skailr` CLI / `skailr serve`, JSON store under `.skailr/`, and demo-seed import path
- Browser UI bootstrap / token injection and `Assets/ui.png`
- Standalone `RELEASE_NOTES_v1.1.0.md` and `RELEASE_NOTES_v1.2.0.md` (history lives in this changelog)

### Changed

- Repo is pack-only again: Claude Code / Cursor agent operating model + `scripts/skailr/*.mjs`
- Intair TypeScript stub lives at `docs/intair-client.stub.ts`
- Installers no longer append `.skailr/` or apps/packages dist ignore lines
- `/yolo` / `/yolo-program` / `/ship-feature` resume incomplete runs instead of auto-archiving; `/continue-feature` and `/continue-program` are mode-aware (YOLO vs gated)

## [1.2.0] — 2026-07-28

### Added

- Control plane monorepo: `@skailr/core`, `@skailr/server` (Hono + JSON event store), `@skailr/cli`, `@skailr/web` (CEO inbox UI)
- Mechanical enforcement scripts under `scripts/skailr/` + Claude hooks fragment + git pre-commit sample
- Skills and meta-skills under `.claude/skills/`
- `/continue-feature`, `/continue-program`, portfolio commands (`/discover-portfolio`, `/plan-portfolio`, `/status-portfolio`)
- Legal/compliance and PM/delivery domain teams (registry `built`)
- First-run **demo seed** of `examples/parallel-api` when no real `ledger.md` / empty store; `skailr sync import --demo`
- `RELEASE_NOTES_v1.2.0.md` and updated publish checklist

### Changed

- Build/plan commands require script gates; installers ship scripts, skills, and schemas
- Manifest / remirror cover new agents, commands, skills, and schemas (v1.2.0)
- Browser UI paths (`/`, `/assets/*`) are public; token injected into served HTML

## [1.1.0] — 2026-07-25

### Added

- Agent **channels** message board (`.claude/program/channels/`) with `PROTOCOL.md`, seeded `program.md` example, and `feature.md` template
- Orchestrator router loops in `/build-feature` and `/build-program`
- Workstream-tier `validator` agent
- Installers (`install.sh`, `install.ps1`), `manifest.json`, Cursor mirror under `.cursor/`
- Channel-aware instructions across agents; blockers / contract-change-requests subsumed by typed channel messages

### Changed

- Layout: authoritative Claude Code tree under `.claude/`; Cursor rules/commands generated from it
- Gitignore carve-outs so channel protocol templates stay tracked while program runtime state stays ignored

## [1.0.0] — 2026-07-25

### Added

- Initial two-tier multi-agent build system (program + workstream) for Claude Code and Cursor
