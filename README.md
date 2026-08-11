# skailr-agents

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![npm](https://img.shields.io/badge/npm-skailr--agents-cb3837)](https://www.npmjs.com/package/skailr-agents)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-docs-1f1f1f)](https://docs.anthropic.com/en/docs/claude-code)
[![Cursor](https://img.shields.io/badge/Cursor-docs-6e7781)](https://cursor.com/docs)

![skailr-agents hero image](./assets/Skailr-hero.png)

**A thin layer over Claude Code.** Claude Code is already an excellent
engineer; Skailr doesn't wrap it in an org chart — it adds the three things
our own benchmarks showed actually pay for themselves:

1. **Durable context** — `/map-repo` writes a hierarchical `CLAUDE.md` tree
   (root + one per real directory boundary) so every future session starts
   oriented, for zero marginal tokens.
2. **Fresh-context verification** — an independent `verifier` agent that runs
   your code and traces every acceptance criterion against the real diff,
   backed by a blocking Stop hook: a run cannot claim "done" with open
   blocking findings.
3. **Disciplined scale-out** — parallel subagents only where context isolation
   genuinely helps (read-only recon, independent verification, disjoint
   program workstreams with mechanical ownership enforcement) — never as a
   default.

It is not a framework. There is no runtime, no daemon, no graph engine — four
agents, four commands, two skills, one blocking hook, and a couple of Node
scripts that version with your repo.

Built by [Smith | Advanced Systems](https://advsys.io), the research and
development lab behind the project. More at [skailr.io](https://skailr.io).

> **3.0 is a rebuild.** Versions ≤2.x shipped a 40-agent multi-domain
> operating model — relay pipelines, ticket boards, message channels,
> telemetry, model routing, a SQLite phase ledger. Real benchmark campaigns
> ([docs/BENCHMARKS.md](docs/BENCHMARKS.md)) showed it cost **9–16x** vanilla
> Claude Code on time and dollars for equal-or-worse quality, and that every
> release that improved the numbers did so by *removing* machinery. 3.0
> finishes the job: the full evidence trail and the keep/delete manifest are
> in [docs/DESIGN-3.0.md](docs/DESIGN-3.0.md). Upgrading retires the old
> pack files automatically; your project data is never touched.

---

## 📊 Benchmarked against vanilla Claude Code

Real-spend A/B campaign (2026-08-11, `20260811T052149Z-series_1`): identical
prompts, fixtures, model (`claude-sonnet-4-5`), and Claude Code version
(2.1.224) in disposable containers — the only variable is whether
skailr-agents v3.0.0 is installed. Correctness is decided by hidden graders
the agent can never see. Total campaign spend: **$8.82**.

**The tasks:**

| Task | What the agent is asked to do |
| --- | --- |
| `patch-webhook` | Fix a duplicate-webhook-processing bug: `POST /webhooks` may receive the same `event_id` twice, including concurrently — each must be processed at most once, with repeats returning the stored result |
| `feature-status-lookup` | Add a `GET /webhooks/:event_id/status` endpoint returning the stored processing result (404 if unknown) without changing the existing POST contract |
| `feature-api-keys` | Add organization-scoped API keys: create/list/revoke, key shown only once, raw keys never stored, secure-hash authentication of subsequent requests |
| `program-rbac` | Implement org team invitations + role-based access control: invite by email, Member/Admin roles, pending-invitation management, enforcement, audit events |

**The results:**

| Task | Arm | Solved | Quality /100 | Wall time | Cost | Output tokens† | Tool calls | Subagents |
| --- | --- | :-: | :-: | --: | --: | --: | --: | :-: |
| `patch-webhook` | Vanilla | ❌ | 80 | 3m 05s | $0.51 | 8.9k | 25 | 0 |
| | **Skailr 3.0.0** | **✅** | **95** | 6m 24s | $0.91 | 17.4k | 36 | 0 |
| `feature-status-lookup` | Vanilla | ✅ | 95 | 3m 12s | $0.60 | 8.1k | 29 | 0 |
| | **Skailr 3.0.0** | **✅** | **95** | **2m 42s** | **$0.47** | **7.3k** | 36 | 0 |
| `feature-api-keys` | Vanilla | ✅ | 95 | 8m 20s | $1.10 | 28.0k | 40 | 0 |
| | **Skailr 3.0.0** | **✅** | **95** | **5m 53s** | **$0.91** | **18.4k** | 50 | 0 |
| `program-rbac` | Vanilla | ❌ | 89.25 | 9m 26s | $1.81 | 35.8k | 61 | 0 |
| | **Skailr 3.0.0** | **✅** | **94.25** | 15m 32s | $2.52 | 3.4k† | 124 | 4 |

**Skailr solved 4/4; vanilla solved 2/4** — and Skailr was cheaper *and*
faster than vanilla on both mid-size features. The one run that used
subagents (`program-rbac`) used 4 proportional dispatches (architect →
engineers → verifier) versus 10–12 in Skailr 2.x, at 15% of 2.x's cost. For
history and caveats (n=1 per cell; run-to-run variance) see
[docs/BENCHMARKS.md](docs/BENCHMARKS.md).

† Output tokens are main-session only — the harness cannot attribute subagent
token usage (a documented stream-json limitation), which affects only the
`program-rbac` Skailr cell; its dollar cost is complete and includes all
subagents.

---

## Install (30 seconds)

<details>
<summary><strong>npx</strong> — fastest (Node ≥ 18, cross-platform)</summary>

```bash
cd my-app
npx skailr-agents                 # install into the current directory
npx skailr-agents . --claude-only # skip the Cursor mirror
```

</details>

<details>
<summary><strong>Claude Code plugin</strong> — managed install, updates via the marketplace</summary>

```bash
claude plugin marketplace add ns-3e/skailr-agents
claude plugin install skailr-agents@skailr
```

Then, inside any project session:

```
/skailr-agents:install
```

The plugin bootstraps the full pack into that project (same installers,
doctor-verified) and adds `/skailr-agents:doctor` for health checks.

</details>

<details>
<summary><strong>Clone and run</strong> — no npm, no plugin</summary>

```bash
git clone https://github.com/ns-3e/skailr-agents.git /tmp/skailr-agents
/tmp/skailr-agents/install.sh "$(pwd)" --claude-only
```

Windows (PowerShell):

```powershell
git clone https://github.com/ns-3e/skailr-agents.git $env:TEMP\skailr-agents
& "$env:TEMP\skailr-agents\install.ps1" -TargetPath (Get-Location) -ClaudeOnly
```

</details>

Installs are idempotent and upgrade-safe: the `CLAUDE.md` intake zone is
refreshed in place while your project-conventions zone survives untouched,
consumer state (`.claude/experts/`, program runtime) is never modified, and
pack files retired by 3.0 are cleaned out of the target automatically.

## Use

| Command | When | What happens |
| --- | --- | --- |
| `/patch <ask>` | Bug fix, typo, bounded tweak | The session fixes it directly — no subagents, no artifacts, proven cheaper and faster than vanilla in real benchmarks |
| `/build <ask>` | One cohesive feature | The session reads, plans (`.claude/tmp/progress.md` for kill/resume), implements, and tests; optional parallel `researcher` recon; `verifier` dispatched when blast radius warrants; CLAUDE.md reconciled at close |
| `/program <ask>` | Scope too large for one context window | `program-architect` cuts disjoint workstreams + minimal seam contracts; parallel `engineer` agents build them (ownership enforced by script); `verifier` exercises the seams |
| `/map-repo` | New or inherited codebase | Orientation + the hierarchical CLAUDE.md tree + a draft ownership map. The best first command in any real repo |

`/yolo` and `/yolo-program` remain as aliases for `/build` and `/program`.
Plain chat is auto-routed by the installed `CLAUDE.md` intake block: questions
get answered directly, build asks get the right command, and incomplete runs
resume from their progress file instead of restarting.

## What's in the pack

```
.claude/
  agents/engineering/engineer.md        # implements one disjoint slice, designs its own internals
  agents/engineering/verifier.md        # fresh-context adversarial verification (never edits code)
  agents/engineering/researcher.md      # read-only mapping: ask / repo / recon modes
  agents/program/program-architect.md   # workstream decomposition + seam contracts (program tier)
  commands/{patch,build,program,map-repo}.md   (+ yolo, yolo-program aliases)
  skills/maintain-claude-md/            # the hierarchical-CLAUDE.md engine
  skills/apply-ux-quality/              # JIT UX craft checklist for UI work
  program/schemas/                      # ownership schema + orientation template (3 files)
  settings.json                         # 2 Stop hooks: update notice + blocking-findings gate
scripts/skailr/
  check-blocking-findings.mjs           # the blocking Stop hook
  check-ownership.mjs                   # program-tier seam enforcement
  doctor.mjs (+ update/migrate chain)   # install health + upgrade mechanics
```

All four agents use `model: inherit` — they run on whatever model you chose
for the session. There is no routing layer.

## Design principles

- **Zero cost until invoked.** The always-loaded surface is ~30 lines of
  intake. Everything else loads only when a task needs it.
- **One brain, many hands.** The main session owns every build: the model
  that read the code writes the code. Subagents exist for context
  *isolation* — parallel read-only recon, independent verification, disjoint
  program slices — not for division of labor.
- **Skills over personas.** Domain expertise is a checklist loaded
  just-in-time by whoever is working, not a role with a fresh context bill.
- **Artifacts only when they outlive the run.** Code, tests, CLAUDE.md files
  — plus one small progress file per run, existing solely for kill/resume.
- **Deterministic enforcement in hooks, not prose.** The one gate that
  benchmarks proved effective costs zero tokens.

## Verify an install

```bash
node scripts/skailr/doctor.mjs   # read-only health check, FAIL/SKIP-aware
```

## Docs

- [docs/DESIGN-3.0.md](docs/DESIGN-3.0.md) — why 3.0 is shaped like this: the
  benchmark evidence, structural diagnosis, and the full deletion manifest
- [docs/BENCHMARKS.md](docs/BENCHMARKS.md) — the real-spend campaign history
  that drove the redesign (kept as the historical record; a 3.0 re-run is the
  next step)
- [docs/UPDATE-CHECK.md](docs/UPDATE-CHECK.md) — the once-daily update notice
  and how to disable it

## License

MIT — see [LICENSE](LICENSE).
