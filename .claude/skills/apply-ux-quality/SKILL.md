---
name: apply-ux-quality
description: Apply Skailr's UX craft kernel — principles, anti-AI layout patterns, and checklist — when specifying, building, or reviewing user-visible UI.
---

# Skill: apply-ux-quality

## When to use

Any role that specifies, implements, or reviews user-visible UI: architect (mint `ui-spec`), frontend-engineer (build), validator (Pass 4), design-lead / strategist / designer / design-reviewer (program design workstreams), and patch runs that touch UI paths.

Load references just-in-time; do not paste them into Task returns.

| Reference | Path |
| --------- | ---- |
| Principles | `.claude/skills/apply-ux-quality/references/principles.md` |
| Anti-AI layouts | `.claude/skills/apply-ux-quality/references/anti-ai-layouts.md` |
| Checklist | `.claude/skills/apply-ux-quality/references/checklist.md` |

## Procedure by caller

### Architect

1. If the feature has **no** user-visible UI (API-only, jobs, migrations), skip — note `N/A: no user-visible UI` in `spec.md`.
2. Otherwise read `principles.md` and `anti-ai-layouts.md`.
3. If a consumed `kind: design` contract exists, cite it and align the ui-spec to that handoff; do not reinvent.
4. Write `$ARTIFACT_ROOT/ui-spec.md` from `.claude/program/schemas/ui-spec.template.md`.
5. Point frontend tickets' Spec pointers at the relevant ui-spec sections.
6. Ensure `spec.md` Frontend Work and Interaction notes stay consistent with `ui-spec.md`.

### Frontend engineer

1. Read `ui-spec.md` (or design handoff) before inventing layout. Prefer those over improvisation.
2. Read `principles.md`, `anti-ai-layouts.md`, and `checklist.md`.
3. Build every new view with designed loading / empty / populated / error / unauthorized states.
4. Self-check against `checklist.md` before claiming the ticket/slice done.
5. Report results under `## UX Quality` in the ticket or frontend report (required for new views; no omit).

### Validator (Pass 4)

1. Run only when the feature diff includes frontend / user-visible UI.
2. Read `checklist.md` and `anti-ai-layouts.md`; compare diff to `ui-spec.md` (or Frontend Work if ui-spec missing — missing ui-spec when FE shipped is itself a finding).
3. **Blocking:** ui-spec ignored; new views missing designed empty/error; inaccessible controls; checklist hard fails.
4. **Advisory:** taste disagreements when no house design system exists (state the assumption). Document in Pass 4 of `validation-report.md`.

### Design team (lead / strategist / designer / reviewer)

1. Lead: brief names craft goals and anti-patterns to avoid (template: `design-brief.template.md`); three ship-blockers — inaccessible, off-system, craft-failed.
2. Strategist: outlines include job-per-surface, hierarchy test, motion budget, anti-AI constraints.
3. Designer: self-check `checklist.md` before handoff.
4. Reviewer: craft / anti-AI layout audit beside a11y + DS; fail craft-failed assets.

### Patch (UI paths)

1. Load `checklist.md` (and anti-AI if touching layout/branded surfaces).
2. Apply lightly to changed UI; mint a full `ui-spec.md` only when adding a **new** surface.
