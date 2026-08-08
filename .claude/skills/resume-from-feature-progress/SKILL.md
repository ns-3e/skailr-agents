---
name: resume-from-feature-progress
description: Determine the next incomplete feature phase from progress.md and resume without redoing finished work.
---

# Skill: resume-from-feature-progress

## When to use

`/continue-feature`, `/yolo` resume, `/build-feature` mid-run return, nested feature under `run-feature-queue`, or any mid-session return after Claude Code usage limits / session death.

## Procedure

If `.claude/skailr.db` exists, query it directly — it's the source of truth `progress.md` is only rendered from, so this skips a parse-the-markdown-back-out round-trip and returns less text for the same information (includes a computed `next` field, same as the script below):

```bash
node scripts/skailr/db.mjs feature get --id <feature-slug> --json
```

Otherwise (no DB yet — older artifact root):

```bash
# Standalone:
node scripts/skailr/feature-status.mjs --json
# Nested / explicit root:
node scripts/skailr/feature-status.mjs --progress <ARTIFACT_ROOT>/progress.md --root <ARTIFACT_ROOT> --json
```

Either way, this replaces reading `progress.md` as a file — never do both. Note the DB path covers phase status only — it does not (yet) include `board`/`handoffs`/`partialBuild`; when `next` is `build` and a ticket board is in play, also run `node scripts/skailr/ticket-status.mjs --root <ARTIFACT_ROOT> --json` (or `feature-status.mjs` if you need handoffs) alongside it rather than instead of it.

`artifactRoot` in the JSON is the active feature root. Map `next` to the feature pipeline phase:

| `next` | Resume at |
|--------|-----------|
| `research` | Phase 1 — researcher |
| `story` | Phase 2 — story-writer |
| `spec` | Phase 3 — architect (+ mint board) |
| `build` | Phase 4 — ticket board if `board` present (skill `run-ticket-board`); else engineers for missing `partialBuild` slices |
| `verify` | Phase 5 — e2e-verifier |
| `validate` | Phase 6 — validator |
| `docs` | Phase 7 — program-documenter |
| `null` (complete) | Report status; do not rebuild |

When `board` is set, prefer `parallel` / `frontier` and `partialRoles` over classic `partialBuild` alone. Also useful: `node scripts/skailr/ticket-status.mjs --root <ARTIFACT_ROOT> --json`.

Prepend every Task with `ARTIFACT_ROOT=<artifactRoot>` from the status JSON.

## Mid-ticket / mid-slice handoffs

If JSON includes `handoffs` (files under `$ARTIFACT_ROOT/handoff/<ticket-id|slice>.md`):

- Treat as a **context yield**, not a failure. Keep build / ticket `claimed` / slice `in_progress`.
- When re-dispatching, pass the handoff path as **primary** context plus ticket + `spec.md` (ticket mode), or spec/story/research (legacy). Instruct: continue from handoff; skip **Done**; do not redo finished work.
- Follow skill `write-handoff-and-yield`. Cap consecutive yields per ticket/slice at **5**, then surface to the human.
- Before resolving a ticket or marking a slice `complete`, confirm its handoff file is deleted.

## Rules

- Do **not** archive the artifact root when resuming an incomplete run.
- Do **not** reset channels under `$ARTIFACT_ROOT/channels/` (or `.claude/tmp/channels/` for standalone).
- Read `mode` from progress frontmatter / `$ARTIFACT_ROOT/mode.md`: if `yolo`, skip human gates and auto-decide `@human` / `contract-change`.
- Re-run script gates (ownership, channels, ticket validate) before advancing past build.
- Mark a phase `complete` in `$ARTIFACT_ROOT/progress.md` only after its artifact exists and checks pass — **before** starting the next Task.
