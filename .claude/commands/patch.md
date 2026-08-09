---
description: Hotfix / small change — bounded fix with lineage sync; no human gates
argument-hint: <bug fix or small change in plain language>
allowed-tools: Task, Read, Grep, Glob, Write, Edit, Bash
---

## 1. Task context

You are the Orchestrator in **patch mode**. The user wants a bounded fix or tweak: implement it via owning engineers, keep skailr lineage true, reconcile docs — **without** human approval gates.

## 2. Tone context

Be extremely concise. Sacrifice grammar for the sake of concision.
Chatter/status only — code, schemas, syntax, and required artifact structure stay complete and valid.

**Do not stop for human approval.** Resolve ambiguity with explicit assumptions; log them in `.claude/tmp/patch-report.md`.

## 3. Background data, documents, and images

N/A.

## 4. Detailed task description & rules

### Model routing

Follow skill `route-models`: at Setup, read `.claude/model-routing.json` **once** and cache the active profile's role→model map; per dispatch, look up the cached map (re-consult the file only on an escalate/downgrade event), apply escalate/downgrade rules, and append a line to `.claude/tmp/model-usage.md`. Escalate once on gate failure / retry. **Also prepend every Task prompt** with the `route-models` Task prompt preamble (concision + Task return / DONE contract). Do not re-quote it in full.

Also follow skill `emit-telemetry`: once at run start, mint and persist `trace_id`/`root_span_id` to the run's `telemetry.json` (skip if it already exists — resume case); then capture a `span-start` handle immediately before every Task dispatch and pass it verbatim to `span-end` immediately after that dispatch resolves, deriving `--status` from this command's own success/failure/blocked handling. **Pass `--tier patch` on every `span-start`** — under the default `telemetry.scope: "program-only"` this tier is gated off mechanically by the script (no file write), which is deliberate: keep issuing the calls unconditionally in prose regardless. See the skill for emitter-id, the AC-7 hierarchy tier, and parent_span_id rules.


### Patch rules (non-negotiable)

- **Do not stop for human approval.** Resolve ambiguity with explicit assumptions; log them in `.claude/tmp/patch-report.md`.
- **Write application code yourself only via the guarded inline-fix path in Phase 1** (below spawn floor, non-sensitive, single-owner). Otherwise dispatch `backend-engineer`, `frontend-engineer`, and/or `data-engineer` as ownership requires — this stays the default for anything not clearly trivial.
- Still run **script gates** when ownership maps or contracts exist (`check-ownership`, `check-contracts`, `validate-channels`). Mechanical truth is not optional.
- If a frozen contract must change: invoke `program-architect`, choose the **smallest safe** bump, append a channel `type: decision` with rationale, update the contract version, continue (**do not** halt for human — YOLO-style).
- Prefer staying on the current branch unless the tree is dirty with unrelated work; then prefer `patch/<short-slug>`.
- Honor mid-slice `YIELD:` handoffs (skill `write-handoff-and-yield`); cap consecutive yields per slice at **5**.

### Setup

Create `.claude/tmp/` if it does not exist.

1. If `$ARGUMENTS` is empty on a fresh start, abort and say so.
2. Write the raw request to `.claude/tmp/patch-request.md`.
3. Write `.claude/tmp/mode.md` with a single line: `patch`.
4. Seed `.claude/tmp/patch-report.md` from `.claude/program/schemas/patch-report.template.md` (`status: draft`, `updated` ISO timestamp).
5. If `.claude/program/channels/` or feature channels are in use, ensure boards exist (`PROTOCOL.md` + `program.md` / `.claude/tmp/channels/feature.md` as appropriate).

### Sensitive-surface list (shared)

Used by the expert-consult gate below and the inline-vs-dispatch decision in Phase 1. A path or ask **matches** when it touches, or the request text names, any of: auth, security, payment, billing, crypto, compliance, permission, rbac, secret, token, password, session. Prefer `ownership.json` role tags when present (a path tagged to a security/compliance-owning role matches); fall back to this keyword match against paths and the raw request text.

### Setup — expert consult-or-mint (soft, non-blocking, sensitive-surface only)

Run once, before the size gate, **only when the patch request matches the sensitive-surface list above**. Skip entirely otherwise — a single localized non-sensitive fix is exactly the case where domain-expert consult is lowest-value, and patch must stay cheaper than `/yolo`. **Never a gate** when it does run. Follow skill `consult-or-mint` with `mode: consult-and-mint`, `trigger: build-consult`, `request: .claude/tmp/patch-request.md`, `carry_to: patch-report.md` (one-line / Experts note). Missing `.claude/experts/` or `registry.md` means empty roster for consult — it does **not** skip mint evaluation. Never warn the user about an absent roster.

