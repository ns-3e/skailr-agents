---
name: archive-program-state
description: Move finished (or force-cleared) live `.claude/program/` runtime into archive/ so the next initiative starts clean. Never freestyle mv/rm.
---

# Skill: archive-program-state

## When to use

| Who | When | Flags |
| --- | ---- | ----- |
| Program orchestrators (`/build-program`, `/yolo-program`, `/continue-program`) | After ledger `status: complete`, **before** `cleanup-scoped-artifacts` and the final report | default (no `--force`) |
| Setup of `/discover`, `/yolo-program` | Safety net: live leftovers + completed (or missing) ledger → archive with no user confirm | default |
| Setup start-over | Incomplete ledger + new different request / explicit start over | `--force` |

**Do not** archive on incomplete resume (`/continue-program` mid-flight, or `/yolo-program` resume with matching/empty args). Incomplete runs must stay live.

## Commands

Always use the script. Never freestyle `mv` / `rm -rf` of program state.

```bash
node scripts/skailr/archive-program.mjs --dry-run
node scripts/skailr/archive-program.mjs
node scripts/skailr/archive-program.mjs --force
```

## What it does

1. Collects allowlisted live runtime under `.claude/program/` (`request.md`, `brief.md`, `plan.md`, `mode.md`, `ledger.md`, `ownership.json`, `contracts/`, `workstreams/`, field-guide / model-usage / status-digest / program-validation-report, and channel boards `program.md` + `ws-*.md`).
2. Moves them to `.claude/program/archive/<YYYYMMDDTHHMMSSZ>-<slug>/`.
3. Re-seeds an empty `channels/program.md`. Leaves `schemas/`, `channels/PROTOCOL.md`, `channels/feature.md`, `.gitkeep`, and existing `archive/` in place.
4. Exits 0 with `noop` when nothing live to archive.
5. Refuses incomplete ledgers unless `--force`.
6. **No ledger + live files** (e.g. a run killed before contract freeze — the ledger is only seeded at freeze): archives without `--force` as `ledger=no-ledger (archiving as leftovers)`. Nothing is deleted; the leftovers land in `archive/` like any other run.

## Completion order

When a program finishes:

1. Mark ledger `status: complete`
2. Skill `archive-program-state` (this skill)
3. Skill `cleanup-scoped-artifacts` (`purge` then `retire`)
4. Final user report (one line naming the archive path if archived)

## Deny forever

- Archiving during incomplete resume
- Freestyle deletes of `.claude/program/`
- Moving `schemas/`, tracked channel templates, or sibling archives
