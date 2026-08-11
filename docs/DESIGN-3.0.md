# Skailr 3.0 — from orchestration framework to thin layer

Status: adopted 2026-08-10. This document records the evidence, the design
principles, and the exact keep/delete manifest for the 3.0.0 restructuring.
It supersedes the operating-model architecture described by every prior
version's docs (teams, channels, telemetry, ticket boards, model routing,
experts, fit-test, phase DB).

## The evidence

Every real benchmark campaign on [BENCHMARKS.md](BENCHMARKS.md) tells the same
story:

- **`patch-webhook` became a win** (beat vanilla on cost and wall time, tied
  on quality) at the exact moment the 1.15.0 inline-fix carve-out shipped —
  i.e. when Skailr spawned **zero agents** and let Claude Code fix the bug.
- **`feature-api-keys`**: vanilla $0.97 / ~6 min / 40 tool calls. Skailr
  $8.40–$15.29 / 42–69 min / 314–395 tool calls. Quality flat.
- **`program-rbac`**: Skailr ~10x vanilla cost for the same graded outcome.
- Every release that improved the numbers (L-1..L-8, L-10, L-11b, the 2.0.0
  dedup) was a **removal** of Skailr machinery. On one traced run, 37% of all
  tool calls were the orchestrator's own bookkeeping.
- The quality machinery did not buy quality: seven-for-seven `program-rbac`
  failures happened *with* validators, phase gates, and the ledger DB running.
  The phantom-completion incident happened *with* the tracking DB. The one
  mechanism with a proven positive effect is the **blocking Stop hook** —
  which costs ~0 tokens.

Quantified overhead of the 2.x pack: ~147k tokens of model-loadable markdown;
~5–10k tokens of fixed process instruction per dispatch; 12–14 dispatches on a
typical full-path feature.

## Why, structurally

1. **Cost scaled with process, not with the problem.** Every mandated
   artifact, checkpoint, telemetry span, and routing lookup was charged to
   every run whether or not the task needed it.
2. **The relay-race pipeline manufactured the context rot it claimed to
   prevent.** Researcher → story-writer → architect → engineers means the
   model that read the code never writes the code. Each hop pays a fresh
   startup and loses information the previous agent had for free. One
   coherent context holding the whole problem is the win condition, not a
   limitation to engineer around.
3. **The pack fought the harness.** It reimplemented model routing in prose
   (doubled with `model:` frontmatter), task tracking as SQLite + markdown
   renderer, a message bus, telemetry, and context budgeting — while the
   genuinely native mechanisms (hooks, skills, subagent frontmatter) were the
   parts that worked.
4. **Half the pack was roleplay, not specialization.** 20 of 40 agents were an
   org simulation inert on the engineering path. Real specialization is narrow
   scope + right tools + just-in-time context — which is what a *skill* is,
   not a persona billed a fresh context window.

## Design principles for 3.0

1. **Zero cost until invoked.** The always-loaded surface (CLAUDE.md intake)
   is ~30 lines. Nothing else loads unless the task needs it.
