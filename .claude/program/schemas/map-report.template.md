---
schema: skailr.map-report/v1
status: draft | awaiting_confirm | confirmed
updated: <ISO-8601>
---

# Map Report: <repo name or one-line summary>

## Request
Verbatim or restated map focus (`full-repo` if whole-tree).

## Orientation summary
Stack, boundaries, and 2–3 representative slices in a short paragraph each.

## Ownership draft
Pointer to `.claude/repo/ownership.json`; validation result (`--map-only`).

## Assessment summary
What lenses ran (researcher security/debt/tests; design-reviewer; content-editor) and what was skipped.

## Backlog highlight
Top 5 items by severity (ids + titles). Full list: `.claude/repo/backlog.md`.

## Assumptions
- …

## Confirm
Pending human confirmation / Confirmed / Needs revision (notes).

## Recommended next action
One sentence (e.g. pick B-001 via `/patch`, or charter cleanup via `/discover`).
