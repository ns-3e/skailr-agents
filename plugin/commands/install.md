---
description: Install the skailr-agents operating model into the current project (agents, commands, skills, script gates, Cursor mirror)
argument-hint: "[--claude-only|--cursor-only]"
allowed-tools: Bash, Read
---

Install the skailr-agents pack into this project. The pack is repo-local by design:
agents, commands, skills, schemas, and the script gates all land in the project so
they version with it. This plugin command only bootstraps; day-to-day work then uses
the project-local commands (`/yolo`, `/map-repo`, `/patch`, `/ship-feature`, …).

Steps:

1. Run the installer from the plugin bundle into the project root. Pass through
   `$ARGUMENTS` (may contain `--claude-only` or `--cursor-only`):

   - POSIX: `bash "${CLAUDE_PLUGIN_ROOT}/install.sh" "${CLAUDE_PROJECT_DIR}" $ARGUMENTS`
   - Windows: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${CLAUDE_PLUGIN_ROOT}/install.ps1" -TargetPath "${CLAUDE_PROJECT_DIR}"` (append `-ClaudeOnly` / `-CursorOnly` when `$ARGUMENTS` asked for them)

   The installer is idempotent and never touches `.claude/experts/` (minted expert
   rosters are user state). Do not re-implement any copy logic yourself.

2. Verify: `node "${CLAUDE_PROJECT_DIR}/scripts/skailr/doctor.mjs" --root "${CLAUDE_PROJECT_DIR}"`.
   Non-zero exit → show the FAIL rows and stop; do not declare success.

3. Tell the user, briefly: install done and doctor-verified; existing codebases
   should run `/map-repo` first to baseline; greenfield asks can go straight to
   `/yolo <request>` or `/yolo-program <request>`; plain chat is auto-routed per the
   installed `CLAUDE.md`. Mention that a restart of the session may be needed before
   the project-local slash commands appear.

Do not run any build command yourself in this turn.
