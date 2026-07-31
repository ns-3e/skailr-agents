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

- The ticket/slice is actually complete — write the normal report instead and delete any handoff file.
- You are blocked on another agent or a contract — post a channel message and end turn (existing channel discipline); do not substitute a handoff for a blocker.
- You would write an empty or vague handoff (missing Done / Next steps).

## Paths

| Scope | Path |
|-------|------|
| Feature ticket | `$ARTIFACT_ROOT/handoff/<ticket-id>.md` (e.g. `T-001.md`) |
| Feature legacy slice | `$ARTIFACT_ROOT/handoff/<slice>.md` (`backend` \| `frontend` \| `data`) |

`ARTIFACT_ROOT` defaults to `.claude/tmp` (standalone) or `.claude/program/workstreams/<ws>/features/<slug>` when nested. Do not write handoffs to a flat `workstreams/<ws>/handoff/` outside the active feature root.

Prefer **ticket-id** when the Task was dispatched with a ticket path. Create parent directories as needed.

## Procedure

1. Copy structure from `.claude/program/schemas/handoff.template.md`.
2. Fill every section honestly. Prefer paths, AC IDs, and commands over narrative. In ticket mode, set frontmatter `slice` to the ticket id.
3. Set frontmatter: `slice` (ticket id or backend/frontend/data), `role`, `workstream` (or `null`), `yield` (increment if replacing a prior handoff), `updated` (ISO-8601).
4. Write/overwrite the path above.
5. Append one line to `$ARTIFACT_ROOT/progress.md` **Notes**, e.g. `handoff: <ARTIFACT_ROOT>/handoff/T-001.md (yield N)`.
6. Leave build / ticket status **`in_progress` / `claimed`** — do not resolve the ticket or mark the slice complete.
7. Do **not** write or overwrite the final report on yield (unless a prior partial report already exists and you are only clarifying — prefer leaving reports for true completion).
8. End your turn with a single final line exactly:

```text
YIELD: <path>
```

Do not claim the ticket/slice is complete in the same message.

## On resume (next Task)

1. Read the handoff path first (orchestrator should pass it).
2. Skip everything under **Done**. Execute **Next steps**, then remaining **Not done**.
3. Trust **Do-not-reread** unless you must verify a change you are making.
4. When truly complete: write the normal report (ticket: `$ARTIFACT_ROOT/tickets/<id>-report.md`; legacy: `$ARTIFACT_ROOT/*-report.md`), **delete** the handoff file, and end with `DONE: <report-path>` (do not emit `YIELD:`).

## Orchestrator note

After `YIELD:`, keep the ticket `claimed` / slice `in_progress` and immediately re-dispatch the same role in a **fresh Task** with: `ARTIFACT_ROOT` + handoff path + ticket path + spec path (ticket mode), or handoff + spec (legacy). Cap consecutive yields per ticket/slice at **5**, then surface to the human.
