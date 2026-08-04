# skailr-agents

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![npm](https://img.shields.io/badge/npm-skailr--agents-cb3837)](https://www.npmjs.com/package/skailr-agents)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-docs-1f1f1f)](https://docs.anthropic.com/en/docs/claude-code)
[![Cursor](https://img.shields.io/badge/Cursor-docs-6e7781)](https://cursor.com/docs)

![skailr-agents hero image](./assets/Skailr-hero.png)

**A multi-agent operating model for Claude Code and Cursor.** You install it into a repo; Claude Code (or Cursor) runs the agents. Skailr adds the org structure agents are missing: plan before build, single-job roles, a visible message board, frozen contracts, and mechanical script gates.

It is not a framework. There is no runtime, no daemon, no graph engine — just markdown roles, contracts, and Node script gates that version with your repo.

Built by [Smith | Advanced Systems](https://advsys.io), the research and development lab behind the project. More at [skailr.io](https://skailr.io).

---

## Install (30 seconds)

### 1. Get the pack into your project

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

The plugin bootstraps the full pack into that project (same installers, doctor-verified) and adds `/skailr-agents:doctor` for health checks. Day-to-day work uses the project-local commands below.

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

Omit `--claude-only` to also install the Cursor mirror; `--cursor-only` for Cursor alone.

</details>

Every channel runs the same idempotent installers. They never touch `.claude/experts/` (your minted expert roster survives every upgrade), and re-running never wipes runtime state. Details: [Install details](#install-details).

### 2. Commit the pack

```bash
git add .claude CLAUDE.md scripts/skailr .gitignore
git commit -m "Add skailr-agents operating model"
```

Teammates who pull get the same agents, same gates, same routing.

### 3. Start Claude Code and just talk

```bash
claude
```

That's it. **Plain chat is auto-routed** ([docs/INTAKE.md](docs/INTAKE.md)) — a question goes to the researcher, a small fix to `/patch`, a feature to `/yolo`, a whole app to `/yolo-program`. Or run any slash command yourself (`/map-repo`, `/discover`, `/ship-feature`, …).

On an existing codebase, baseline first:

```
/map-repo
```

---

## Why this exists

Single agents are asked to plan, architect, build, test, and validate in one pass. Large projects then fail the way large human projects fail: unclear scope, overlapping ownership, silent interface drift, and coordination buried in one long chat.

If agents fail on large work, the model may not be the problem. **The operating model** might be.

### #1: One agent, wearing every hat

You ask for an app. The agent starts typing code before anyone agreed what "done" means. Halfway through, it's re-deciding the data model inside a component file.

**The fix: plan first, then specialize.** Skailr runs a plan layer before any build — discovery until *you* confirm the brief, decomposition into workstreams with owned files, then execution by single-job roles (researcher, story-writer, architect, engineers, verifier, validator — each does one thing). For a whole product: `/discover` → `/plan-program` → `/build-program`. For one feature: `/ship-feature`. No gates wanted? `/yolo-program` and `/yolo` run the same pipelines with decisions auto-made and logged ([docs/YOLO.md](docs/YOLO.md)).

### #2: Coordination buried in one long chat

When one context window holds the plan, the code, the questions, and the answers, nothing is inspectable and nothing survives the session.

**The fix: a message board, not a chat.** Agents coordinate through append-only markdown channels ([PROTOCOL.md](.claude/program/channels/PROTOCOL.md)). A blocked agent posts one typed message (`question`, `blocker`, `contract-change`), addresses `@agent` / `@team` / `@human`, and ends its turn. The orchestrator routes. `@human` halts for you; unrelated workstreams keep running. Everything is on disk, in git, readable after the fact.

### #3: Parallel agents, no seams

Two agents touch the same file, or team B builds against an interface team A quietly changed an hour ago. Integration day becomes archaeology.

**The fix: frozen contracts and mechanical gates.** Ownership globs must be disjoint — a script checks, not a promise. Cross-team interfaces freeze at plan approval; consumers build against stubs; only the program-architect can change a frozen contract, with your approval of the blast radius. Workstreams stamp `built-against: <contract>@<version>` and the integration verifier fails the composition if anyone built against a stale interface. Script gates (`scripts/skailr/*.mjs`) run in every mode — YOLO skips *human* gates, never mechanical ones.

### #4: "Done" that isn't done

An agent reports success; nobody ran the tests. A validator "reviews" by reading the report the builder wrote.

**The fix: evidence, adversarially checked.** The e2e-verifier must paste the real test-runner output — typed totals are a claim, not evidence. The validator is a separate adversarial role: it walks every acceptance criterion into an AC-by-AC verdict table, re-runs the ownership scan against the final diff, and hunts quiet skips (`TODO`, `.skip`, stubbed returns) before anything is called shippable. `node scripts/skailr/doctor.mjs` health-checks the whole installation; `node scripts/skailr/status.mjs` shows any in-flight run in one view.

---

## What do I run?

| You want to… | Use | Commands |
| ------------ | --- | -------- |
| **Ask a question** (no code change) | Intake → expert (exact-one band) or researcher | Plain chat |
| **Map an existing repo** (brownfield baseline, backlog) | Map-repo | `/map-repo` — [docs/MAP_REPO.md](docs/MAP_REPO.md) |
| **Small fix / tweak** (keep lineage/docs true) | Patch (YOLO-style) | `/patch` — or plain chat |
| **Build a whole app / MVP / many parts** (gated) | Program tier | `/discover` → `/plan-program` → `/build-program` |
| **Build a whole app** as fast as possible (no gates) | Program YOLO | `/yolo-program` — [docs/YOLO.md](docs/YOLO.md) |
| Ship **one** cohesive feature (with approval gates) | Workstream | `/ship-feature` → `/continue-feature` → `/build-feature` |
| Ship **one** feature as fast as possible (no gates) | Feature YOLO | `/yolo` |
| Run **many** concurrent initiatives | Portfolio | `/discover-portfolio` → `/plan-portfolio` → `/status-portfolio` |
| **Give the agents depth in your domain** (project-local expert roster) | Experts | `/mint-expert` — [docs/experts.md](docs/experts.md) |

**Important:** `/ship-feature` and `/yolo` are **one feature, one story, one build**. They will not break a whole product into workstreams — that's `/discover`…`/build-program` or `/yolo-program`. On an unfamiliar existing codebase, run `/map-repo` first. Plain chat follows the same rules via intake ([docs/INTAKE.md](docs/INTAKE.md)).

---

## The paths, end to end

<details>
<summary><strong>Existing repo (brownfield)</strong> — <code>/map-repo</code></summary>

Install into a non-empty project, then baseline before shipping:

```
/map-repo
```

Optional focus: `/map-repo auth and public UI`.

Claude maps the tree, drafts ownership, assesses gaps, and presents a backlog. **Confirm** the baseline (human gate). Then pick a backlog item → `/patch` / `/yolo`, or charter a larger initiative → `/discover` / `/yolo-program`. After confirmation, commit `.claude/repo/` (orientation, ownership draft, backlog) so the map is shared. Full notes: [docs/MAP_REPO.md](docs/MAP_REPO.md).

</details>

<details>
<summary><strong>Whole app, gated</strong> — <code>/discover</code> → <code>/plan-program</code> → <code>/build-program</code></summary>

**Step 1 — Discover.** Paste the product vision:

```
/discover I want a billing SaaS: orgs, invoices, email reminders 3 days before due,
customer portal to pay, and an admin dashboard. Stack preference: TypeScript.
```

Answer clarifying questions until you confirm a shared brief (`.claude/program/brief.md`). **Do not skip confirmation** — wrong assumptions here fan out across every workstream.

**Step 2 — Plan.** `/plan-program` produces workstreams, a shared kernel, frozen interface contracts, and a dependency DAG under `.claude/program/`. Approve to **freeze** contracts.

**Step 3 — Build.** `/build-program` executes: foundation/kernel → parallel workstream teams (engineering runs a MECE feature queue; each feature gets the full feature pipeline + ticket board) → integration (real against real) → program validation against the original brief → release documentation.

**Resume:** `/continue-program` picks up from `.claude/program/ledger.md` at the first incomplete phase — sessions, usage limits, and restarts don't lose work. Finished programs auto-archive to `.claude/program/archive/<ts>-<slug>/` so the next initiative starts clean.

</details>

<details>
<summary><strong>Whole app, no gates</strong> — <code>/yolo-program</code></summary>

```
/yolo-program Billing SaaS: orgs, invoices, email reminders 3 days before due,
customer portal to pay, admin dashboard. Prefer TypeScript.
```

Same end-to-end program pipeline; brief/plan freezes and mid-build escalations are auto-decided and logged. Read the final **Assumptions made** and orchestrator decisions carefully — they replace your sign-offs. Full notes: [docs/YOLO.md](docs/YOLO.md).

</details>

<details>
<summary><strong>One feature, gated</strong> — <code>/ship-feature</code> → <code>/continue-feature</code> → <code>/build-feature</code></summary>

```
/ship-feature Users should get an email reminder 3 days before an invoice is due
```

1. **Researcher** maps the repo (or notes greenfield).
2. **Story-writer** drafts acceptance criteria → you approve the story.
3. `/continue-feature` → **architect** writes the tech spec + ticket board → you approve.
4. `/build-feature` → ticket workers build in parallel → E2E verification → adversarial validation → docs.

Artifacts live in `.claude/tmp/` (`request.md`, `research.md`, `story.md`, `spec.md`, `board.md`, `tickets/`, `progress.md`, reports); runtime state is gitignored. **Resume:** `/continue-feature` from `.claude/tmp/progress.md`. Next feature: run `/ship-feature` with a **new** request — only then are stale tmp files archived.

</details>

<details>
<summary><strong>One feature, no gates</strong> — <code>/yolo</code> · <strong>Small fix</strong> — <code>/patch</code></summary>

```
/yolo Users should get an email reminder 3 days before an invoice is due
```

Same feature pipeline, story/spec approvals skipped. Read the final **Assumptions made**. Interrupted? `/continue-feature` (or `/yolo` with no new prompt) resumes.

```
/patch Fix the invoice due-date timezone bug on the reminder job
```

Bounded change via the owning engineers; syncs ledger/ownership/contracts/docs (skill `sync-lineage`). Plain chat with a small-fix ask routes here automatically. Too large → `/yolo` or `/yolo-program`.

</details>

<details>
<summary><strong>Many concurrent initiatives</strong> — portfolio tier</summary>

Use when you are running several large bets at once. Portfolio sits above programs the way a CEO/PMO sits above VPs: clarify the mandate (`/discover-portfolio`), decompose into initiatives and conflict surfaces (`/plan-portfolio`), then monitor exceptions only (`/status-portfolio`). It never writes product code. After planning, run per-initiative program commands; `/status-portfolio` points at `/continue-program` for blocked programs.

</details>

**After any run:** review the validator verdict, assumptions (YOLO), and channel board; commit your app code as usual. Don't commit `.claude/tmp/` or most `.claude/program/` runtime (the installer's gitignore covers it). **Do** commit `.claude/repo/` after a confirmed `/map-repo` baseline.

---

## How it works

Tiers nest, each with durable on-disk state and a resume command:

**Portfolio** (many initiatives — CEO/PMO layer) → **program** (one large initiative — VP-owned) → **workstream** (team + ownership + contracts) → **feature** (MECE shippable outcome) → **ticket board** (AC build packets).

| Capability | What it means |
| ---------- | ------------- |
| **Hierarchy** | Plan layer first; then teams execute. Brownfield baselines before build. |
| **Division of labor** | Single-job agents plus domain teams (content, legal, PM, design, marketing, finance). |
| **Progressive disclosure** | Thin registry → team lead → workers. Unused domains cost almost nothing. |
| **Message board** | Append-only channels under `.claude/program/channels/` (feature runs: `$ARTIFACT_ROOT/channels/`). |
| **Frozen contracts** | Cross-team seams freeze after plan approval; only the program-architect changes them, gated on your approval. |

**Claude Code vs Cursor:** `.claude/` is the source of truth; `.cursor/` is a generated mirror. Edit `.claude/`, then `./scripts/remirror.sh` if you maintain this pack.

**Context budget:** the program → workstream → feature → ticket nesting above is recursive, not fixed at two tiers — any lead whose task doesn't fit a smart-zone context (≤125k tokens, target well under) runs a fit test and decomposes further, along the same contract-seam / single-writer rules that already separate workstreams. Full model, numeric defaults, and the worked example: [docs/CONTEXT_BUDGET.md](docs/CONTEXT_BUDGET.md).

<details>
<summary><strong>Program tier deep dive</strong> — conflict design, roles, channels, docs phase</summary>

**How conflict is designed out:**

- **Spatial** (two teams, same file): ownership must be disjoint; shared paths belong in the frozen kernel.
- **Temporal** (Team B needs Team A's output): contract-first. A freezes an interface; B builds against a stub in parallel; they integrate at the end. Workstreams stamp `built-against: <contract>@<version>`; `check-contracts.mjs --consumed` fails stale consumers.
- **Change control:** only the program-architect changes a frozen contract, and only after your approval.

| Agent | Writes code? | Purpose |
| ----- | ------------ | ------- |
| program-architect | No | Discovery; decomposition; owns all cross-team contracts |
| integration-verifier | Tests only | Proves independently-built workstreams compose (real against real, no stubs) |
| program-validator | No | Final sign-off against the original brief |
| program-documenter | Docs only | Changelog, API refs, runbooks from the **diff**, not the plan |

Persistent state: `.claude/program/` (`brief.md`, `plan.md`, `contracts/`, `ledger.md`, channels). Seeded channel example: [program.md](.claude/program/channels/program.md).

</details>

<details>
<summary><strong>Feature pipeline deep dive</strong> — roles and the ticket board</summary>

**Path:** researcher → story-writer → architect (spec + `ui-spec.md` when UI + ticket board) → frontier ticket workers (backend / frontend / optional data / research / decide) → e2e-verifier → validator (Pass 4 UX when FE ships) → program-documenter.

| Agent | Writes code? | Scope | Purpose |
| ----- | ------------ | ----- | ------- |
| researcher | No | Read-only | Maps what exists; also resolves `research` tickets |
| story-writer | Story doc | n/a | Testable acceptance criteria |
| architect | Spec + board + ui-spec | n/a | Data model, API, ownership split, tickets |
| backend-engineer | Yes | Ticket or backend globs | Migrations, services, handlers, unit tests |
| frontend-engineer | Yes | Ticket or frontend globs | UI, state, API client; UX checklist |
| data-engineer | Yes | Ticket or data globs | ETL/ELT, schemas (optional) |
| e2e-verifier | Tests only | Tests | User-perspective proof, runner output pasted verbatim |
| validator | No | Read-only | AC-by-AC verdicts, security, quiet skips, out-of-scope-write scan, UX Pass 4 |

**Ticket board:** after `spec.md`, the architect mints `$ARTIFACT_ROOT/board.md` + `tickets/` (standalone `ARTIFACT_ROOT` is `.claude/tmp`; nested program features use `workstreams/<ws>/features/<slug>`). Tickets carry acceptance criteria, ownership globs, and `blocked_by` edges; the orchestrator claims frontier tickets and dispatches small workers (`ticket-status.mjs --root $ARTIFACT_ROOT`). Channels coordinate blockers; they never assign work.

User-visible UI follows skill `apply-ux-quality` (story UX ACs, architect-minted `ui-spec.md`, frontend checklist, validator Pass 4). The design *team* is not required on every feature; craft still is.

**Gates (gated path):** after story; after spec; then unattended build. YOLO skips the human gates; script gates always run.

</details>

<details>
<summary><strong>Domain teams</strong> — content, legal, PM, design, marketing, finance</summary>

The program tier is domain-agnostic; engineering is one team among siblings. Disclosure is just-in-time:

1. **Tier 1: registry** (`.claude/teams/registry.md`) — name, capability, `route-when`.
2. **Tier 2: team lead** — loaded only when a workstream routes there.
3. **Tier 3: workers** — loaded as the lead dispatches them.

| Team | Owns | Verifier means |
| ---- | ---- | -------------- |
| engineering | files / directories | behavior proven by tests |
| content | pieces / sections | facts sourced + brand voice |
| legal | requirements / controls | every claim traced |
| pm | milestones / risks / digests | exceptions escalate |
| design | assets / artboards | a11y + design-system + craft (anti-AI layout) |
| marketing | channels / segments | message + measurement alignment |
| finance | worksheets / models | numbers reconcile + assumptions traced |

Pipelines: content-lead → strategist → writer → editor · legal-lead → analyst → compliance-reviewer → legal-validator · pm-lead → planner → risk-analyst → status-reporter · design-lead → strategist → designer → design-reviewer · mkt-lead → strategist → channel-planner → mkt-analyst · fin-lead → analyst → modeler → fin-auditor.

Cross-domain demo: [examples/launch-kit/](examples/launch-kit/). To add a domain: create `.claude/agents/<prefix>/`, register a sharp `route-when`, set `status: built`.

</details>

<details>
<summary><strong>Project domain experts</strong> — optional, project-local depth</summary>

Teams are process roles and stay generic on purpose. A **minted expert** is the other axis: cited, project-local depth in one vertical, stored under `.claude/experts/` and consulted by the roles that were already going to run.

```
/mint-expert invoice dunning and payment retries
```

- **Experts are not a team** — never routed a workstream, never in an ownership map. They advise, co-author as scoped input, and gate as evidence a sign-off role cites.
- **Every claim cites a source**; `scripts/skailr/check-experts.mjs` validates every profile before it reaches the roster.
- **Soft by default** — a fresh expert is `provisional` and can never block. Promotion needs explicit human action.
- **The mechanism ships; the roster is yours** — installers never touch `.claude/experts/`.

Plain chat routes a question to an expert only when **exactly one** band covers it; zero or two-plus matches fall through to the researcher. Full guide: [docs/experts.md](docs/experts.md).

</details>

---

## Command reference

| Command | What it does | Business equivalent |
| ------- | ------------ | ------------------- |
| `/discover-portfolio` | Confirm portfolio brief (`.claude/portfolio/brief.md`) | **CEO / exec strategy offsite** |
| `/plan-portfolio` | Initiatives, programs, conflict surfaces; open portfolio ledger | **Portfolio / PMO planning** |
| `/status-portfolio` | Traffic lights + exception inbox rollup | **CEO / exec status review** |
| `/discover` | Confirm program brief (`.claude/program/brief.md`) | **VP kickoff / discovery** |
| `/map-repo` | Confirm brownfield baseline (`.claude/repo/`) | **Brownfield onboarding / repo audit** |
| `/plan-program` | Workstreams, frozen contracts, execution DAG | **Program planning + interface freeze** |
| `/build-program` | Execute approved program DAG | **Program delivery** |
| `/continue-program` | Resume from program ledger | **Resume mid-initiative** |
| `/yolo-program` | Full program pipeline, no approval gates | **Program delivery without approval gates** |
| `/ship-feature` | Research → story → spec with gates | **Gated feature intake** |
| `/continue-feature` | Resume from feature progress | **Resume mid-feature** |
| `/build-feature` | Build → E2E → validate → docs | **Approved-spec delivery** |
| `/yolo` | Full feature pipeline, no approval gates | **Feature delivery without approval gates** |
| `/patch` | Bounded fix; sync lineage/docs | **Hotfix / small change request** |
| `/mint-expert` | Mint or curate a project domain expert | **Hiring a domain specialist** |

---

## Operate and tune

- **Run status** — `node scripts/skailr/status.mjs`: program phase + feature cursors, active feature, ticket frontier, channel inbox with message age, blockers. Read-only; `--json` for tooling.
- **Health check** — `node scripts/skailr/doctor.mjs`: core files, agent/skill/script references, model routing, expert roster, contracts, channels, mirror presence (plus pack-repo-only checks). Exit 1 on any FAIL; `--json` for tooling.
- **Model routing** — trade cost vs quality per role ([docs/MODEL_ROUTING.md](docs/MODEL_ROUTING.md)):

```bash
node scripts/skailr/apply-model-routing.mjs --profile economy   # haiku digests, sonnet drafts, opus judgment
node scripts/skailr/apply-model-routing.mjs --profile balanced  # default (committed frontmatter)
node scripts/skailr/apply-model-routing.mjs --profile quality   # prefer opus
npm run models:check
```

In the default `balanced` profile, worker roles run on Sonnet against an Opus-authored spec; architect, planners, verifiers, and validators stay on Opus.

- Add repo-specific conventions to each agent's Standards section.
- If your repo doesn't split backend/frontend, redefine engineers along your real seam — the pattern is **disjoint ownership**, not the names.
- Back boundaries with CI that fails PRs whose backend commits touch frontend paths. Prompt scoping is a convention, not a hard sandbox.

---

## Install details

The installer copies `.claude/` and `.cursor/` into your project, creates `.claude/tmp/`, `.claude/program/`, and `.claude/repo/`, and appends ignore rules if missing. Idempotent; safe to re-run.

### Upgrading an existing install

There is no separate update command — re-run any install channel (`npx skailr-agents`, `/skailr-agents:install`, or `./install.sh /path/to/project`) against the project. Re-install **does not wipe** runtime state:

| Preserved | Overwritten (pack files) |
| --------- | ------------------------ |
| `.claude/portfolio/` | Agents, commands, skills, teams registry |
| `.claude/program/` runtime (brief, plan, contracts, ledger, workstreams, …) | `CLAUDE.md`, intake, settings, model-routing |
| `.claude/tmp/` feature artifacts | Program schemas + channel templates |
| `.claude/repo/` map-repo baseline | Cursor rules/commands and `scripts/skailr/` |
| `.claude/experts/` (asserted byte-identical) | |

Local edits to pack files in a consumer repo are replaced on upgrade. Commit the refreshed pack paths afterward. Inventory: [manifest.json](manifest.json). License: [MIT](LICENSE).

### Enforcement fixtures (optional)

```bash
node scripts/skailr/check-ownership.mjs --map examples/parallel-api/ownership.json --map-only
node scripts/skailr/ledger-status.mjs --ledger examples/parallel-api/ledger.md
node scripts/skailr/check-ownership.mjs --map examples/launch-kit/ownership.json --map-only
node scripts/skailr/check-contracts.mjs --dir examples/launch-kit/contracts
```

See `examples/parallel-api/` and `examples/launch-kit/`.

---

## Memory and run state

Skailr agents track run state and memory purely through plain `.md` files already documented above — the ledger, `progress.md`, ownership maps, the registry, and channel boards. There is no external graph database or service in the loop; that's the whole persistence model, and it works the same whether you're on Claude Code, Cursor, a clean checkout, or CI.

---

## FAQ

### Is skailr-agents an agent framework?

No. Frameworks (LangGraph, CrewAI, AutoGen, …) provide a runtime. Skailr is an **operating model**: roles, hierarchy, contracts, channels, script gates — Claude Code / Cursor remain the runtime.

### Can I build my entire initial app with `/ship-feature`?

No. `/ship-feature` and `/yolo` produce **one** story and **one** build. For a whole app or multi-part initiative, use `/discover` → `/plan-program` → `/build-program` or `/yolo-program` — program planning cuts workstreams, then MECE features inside each; each engineering feature still runs the full feature pipeline + tickets.

### What happens if I just chat (no slash command)?

Intake routes the ask: questions → researcher; brownfield baseline → `/map-repo`; small changes → `/patch`; one feature → `/yolo`; whole app → `/yolo-program`. Slash commands always win. On an unmapped non-trivial repo, intake offers `/map-repo` first in one sentence; asks naming three-plus separable capabilities get a one-sentence `/yolo-program` confirmation. Details: [docs/INTAKE.md](docs/INTAKE.md).

### Do agents talk to each other directly?

Via markdown channels: an agent posts and ends its turn; the orchestrator routes to the addressee and re-dispatches with the answer. See [PROTOCOL.md](.claude/program/channels/PROTOCOL.md).

### What happens if a frozen contract is wrong?

The team posts `type: contract-change` to `@architect` and stops. The program-architect assesses blast radius; **you** approve before the contract updates. Teams never silently edit frozen interfaces.

### Can I add my own domain team?

Yes. Mirror a built domain team under `.claude/agents/<prefix>/`, register a sharp `route-when` in [registry.md](.claude/teams/registry.md), set `status: built`.

### Do agents clean up build caches / worktrees?

Yes, when a run finishes successfully. Programs archive live runtime first (skill `archive-program-state`), then `cleanup-scoped.mjs` purges allowlisted caches **only inside the agent's own worktree** under `.claude/worktrees/<id>/`. Shared main-checkout caches are left alone. Incomplete runs never archive or retire. See [docs/YOLO.md](docs/YOLO.md#scoped-worktree-cleanup).

### Does this work only for software engineering?

No. Engineering, content, legal, PM, design, marketing, and finance are built; new domains use the same registry + lead → workers + gate pattern.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Security reports: [SECURITY.md](SECURITY.md). Release/publishing flow (maintainers): [PUBLISH.md](PUBLISH.md).

## Trademarks

Claude Code and Anthropic are trademarks of Anthropic, PBC. Cursor is a trademark of Anysphere, Inc. This project is not affiliated with, endorsed by, or sponsored by Anthropic or Anysphere.
