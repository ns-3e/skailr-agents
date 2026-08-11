---
name: program
description: Program-scale build — scope exceeding one context window; disjoint workstreams built in parallel against seam contracts
---

<!--
Cursor execution note: Claude Code dispatches subagents via the Task tool.
Cursor has no native cross-agent Task dispatch. In Cursor, run this orchestration
in one agent session by invoking the corresponding `.cursor/rules/<agent>.mdc`
roles in sequence (or via Background Agents for parallel engineer/workstream steps).
The phase order, gates, and contracts below are unchanged — only the dispatch mechanism differs.
-->

Deliver this program: **$ARGUMENTS**

This is the only multi-writer path, and it exists for one reason: the scope
won't fit one context window. The entry bar is real — a big-sounding ask that
one session could build coherently belongs in `/build`, and building it there
is measured to be several times cheaper. Parallelism here pays only when the
slices are genuinely disjoint.

## 0. Resume or start

If `.claude/program/progress.md` exists and is incomplete, read it plus
`.claude/program/plan.md` and continue from the first incomplete workstream or
phase — don't redo finished work. Otherwise start fresh; if `$ARGUMENTS` is
empty with nothing to resume, ask.

**Scope gate:** if after reading the ask (and the repo) you judge one session
could hold the whole build, say so in one sentence and run it as `/build`
instead. Don't manufacture a program.

## 1. Plan the seams

Dispatch `program-architect` with the ask, repo context (CLAUDE.md files,
`.claude/repo/orientation.md` if `/map-repo` ran), and output paths
`.claude/program/plan.md` + `.claude/program/ownership.json`.

Review the plan yourself: workstreams disjoint, seams minimal, build order
justified. If it recommends `/build` instead, take that exit. Then validate
the ownership map mechanically:

```bash
node scripts/skailr/check-ownership.mjs --map .claude/program/ownership.json --map-only
```

Write `.claude/program/progress.md` listing each workstream with status
`pending`, plus `verify` and `close-out` rows. Update it as states change —
it's the resume signal.

## 2. Build the workstreams

Dispatch `engineer` agents per the plan's build order — parallel within a
wave (one Task message, multiple calls), sequential across waves. Each
dispatch carries: the workstream's goal + ACs, the seam contract text it must
honor (paste the relevant contracts — the engineer shouldn't hunt), and its
ownership globs.

After each wave:

- `node scripts/skailr/check-ownership.mjs --map .claude/program/ownership.json`
  — any violation goes back to the offending workstream's engineer.
- If an engineer reports a seam problem, resolve it: re-dispatch
  `program-architect` for the smallest safe contract change, then tell the
  affected engineers. You own seam-change coordination; nothing else about
  their slices.
- Update progress.md.

## 3. Verify the whole

Dispatch `verifier` with: the program's ACs (from plan.md), the full changed
path set, explicit instructions to exercise the cross-workstream journeys
(the seams are where independently-built slices break), and report path
`.claude/program/verification-report.md`.

NEEDS_FIXES → route each blocking finding to its owning workstream's
`engineer` (or fix inline if it's small and cross-cutting), then re-verify the
affected areas, once. (A Stop hook independently blocks finishing with open
blocking findings.)

## 4. Close out

- Load skill `maintain-claude-md`: reconcile or create CLAUDE.md files for
  what was built — a program almost always changes real structure.
- Mark progress.md complete.
- Report to the user: what shipped per workstream, seam contracts that now
  exist, verification verdict with evidence, and anything deliberately cut.
