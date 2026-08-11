---
description: One cohesive feature — main session plans and implements; fresh-context verification when blast radius warrants
argument-hint: <feature request in plain language>
allowed-tools: Task, Read, Grep, Glob, Write, Edit, Bash
---

Build this feature: **$ARGUMENTS**

You — the main session — own this build end to end: you read the code, make
the design decisions, write the implementation, and integrate it. Subagents
exist only where a fresh context genuinely helps (parallel read-only recon;
independent verification; truly disjoint parallel slices). Never dispatch a
subagent to do work you could do better with the context you already hold.

## 0. Resume or start

If `.claude/tmp/progress.md` exists and is incomplete, read it and continue
from the first unchecked step — don't redo finished work. Otherwise start
fresh. If `$ARGUMENTS` is empty and there's nothing to resume, ask what to
build.

If the repo is non-trivial and has no CLAUDE.md written by `/map-repo`, offer
it in one sentence ("no baseline here — map the repo first, or build cold?");
build immediately if declined.

## 1. Understand

Read the code the feature touches. Read existing CLAUDE.md files. If — and
only if — the relevant surface is too large or unfamiliar to read directly,
dispatch 1–3 `researcher` agents in **recon mode**, in parallel, each with
specific questions; continue with their findings.

Then write `.claude/tmp/progress.md`:

```markdown
# Build: <one-line feature name>
Ask: <the user's ask, verbatim>

## Acceptance criteria
- AC-1: <testable outcome>

## Plan
- [ ] <step>

## Decisions
- <decision>: <why>
```

Keep ACs testable and honest — the verifier will trace them. This file is for
kill/resume and the verifier; it is not a deliverable. Update checkboxes as
you go; don't narrate into it.

## 2. Implement

Do the work yourself: code, wiring, tests. Match the repo's conventions. For
user-visible UI, load skill `apply-ux-quality` and self-check changed
surfaces.

**Parallel carve-out (rare):** if the feature has 2+ slices that are genuinely
disjoint (no shared files, clean interface between them) *and* each slice is
substantial, you may define the seam yourself in progress.md and dispatch
`engineer` agents in parallel, one per slice, each with goal + ACs + seam +
ownership globs. After they return, run `git diff --name-only` and confirm no
file was touched twice; integrate and review their work as your own. When in
doubt, build it yourself — dispatch overhead is real and measured.

Run the tests. Fix what's red before moving on.

## 3. Verify proportionally

Decide against this rubric and record the decision in progress.md:

- **Self-verify only** (run the tests, exercise the feature once end-to-end
  yourself) when the change is small, single-surface, and touches nothing
  sensitive.
- **Dispatch `verifier`** when any of: the feature spans multiple surfaces, it
  touches a sensitive surface (auth, payments, permissions, secrets, data
  deletion, anything security-adjacent), engineers were dispatched in step 2,
  or your own test evidence feels thin. Pass it the ACs from progress.md, the
  changed paths (`git diff --name-only` from the feature's base), and report
  path `.claude/tmp/verification-report.md`.

If the verifier returns NEEDS_FIXES: fix the blocking findings yourself, rerun
the affected verification, once. (A Stop hook independently blocks finishing
with open blocking findings.)

## 4. Close out

- If the feature changed structure, commands, or conventions that a CLAUDE.md
  file documents (or should), load skill `maintain-claude-md` and reconcile.
- Mark all progress.md steps done (it's the resume signal).
- Report to the user: what shipped and where, how it was verified (real
  command + result, or the verifier's verdict), decisions worth knowing, and
  anything deliberately not done.
