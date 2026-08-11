---
name: apply-ux-quality
description: Apply Skailr's UX craft kernel — principles, anti-AI layout patterns, and checklist — when specifying, building, or reviewing user-visible UI.
---

# Skill: apply-ux-quality

## When to use

Whoever is specifying, implementing, or reviewing user-visible UI — the main
session on `/build` and `/patch`, an `engineer` building a UI slice, or the
`verifier` auditing one.

Load references just-in-time; do not paste them into reports.

| Reference | Path |
| --------- | ---- |
| Principles | `.claude/skills/apply-ux-quality/references/principles.md` |
| Anti-AI layouts | `.claude/skills/apply-ux-quality/references/anti-ai-layouts.md` |
| Checklist | `.claude/skills/apply-ux-quality/references/checklist.md` |

## Procedure by caller

### Building UI (main session on /build, or an engineer's slice)

1. Read `principles.md`, `anti-ai-layouts.md`, and `checklist.md` before
   inventing layout. If the project has its own design system or design
   handoff, that wins — align to it, don't reinvent.
2. Build every new view with designed loading / empty / populated / error /
   unauthorized states.
3. Self-check against `checklist.md` before calling the surface done; note the
   result in the build report.

### Verifying UI (verifier, when the diff includes user-visible UI)

1. Read `checklist.md` and `anti-ai-layouts.md`; compare against the diff.
2. **Blocking:** new views missing designed empty/error states; inaccessible
   controls; checklist hard fails.
3. **Advisory:** taste disagreements when no house design system exists (state
   the assumption). Record in the verification report.

### Patch (UI paths)

1. Load `checklist.md` (and anti-AI if touching layout/branded surfaces).
2. Apply lightly to the changed surfaces only — a patch never grows a design
   phase.