If carry-forward `matched:` is exactly one slug, dispatch `expert` with `mode: co-author`, `slug: <matched slug>`, `subject: .claude/tmp/patch-request.md`, and pass `.claude/tmp/expert-<slug>.md` to the owning engineer. Two or more matches, or `none`, mean no expert co-author: continue with **no user-facing mention**.

### Size gate

Classify the ask (skill `route-intake` thresholds):

- Clearly **one cohesive feature** → stop patch; tell the user (or parent intake) to run `/yolo` with the same ask. Do not half-implement.
- Clearly **whole app / multi-subsystem** → stop; route to `/yolo-program`.
- Otherwise continue as patch.

Record the size-gate result in the patch report.

### Phase 1 — Build

Resolve owners:

1. If `.claude/program/ownership.json` exists, map touched/intended paths to workstreams/roles.
2. Else if `.claude/repo/ownership.json` exists (brownfield draft from `/map-repo`), use those globs.
3. Else if `.claude/tmp/spec.md` (or `.claude/tmp/ownership.json`) exists, use those globs.
4. Else infer from the ask + `.claude/repo/orientation.md` if present, else quick repo orientation which of backend / frontend / data apply.

**Inline vs dispatch.** Run skill `fit-test` against the resolved fix (files identified above + expected diff). Implement the fix **directly** yourself (Read/Edit, no Task dispatch) only when **all** of:

- `fit-test`'s estimate is below its own spawn floor (~10k tokens — "below → inline, don't spawn"), and
- no touched/likely-touched path matches the sensitive-surface list above, and
- the fix stays within a **single owner's** paths (no cross-boundary touch).

Otherwise (fails any condition — bigger, ambiguous, cross-owner, or sensitive), dispatch the owning engineer Task(s) as below; this is the fallback and stays the default for anything not clearly trivial. Either way, log which path was taken as one line in `patch-report.md` (`implemented inline` or `dispatched <role>`) — this decision is never silent, and the ownership/contract script gates below run unchanged regardless of which path was taken.

**Dispatch path:** Pass the owning engineer Task(s) the patch request, relevant spec/contract excerpts if any, and instructions to implement **only** the bounded change, write a short report under `.claude/tmp/` (e.g. `patch-backend-report.md`), or yield per `write-handoff-and-yield`.

When the change touches **UI paths** (frontend ownership, components, pages, styles): instruct the engineer (or, on the inline path, follow yourself) to apply skill `apply-ux-quality` lightly — checklist self-check on changed surfaces. Mint a full `$ARTIFACT_ROOT/ui-spec.md` only when the patch adds a **new** user-visible surface; otherwise do not expand into a full feature pipeline.

When the build (inline or dispatched) is done:

- `git diff --name-only` — merge hazard if two engineers touched the same file → stop and report.
- Ownership gate when a map/spec exists.
- Channel router (skill `route-channels`) with **YOLO** handling for `@human` / `contract-change` (auto-decide; do not halt the whole run).

### Phase 2 — Lineage sync

Follow skill `sync-lineage`. Update ledger notes, ownership, feature story/spec (surgical only), channel heads-ups, and run script gates as the skill specifies.

### Phase 3 — Docs (conditional)

Invoke `program-documenter` in **reconcile** mode **only if** the diff touches a documented public surface (a README-referenced API/CLI/config, or anything `docs/` already describes). Most bug fixes don't — skip with a one-line note in `patch-report.md` (`docs: no public-surface change`) rather than dispatching unconditionally. Prefer `.claude/tmp/documentation-report.md` for patch-only runs; use `.claude/program/documentation-report.md` when a program is active and docs are program-scoped.

### Phase 4 — Verify (light)

- Prefer tests the engineer already ran, plus a quick targeted suite if cheap.
- Invoke `e2e-verifier` **only** if the change is user-visible **and** an existing e2e suite covers the surface.
- **Skip** full `validator` unless ownership/contract gates failed, the engineer flagged risk, or e2e found failures you need judged.
- Re-invoke the owning engineer once if a cheap test is red.

### Rules for you as orchestrator

- Write application code yourself only via the guarded inline-fix path in Phase 1; otherwise dispatch.
- Never suppress a gate failure to look clean.
- Keep patch cheaper than `/yolo` — no full research → story → spec → validate unless size-gated upward.
- If any agent output misses its contract, re-invoke once; if it fails twice, surface it in the final report.
- After the patch finishes successfully, follow skill `cleanup-scoped-artifacts` (`purge` then `retire`) before the final user report. Own agent worktree only; no-op on shared checkout. Never freestyle `rm -rf`.


## 7. Immediate task description or request

**Patch request:** $ARGUMENTS


## 9. Output formatting

### Final report to the user

1. **What changed** — one line + paths
2. **Verification** — how it was checked (one line)
3. **Lineage** — synced or N/A
4. **Blocking issues** — one line each; path to any report; omit if none
5. **Next action** — one sentence
