---
name: write-handoff-and-yield
description: Write a mid-slice handoff doc and end the Task so the orchestrator can re-dispatch with a fresh context window. Use when a build worker hits a process-step or tool-round budget with work remaining.
---

# Skill: write-handoff-and-yield

## When to use

Build workers only (`backend-engineer`, `frontend-engineer`, `data-engineer`) during an implementation Task when:

1. You finished a Process step (e.g. migrations → DAL) and remaining work is non-trivial, **or**
2. You have used roughly **30 tool rounds** in this Task and work remains, **or**
3. You are about to open a large new area of the codebase while mid-implementation.

Do **not** yield when:

- The slice is actually complete — write the normal `*-report.md` instead and delete any handoff file for your slice.
- You are blocked on another agent or a contract — post a channel message and end turn (existing channel discipline); do not substitute a handoff for a blocker.
- You would write an empty or vague handoff (missing Done / Next steps).

## Paths

| Scope | Path |
|-------|------|
| Feature | `.claude/tmp/handoff/<slice>.md` |
| Program workstream | `.claude/program/workstreams/<ws>/handoff/<slice>.md` |

`<slice>` is one of: `backend`, `frontend`, `data`. Create parent directories as needed.

## Procedure

1. Copy structure from `.claude/program/schemas/handoff.template.md`.
2. Fill every section honestly. Prefer paths, AC IDs, and commands over narrative.
3. Set frontmatter: `slice`, `role`, `workstream` (or `null`), `yield` (increment if replacing a prior handoff for this slice), `updated` (ISO-8601).
4. Write/overwrite the path above.
5. Append one line to `.claude/tmp/progress.md` **Notes** (feature) or the workstream / ledger Notes (program), e.g. `handoff: .claude/tmp/handoff/backend.md (yield N)`.
6. Leave build / slice status **`in_progress`** — do not mark the slice complete.
7. Do **not** write or overwrite the final `*-report.md` on yield (unless a prior partial report already exists and you are only clarifying — prefer leaving reports for true completion).
8. End your turn with a single final line exactly:

```text
YIELD: <path>
```

Do not claim the slice is complete in the same message.

## On resume (next Task)

1. Read the handoff path first (orchestrator should pass it).
2. Skip everything under **Done**. Execute **Next steps**, then remaining **Not done**.
3. Trust **Do-not-reread** unless you must verify a change you are making.
4. When the slice is truly complete: write the normal report, **delete** the handoff file for your slice, and do not emit `YIELD:`.

## Orchestrator note

After `YIELD:`, keep the slice `in_progress` and immediately re-dispatch the same role in a **fresh Task** with only: handoff + spec (+ story/research as usual). Cap consecutive yields per slice at **5**, then surface to the human.
