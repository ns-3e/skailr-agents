---
name: resume-from-feature-progress
description: Determine the next incomplete feature phase from progress.md and resume without redoing finished work.
---

# Skill: resume-from-feature-progress

## When to use

`/continue-feature`, `/yolo` resume, `/build-feature` mid-run return, or any mid-session return after Claude Code usage limits / session death.

## Procedure

```bash
node scripts/skailr/feature-status.mjs --json
```

Map `next` to the feature pipeline phase:

| `next` | Resume at |
|--------|-----------|
| `research` | Phase 1 — researcher |
| `story` | Phase 2 — story-writer |
| `spec` | Phase 3 — architect |
| `build` | Phase 4 — engineers (only missing slices if `partialBuild` is set) |
| `verify` | Phase 5 — e2e-verifier |
| `validate` | Phase 6 — validator |
| `docs` | Phase 7 — program-documenter |
| `null` (complete) | Report status; do not rebuild |

## Mid-slice handoffs

If JSON includes `handoffs` (files under `.claude/tmp/handoff/<slice>.md`):

- Treat as a **context yield**, not a failure. Keep build / that slice `in_progress`.
- When re-dispatching that engineer, pass the handoff path as **primary** context plus `spec.md` / `story.md` / `research.md`. Instruct: continue from handoff; skip **Done**; do not redo finished work.
- Follow skill `write-handoff-and-yield` for yield/resume discipline. Cap consecutive yields per slice at **5**, then surface to the human.
- Before marking a slice `complete`, confirm its handoff file is deleted.

## Rules

- Do **not** archive `.claude/tmp/` when resuming an incomplete run.
- Do **not** reset channels under `.claude/tmp/channels/`.
- Read `mode` from progress frontmatter / `.claude/tmp/mode.md`: if `yolo`, skip human gates and auto-decide `@human` / `contract-change`.
- Re-run script gates (ownership, channels) before advancing past build.
- Mark a phase `complete` in `.claude/tmp/progress.md` only after its artifact exists and checks pass — **before** starting the next Task.
