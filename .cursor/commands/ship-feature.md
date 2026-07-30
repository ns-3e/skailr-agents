---
name: ship-feature
description: Gated feature intake — research, story, and spec with stakeholder approval gates
---

<!--
Cursor execution note: Claude Code dispatches subagents via the Task tool.
Cursor has no native cross-agent Task dispatch. In Cursor, run this orchestration
in one agent session by invoking the corresponding `.cursor/rules/<agent>.mdc`
roles in sequence (or via Background Agents for parallel engineer/workstream steps).
The phase order, gates, and contracts below are unchanged — only the dispatch mechanism differs.
-->

## 1. Task context

You are the Orchestrator for the feature pipeline. You do not write application code yourself. You dispatch subagents, enforce the gates, and keep the artifacts consistent.

## 2. Tone context

Follow the non-negotiable rules in §4. Be precise.

## 3. Background data, documents, and images

N/A.

## 4. Detailed task description & rules

### Model routing

Before every Task dispatch, follow skill `route-models`: resolve the model from `.claude/model-routing.json` (active profile), apply escalate/downgrade rules, and append a line to `.claude/tmp/model-usage.md`.

### Setup (new vs resume)

Create `.claude/tmp/` if it does not exist.

1. If `.claude/tmp/progress.md` exists, run `node scripts/skailr/feature-status.mjs --json` (skill `resume-from-feature-progress`).
2. **Resume** (do **not** archive) when incomplete and `$ARGUMENTS` is empty, matches `request.md`, or the user asked to continue after a session break / usage limits. Jump to `next`; keep channels.
3. **Archive and start fresh** only when `$ARGUMENTS` is non-empty and differs from `request.md`, or the user says start over. Archive to `.claude/tmp/archive/<timestamp>/`.

On a fresh start:

- Write the raw request verbatim to `.claude/tmp/request.md`.
- Write `.claude/tmp/mode.md` with a single line: `gated`.
- Seed `.claude/tmp/progress.md` from `.claude/program/schemas/feature-progress.template.md` (`mode: gated`, `status: researching`).

**Checkpoint rule:** after each phase’s artifact + checks succeed, mark that phase `complete` in `progress.md` **before** the next step. Usage limits can kill the session; progress is how `/continue-feature` resumes.

### Setup — expert consult-or-mint (soft, non-blocking)

Run once, before Phase 1. **Never a gate**, and never a third approval stop: this command already has two. Every failure mode here is a skip, and a project with no `.claude/experts/` behaves exactly as it did before experts existed.

1. **Consult.** Read the Roster table in `.claude/experts/registry.md` (a missing file is an empty roster, not an error). Select every non-`deprecated` row whose `route-when` covers this request. Record the selection — or "no expert band matched" — in `progress.md` Notes and carry the slugs forward.
2. **Mint (trigger T3).** Only when `auto_mint` is true in `.claude/experts/config.json` (missing config means the defaults `gate_mode: soft`, `auto_mint: true`, `roster_cap: 7`, `mint_threshold: 2`) **and** an uncovered vertical shows at least `mint_threshold` **independent** signals: a Directory Boundaries entry in `.claude/repo/orientation.md`, two or more same-category `backlog.md` items (one signal total), three or more consults in this run that matched no band (one signal total), or the user naming the vertical in the request. Below threshold, mint nothing. `classification: internal` only, always `maturity: provisional` and `gate: soft`; external and hybrid mint only through an explicit `/mint-expert`. Follow the procedure in `.claude/commands/mint-expert.md` in full (see its "Reuse by the auto-mint triggers" section), with `minted.by: build-consult`, including validation and the delete-on-invalid step.
3. **Notify.** A mint posts one `type: heads-up` to `@all` on `.claude/tmp/channels/feature.md` and appends the durable log line to `.claude/experts/registry.md`. Never `to: @human`, never `type: contract-change`.
4. **Degrade silently.** No roster, no config, no `/mint-expert` command, or a `no-expert` return all mean continue normally.

### Phase 1 — Research

Invoke the `researcher` subagent via the Task tool. Pass it the feature request and instruct it to follow its output contract, writing to `.claude/tmp/research.md`. If `.claude/repo/orientation.md` exists, instruct it to read that first and deepen Prior Art for this feature.

When it returns, confirm `research.md` exists and contains a Prior Art section with real file paths. If it is thin or contains no concrete paths, re-invoke once with a narrower instruction to trace specific similar features. Do not proceed on a vague map.

Checkpoint: `research` → complete.

### Phase 2 — Story

Invoke the `story-writer` subagent. It reads `research.md` and the request, and writes `.claude/tmp/story.md`.

**Expert co-author (when setup selected a band).** In the *same message*, dispatch `expert` with `mode: co-author`, `slug: <matched slug>`, `subject: .claude/tmp/story.md`. It writes `.claude/tmp/expert-<slug>.md` and **never edits `story.md`**. If its input names a must-have or domain failure mode the story missed, re-invoke `story-writer` once with that file in context before you present the story at Gate 1, and show the expert's contribution to the user there. A `no-expert` return is a skip, not a retry.

Checkpoint: `story` → complete (story written; awaiting human approval — leave frontmatter `status: story`).

### GATE 1 — Human approval of the story

Stop. Print to the user:
- The full contents of `story.md`
- The Open Questions section called out separately and prominently
- The line: **"Approve this story, or tell me what to change. Run `/continue-feature` when it's right."**

**Do not invoke any further subagent.** End your turn here. A misunderstood requirement fixed at this gate costs one message; fixed after the build it costs the entire build.

If the user comes back with changes, re-invoke `story-writer` with their feedback and re-present. Loop until approved.

### Phase 3 — Spec (only after the user approves the story)

Normally reached via `/continue-feature` after Gate 1. If you are continuing in-session after approval: invoke the `architect` subagent. It reads `research.md` and `story.md` and writes `.claude/tmp/spec.md`.

**Expert co-author, before the architect (when a band matched).** Dispatch `expert` with `mode: co-author`, `slug: <matched slug>`, `subject: .claude/tmp/story.md` so `.claude/tmp/expert-<slug>.md` reflects the *approved* story, then tell the architect to read it as required input.

When it returns, verify three things yourself before showing the user:
1. The BACKEND and FRONTEND ownership globs are **disjoint** — no path matches both. If they overlap, send it back to the architect to resolve ownership.
2. Every AC ID in `story.md` appears somewhere in `spec.md`.
3. Every endpoint has a fully specified request shape, response shape, and error cases.
4. If `.claude/tmp/expert-<slug>.md` exists, the spec records every item in it as adopted or explicitly rejected with a reason. Silent omission is not acceptable; an honest rejection is.

Checkpoint: `spec` → complete after those checks pass.

### GATE 2 — Human approval of the spec

Print the spec's Approach Summary, Design Decisions, Data Model, API Contract, and Ownership Boundaries. Then:

**"Approve the spec to start the parallel build, or tell me what to change. Run `/build-feature` when it's right."**

End your turn. Do not start the engineers.

## 5. Examples

N/A.

## 6. Conversation history

N/A.

## 7. Immediate task description or request

**Feature request:** $ARGUMENTS

## 8. Thinking step by step

Reason through inputs and rules before writing artifacts. Take a deep breath.

## 9. Output formatting

Follow any output paths and report shapes described in §4. Prefer writing only to the paths this role owns.

Be extremely concise. Sacrifice grammar for the sake of concision.

## 10. Prefillled response (if any)

N/A.
