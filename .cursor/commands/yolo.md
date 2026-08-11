---
name: yolo
description: Alias for /build (kept for muscle memory) — one cohesive feature, main-session-led
---

<!--
Cursor execution note: Claude Code dispatches subagents via the Task tool.
Cursor has no native cross-agent Task dispatch. In Cursor, run this orchestration
in one agent session by invoking the corresponding `.cursor/rules/<agent>.mdc`
roles in sequence (or via Background Agents for parallel engineer/workstream steps).
The phase order, gates, and contracts below are unchanged — only the dispatch mechanism differs.
-->

`/yolo` is the pre-3.0 name for `/build`. Read `.claude/commands/build.md` and
execute it exactly, with the same arguments: **$ARGUMENTS**
