---
description: Health-check the skailr-agents installation in the current project
allowed-tools: Bash, Read
---

Run the skailr installation health check against this project and report the result.

1. If `${CLAUDE_PROJECT_DIR}/scripts/skailr/doctor.mjs` exists (installed pack), run:
   `node "${CLAUDE_PROJECT_DIR}/scripts/skailr/doctor.mjs" --root "${CLAUDE_PROJECT_DIR}"`
   Otherwise fall back to the plugin bundle's copy:
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/skailr/doctor.mjs" --root "${CLAUDE_PROJECT_DIR}"`

2. Show the table verbatim. If anything FAILs, explain the failing rows in one line
   each and suggest the fix (usually re-running `/skailr-agents:install`). If the
   pack is not installed at all, say so and point at `/skailr-agents:install`.
