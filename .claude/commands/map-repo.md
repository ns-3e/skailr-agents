---
description: Brownfield baseline — repo orientation and hierarchical CLAUDE.md files, the durable context asset
argument-hint: [optional focus areas]
allowed-tools: Task, Read, Grep, Glob, Write, Edit, Bash
---

Map this repository so every future session starts oriented. The durable
output — the reason this command exists — is the **hierarchical CLAUDE.md
tree**: context that compounds, paying back on every later `/patch`, `/build`,
and plain-chat question.

Focus (optional): **$ARGUMENTS**

## 1. Orient

Dispatch `researcher` in **repo mode** to write `.claude/repo/orientation.md`
(structure per `.claude/program/schemas/orientation.template.md`). For a very
large repo (several independent top-level systems), dispatch one researcher
per system in parallel, each writing its own section file, and merge.

## 2. Write the CLAUDE.md tree

Load skill `maintain-claude-md` (baseline mode) and derive from orientation:

- Root `CLAUDE.md` project-conventions zone: what the project is, how to run
  and test it, real conventions, the commands that matter. (The Skailr intake
  zone is installer-owned; write outside its markers.)
- One `CLAUDE.md` per real directory boundary — only where a directory has
  conventions or context of its own worth loading. Fewer, denser files beat
  scaffolding every directory.

## 3. Draft the ownership sketch

Write `.claude/repo/ownership.json` (schema:
`.claude/program/schemas/ownership.schema.json`) mapping the real seams of the
codebase to path globs — this is what `/program` will use as its starting
ownership map. Skip if the repo is too small for seams to matter.

## 4. Report and confirm

Summarize in chat: what the system is, the boundaries found, the CLAUDE.md
files written, risk surfaces worth knowing, and (if obvious problems surfaced)
a short prioritized list. Then stop — mapping never auto-starts a build. If
the user wants fixes, they run `/patch`, `/build`, or `/program`.
