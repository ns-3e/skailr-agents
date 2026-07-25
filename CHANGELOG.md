# Changelog

All notable changes to this project are documented in this file.

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