2. **One brain, many hands.** The main session owns the whole change: reading,
   planning, implementing, integrating. Subagents exist for exactly three
   jobs, each justified by context *isolation*, not division of labor:
   - **parallel read-only exploration** (findings return, file dumps don't);
   - **fresh-context adversarial verification** (independence is the point);
   - **parallel implementation of genuinely disjoint slices** when the scope
     exceeds what one context can hold — the only place multi-agent build
     pays, entered by evidence, not by ask-shape.
3. **Skills over personas.** Domain expertise is a checklist/knowledge file
   loaded just-in-time by whoever is doing the work.
4. **Artifacts only when they outlive the run.** The durable outputs are the
   code, the tests, and the repo's hierarchical CLAUDE.md files. Working state
   is one small progress file per run, existing solely for kill/resume.
5. **Deterministic enforcement in hooks, not prose.** The blocking Stop hook
   (open blocking findings ⇒ can't finish) survives. Prose bookkeeping does
   not.
6. **Verification proportional to blast radius**, chosen by a short rubric,
   defaulting to cheap.

## The 3.0 pack

### Agents (4, down from 40)

| Agent | Job | Tools |
| --- | --- | --- |
| `engineer` | Implements one disjoint, self-designed slice against a seam contract (program workstreams; large disjoint build slices) | Read, Grep, Glob, Write, Edit, Bash |
| `verifier` | Fresh-context adversarial verification: runs the code, traces every AC against the real diff, writes `verification-report.md` with Blocking Findings | Read, Grep, Glob, Bash, Write, Edit |
| `researcher` | Read-only mapping: repo orientation (`/map-repo`), ask-mode answers, parallel recon | Read, Grep, Glob, Write, Edit |
| `program-architect` | Decomposes a program into disjoint workstreams + minimal seam contracts + `ownership.json`; owns seam changes | Read, Grep, Glob, Write, Edit |

`model:` frontmatter on the agent file is the **only** model-routing
mechanism.

### Commands (4 + 2 aliases, down from 15)

| Command | Path |
| --- | --- |
| `/patch` | Inline fix by the main session. No dispatches, no artifacts beyond the diff and a few-line report. Escalates to `/build` if scope grows. |
| `/build` | One cohesive feature. Main session plans and implements; optional parallel researcher recon up front; `verifier` dispatch when the blast-radius rubric says so; updates CLAUDE.md files if structure changed. Auto-resumes from `.claude/tmp/progress.md`. |
| `/program` | Scope that exceeds one context window. `program-architect` decomposes; parallel `engineer` dispatches per disjoint workstream (ownership enforced by `check-ownership.mjs`); `verifier` at the seams; auto-resumes from `.claude/program/progress.md`. |
| `/map-repo` | Brownfield baseline: orientation + **hierarchical CLAUDE.md files** (the flagship durable asset), draft ownership map, short backlog. |
| `/yolo`, `/yolo-program` | Thin aliases → `/build`, `/program` (muscle memory + bench continuity). |

Resume is folded into `/build` and `/program` (they check their progress file
first); the `continue-*` commands are gone.

### Skills (2, down from 26)

`maintain-claude-md` (the durable-context engine behind `/map-repo` and
`/build`'s reconcile step) and `apply-ux-quality` (JIT domain expertise —
the pattern that replaces expert personas).

### Scripts (8 + hooks sample, down from 29)

Kept: `check-ownership.mjs` (program-path seam enforcement),
`check-blocking-findings.mjs` (blocking Stop hook, rewritten without the DB),
`doctor.mjs` + `doctor-autoupdate.mjs`, `migrate.mjs` + `migrate-smoke.mjs`,
`check-update.mjs` + `update-smoke.mjs`. Everything else — the SQLite state
machine, ticket board, channels validators, telemetry, model-routing applier,
block lint, expert checker, phase-tracking hook, prompt router — is deleted.

### Hooks

`Stop`: `check-update.mjs` (advisory) and `check-blocking-findings.mjs`
(blocking, marker-bounded). Nothing else.

## Deleted, exhaustively

- **Agents**: the whole org sim (content/design/finance/legal/marketing ×4),
  pm ×4, portfolio ×2, experts ×2, program-documenter, program-validator,
  integration-verifier, architect, story-writer, backend/frontend/data
  engineers (folded into `engineer`), e2e-verifier + validator (folded into
  `verifier`).
- **Commands**: ship-feature, build-feature, continue-feature, discover,
  plan-program, build-program, continue-program, discover-portfolio,
  plan-portfolio, status-portfolio, mint-expert.
- **Skills**: route-models, emit-telemetry, fit-test, track-phase,
  run-ticket-board, run-gated-pipeline, run-feature-queue, route-channels,
  route-intake, consult-or-mint, curate-expert, freeze-contract, emit-stubs,
  drain-exception-inbox, compile-status-digest, reconcile-model,
  trace-requirement, write-handoff-and-yield, sync-lineage,
  archive-program-state, resume-from-ledger, resume-from-feature-progress,
  cleanup-scoped-artifacts, check-ownership (the skill; the script remains),
  call-intair.
- **State/config**: `.claude/skailr.db` and the whole `db.mjs`/render layer,
  `.claude/model-routing.json`, `.claude/teams/registry.md`,
  `.claude/program/channels/*`, all but three schema/template files
  (`orientation.template.md`, `ownership.schema.json`,
  `ownership.example.json`).
- **Experts**: the mint/scout/curate pipeline and registry routing. Existing
  `.claude/experts/` directories in consumer projects are left untouched
  (they are consumer data) but nothing reads them anymore; their content is
  better converted into project skills or CLAUDE.md conventions.

`settings.skailr.json` and the migration/update-check chain survive untouched
— they are zero-token at runtime and the update mechanism is a shipping
channel, not orchestration. The `telemetry.enabled` key is vestigial.

## Consumer migration

`install.sh` / `install.ps1` gain a **retire phase**: an explicit list of
pack-owned file paths from ≤2.x that are deleted from the target if present.
Consumer-owned paths (`.claude/experts/`, `.claude/program/` runtime,
`.claude/tmp/`, `CLAUDE.md` project-conventions zone) are never touched.
The CLAUDE.md intake-zone refresh mechanism is unchanged.

## What would prove this out

Re-run the standing bench (same three tasks, both arms). Expected: `/patch`
holds its win; `/build` lands within ~1–2x vanilla cost with equal-or-better
quality via the verifier; `/program` drops far below the 2.x ~10x multiple.
If `/build` cannot beat vanilla on quality at ≤2x cost, the verifier rubric —
not more orchestration — is the next lever.
