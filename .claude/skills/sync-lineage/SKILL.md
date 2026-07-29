---
name: sync-lineage
description: After an ad-hoc /patch code change, update ledger, ownership, contracts, feature artifacts, and channels so skailr truth matches the diff. Use at the end of /patch before docs.
---

# Skill: sync-lineage

## When to use

After engineers finish a `/patch` implementation (and any YOLO contract auto-decisions), before invoking `program-documenter`.

## Procedure

1. **Diff inventory.** Run `git diff --name-only` (and staged if needed). Note whether paths imply ownership or contract seams.

2. **Program active** (`.claude/program/ledger.md` exists and is not abandoned):
   - Append a **Notes** (or Patches) bullet: date, one-line summary of the patch, pointer to `.claude/tmp/patch-request.md` / `patch-report.md`.
   - If owned paths moved or new owned files appeared outside existing globs, update `.claude/program/ownership.json` surgically (or ask `program-architect` via Task for the map edit), then:

```bash
node scripts/skailr/check-ownership.mjs --map .claude/program/ownership.json
```

   - If frozen contracts changed (or should have): ensure version bump + `status: frozen` via architect decision already logged; then:

```bash
node scripts/skailr/check-contracts.mjs
```

   - Post a short `heads-up` on `.claude/program/channels/program.md` summarizing the patch.

3. **Feature artifacts** (`.claude/tmp/spec.md` and/or `story.md` exist):
   - If behavior or ACs changed, surgically edit those files — do **not** restart research → story → spec.
   - If `.claude/tmp/ownership.json` or spec ownership globs are stale vs the diff, update and run:

```bash
node scripts/skailr/check-ownership.mjs --from-spec .claude/tmp/spec.md
# or --map .claude/tmp/ownership.json
```

   - Post a `heads-up` on `.claude/tmp/channels/feature.md` when that board exists.

4. **No program / no feature artifacts:** still write `.claude/tmp/patch-report.md` from the template; skip ownership/contract scripts if maps do not exist.

5. **Channels validate** when boards exist:

```bash
node scripts/skailr/validate-channels.mjs --dir .claude/program/channels 2>/dev/null || true
node scripts/skailr/validate-channels.mjs --tmp 2>/dev/null || true
```

6. Record every lineage file touched in the patch report **Lineage synced** table.
