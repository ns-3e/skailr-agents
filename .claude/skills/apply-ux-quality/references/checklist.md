# UX quality checklist

Use for FE self-check, validator Pass 4, and design-reviewer craft audit. Mark each **pass / fail / n/a**.

## Surface

| # | Check | Notes |
| - | ----- | ----- |
| S1 | Primary job stated and visually dominant | |
| S2 | Hierarchy matches importance (weight ≠ equal chrome) | |
| S3 | Affordances honest (interactive vs static) | |
| S4 | All five states designed: loading / empty / populated / error / unauthorized | |
| S5 | Empty / first-run is useful (not blank) | |
| S6 | Errors local, actionable, recoverable | |
| S7 | On-system tokens/primitives (or documented exception) | |
| S8 | a11y: labels, keyboard, focus, contrast bar, reduced motion | |
| S9 | Anti-AI layout sweep clean (see `anti-ai-layouts.md`) | |
| S10 | Motion budget intentional (or none); reduced-motion path | |
| S11 | Brand presence adequate for surface type (landing vs app) | |
| S12 | ui-spec / design handoff followed (or justified deviation) | |

## Hard fails (blocking)

- S4/S5 fail on a **new** view
- S8 fail (inaccessible)
- S7 silent off-system invent
- S9 clear banned cluster on a **new branded** surface
- S12 ui-spec exists and was ignored without documented exception

## Soft fails (advisory unless brief says otherwise)

- Taste disagreements with no house DS (document assumption)
- Motion polish shortfalls that do not harm comprehension
- Brand presence thin on internal/tooling chrome where brand is not a goal
