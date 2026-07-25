# skailr-agents

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-compatible-blue)](https://docs.anthropic.com/en/docs/claude-code)
[![Cursor](https://img.shields.io/badge/Cursor-compatible-black)](https://cursor.com/docs)

A two-tier, role-separated **agent prompt pack** for **Claude Code** and **Cursor**: a VP-level **program tier** that discovers and decomposes large initiatives into parallel teams, and a **workstream tier** — the feature pipeline (researcher → story → architect → parallel engineers → E2E → validator → documenter, with optional `data-engineer`) — that each team runs to build its slice.

**What this is:** markdown agent/command definitions, a team registry, an install script, and a Cursor mirror. You clone it and install into a project.

**What this is not:** a hosted SaaS, a model API, or a runtime that executes agents by itself — Claude Code or Cursor runs the prompts.

**Claude Code vs Cursor.** `.claude/` is the authoritative source (agents under `.claude/agents/`, slash commands under `.claude/commands/`, team registry at `.claude/teams/registry.md`). `.cursor/` is a generated mirror: agents become agent-requestable rules in `.cursor/rules/`, commands become `.cursor/commands/`. Edit `.claude/` first, then run `./scripts/remirror.sh`.

Small feature → use the workstream tier directly (`/ship-feature`). Large, ambiguous, multi-part initiative → start at the program tier (`/discover`), which fans out into multiple workstream teams running concurrently.

---

## Program tier (for large initiatives)

When a request is long, ambiguous, or too big for one team, the program tier runs first. It mirrors a VP overseeing simultaneous project teams.

```
/discover <long description>
```
The **program-architect** runs a real clarifying-question loop with you until the intent is a confirmed, shared understanding, written to `brief.md`. Gated on your confirmation.

```
/plan-program
```
The architect decomposes the brief into disjoint **workstreams**, a shared **kernel** (built once, then frozen and read-only to all teams), and the **frozen contracts** that form the seams between teams — plus a dependency DAG. Gated on your approval. On approval, contracts freeze.

```
/build-program
```
Executes the DAG unattended: **foundation** (build + freeze the kernel) → **parallel workstreams** (every team in a concurrency group dispatched at once, each running the workstream pipeline against frozen contracts and stubs) → **integration** (real-against-real seam tests) → **program validation** (the whole delivery against the original brief).

### How conflict is designed out, not managed

- **Spatial (two teams, same file):** decomposition *must* produce disjoint file ownership; the orchestrator verifies it before dispatching. A file two teams both need belongs in the frozen kernel, owned by no team.
- **Temporal (Team B needs Team A's upstream):** contract-first. Team A publishes and freezes its interface; Team B builds against that contract with a stub, in parallel; they integrate at the end. Hard sequencing only when an upstream genuinely can't be stubbed.
- **Change control:** once frozen, only the program-architect can change a contract, and a contract change halts for your approval before propagating — because that's the one move that can cascade a wrong assumption across parallel teams.

### Program roles

| Agent | Writes code? | Purpose |
|---|---|---|
| program-architect | No | Discovery loop; decomposition; owns and controls all cross-team contracts |
| integration-verifier | Tests only | Proves independently-built workstreams compose — real against real, no stubs |
| program-validator | No | Final sign-off of the whole delivery against the original brief |
| program-documenter | Docs only | Durable release docs — changelog, API refs, runbooks — from the diff, not the plan; create + reconcile modes |

Persistent state lives in `.claude/program/` — `brief.md`, `plan.md`, `contracts/`, `ledger.md` — so a long-horizon program resumes cleanly across sessions.

### Channels — the agent message board

Agents coordinate mid-build through an append-only message board at `.claude/program/channels/` (`.claude/tmp/channels/` for a single feature). It's a Slack-like transcript in markdown — but it's a **board, not a chat**, because agents run to completion and can't wait for a live reply. The mechanism:

- A blocked agent posts one typed message (`question`, `blocker`, `contract-change`, `heads-up`…), addressed with `@agent`/`@team`/`@architect`/`@human`, and **ends its turn**.
- The orchestrator is the **router**: after each work step it scans for `status: open` messages, dispatches the addressee with just that thread, collects the answer, and **re-dispatches the blocked agent** with it in context so it resumes. Peer-to-peer in appearance, orchestrator-mediated in mechanism.
- `@human` and `contract-change` messages **halt** for you; unrelated workstreams keep running.

This **subsumes** the old per-team blocker files and the contract-change-requests directory — both are now typed channel messages, so there's one place to look and one router to run.

The **posting discipline** is what keeps it from becoming a talk-shop: post only when genuinely blocked or with a heads-up another team must know; never to chat, agree, or narrate; and never negotiate a contract in the channel — flag it to `@architect` and stop. Coordination is supposed to live in frozen contracts at planning time; the channel is the narrow exception for what contracts can't encode. A channel full of chatter is a failure signal.

Because it's append-only and every cross-team interaction flows through it, the channel is a **deliverable** — a complete audit trail of who asked what, what was decided, and what went to the human. The documenter and validator both read it. Full format and router spec: [`.claude/program/channels/PROTOCOL.md`](.claude/program/channels/PROTOCOL.md). The seeded [`program.md`](.claude/program/channels/program.md) file is a worked example you can delete once your own program is running.

### Documentation

Release documentation is a standard phase of both pipelines, not a separate errand. The `program-documenter` runs after validation (Phase E of `/build-program`, Phase 7 of `/build-feature`) and owns durable, outward-facing docs: changelog, API references, README/architecture/runbook/user-guide updates.

It sits at the program tier because documentation is synthesis — it needs the whole delivered picture, which only exists after integration. Its two rules mirror the rest of the system:

- **Document the diff, not the plan.** It reads the actual diff and the frozen contracts, not the aspirational brief. A drift between what was promised and what shipped becomes a *finding*, not silently-wrong docs. This is the doc analog of the validators' "diff wins over reports."
- **Write for a named reader, not for completeness.** Comprehensive-but-lifeless docs nobody reads are a failure. Every document serves a specific reader — the integrating developer, the 3am operator, the user doing one task.

It has two modes: **create** (new docs for what shipped) and **reconcile** (read the diff, find exactly the docs a change made stale, fix only those). Reconcile is where docs usually rot — running it on every change keeps documentation current automatically instead of as a discipline someone must remember.

The light-touch complement: backend/frontend/data engineers leave **doc-anchors** — structured `DOC:` comments at the source marking things the release docs will need. The documenter harvests these rather than reverse-engineering intent, so an accurate breadcrumb from whoever owned the file beats a guess from a distant agent.

---

## Domain teams and just-in-time disclosure

Engineering is one team. The program tier is domain-agnostic — "break a big ambiguous ask into parallel teams that don't collide, with defined handoffs" is how any line of business runs — so other domains plug in as sibling teams under the same program-architect: content, design, marketing, finance.

**Built today:** engineering (via `/ship-feature` / `/build-feature`) and **content**. Design, marketing, and finance appear in the [registry](.claude/teams/registry.md) as stubs (`status: not built`) so routing shape is visible without shipping unfinished agents.

The cost of having many teams is not paid unless they're used, because disclosure happens in three tiers:

- **Tier 1 — the registry** (`.claude/teams/registry.md`, always loaded, ~5 lines/team): team name, capability, and a sharp `route-when` trigger. This is the *only* team-level file the architect reads to route a workstream. Adding a tenth team doesn't grow the architect's context.
- **Tier 2 — the team lead** (loaded only when a workstream routes to that team): plans the domain workstream and knows its own workers.
- **Tier 3 — workers + domain reference** (loaded only as the lead dispatches): the worker agents plus heavy reference (brand guidelines, design system, model conventions), themselves pulled via pointers the way skills load their reference files.

A pure-engineering program never loads a content, design, marketing, or finance token. A content workstream never loads finance. The system scales to ten domains with a context footprint that stays flat.

### How a domain team mirrors engineering

Every team, whatever the domain, has the same shape — a lead that plans, workers scoped to **disjoint owned units**, a verifier, and a validator against the workstream's contracts. What differs is the boundary unit and what the verifier means:

| Team | owns (boundary unit) | verifier means |
|---|---|---|
| engineering | files / directories | behavior proven by tests |
| content | content pieces / sections | facts sourced + brand voice + human prose |
| design | assets / artboards | accessibility + design-system conformance |
| marketing | channels / segments | message + measurement alignment |
| finance | worksheets / models | numbers reconcile + assumptions traced |

Cross-domain handoffs use the same frozen-contract mechanism as code seams: "engineering delivers feature X to spec" → "content announces feature X" → "design lays out the announcement" → "marketing distributes it" is a contract chain the architect builds into the DAG, so a full product-launch program runs as one coordinated effort.

### The content team (built, as the reference implementation)

`.claude/agents/content/`:
- `content-lead` — writes the content brief, splits into disjoint pieces, owns the fact + brand gates
- `content-strategist` — angle and structure before drafting (the story-writer analog)
- `content-writer` — drafts one owned piece, grounded in named sources, in brand voice
- `content-editor` — read-only fact audit + brand + AI-tell sweep (the verifier/validator analog)

Its prime directive is the content version of correctness: **never ship a false claim, never ship generic AI prose.** Pair with your own brand-voice or humanizer skills if you have them — they are not bundled in this package.

### Adding another domain team

1. Create `.claude/agents/<prefix>/` with a lead and workers in the same shape.
2. Add a registry entry with a sharp `route-when` line and flip its status to built.
3. Nothing in the program tier changes — the architect routes off the registry, and the team loads only when a workstream needs it.

---

## Workstream tier (the feature pipeline)

One feature request in, a validated implementation out — with two human approval gates where mistakes are cheapest. Each program workstream runs this internally; you can also run it directly for a standalone feature. Core path: researcher → story-writer → architect → backend + frontend engineers → e2e-verifier → validator → program-documenter. Optional: `data-engineer` for data-heavy slices.

## Quick start

```bash
git clone https://github.com/YOUR_ORG/skailr-agents.git
cd skailr-agents
./install.sh /path/to/your-project
```

On Windows (PowerShell):

```powershell
git clone https://github.com/YOUR_ORG/skailr-agents.git
cd skailr-agents
.\install.ps1 -TargetPath C:\path\to\your-project
```

Replace `YOUR_ORG` with the GitHub user or organization that hosts this repo. Flags: `--claude-only` / `-ClaudeOnly`, `--cursor-only` / `-CursorOnly`.

## Install

The installer copies `.claude/` (agents, commands, teams, channel templates) and `.cursor/` (rules + commands mirror) into your project, creates `.claude/tmp/` and `.claude/program/`, and appends ignore rules if missing. It is idempotent — safe to re-run; it never strips unrelated `.gitignore` lines or foreign Cursor rules.

```bash
./install.sh /path/to/your-project
```

Manual alternative (Claude Code only):

```bash
cp -r .claude /path/to/your-repo/
mkdir -p /path/to/your-repo/.claude/tmp /path/to/your-repo/.claude/program
```

Commit `.claude/agents/`, `.claude/commands/`, `.claude/teams/`, and the tracked channel templates under `.claude/program/channels/` — the prompts are versioned artifacts and should evolve with the repo. Ignore runtime state under `.claude/tmp/` and most of `.claude/program/` (see `.gitignore`). Full inventory: [`manifest.json`](manifest.json). License: [MIT](LICENSE).

## Usage

```
/ship-feature Users should get an email reminder 3 days before an invoice is due
```

Runs researcher → story-writer, then stops for your approval. Approve, and it runs the architect and stops again for spec approval.

```
/build-feature
```

Runs the rest unattended: backend and frontend engineers in parallel, then E2E verification, then adversarial validation.

## The roles

| Agent | Writes code? | Scope | Purpose |
|---|---|---|---|
| researcher | No | Read-only | Maps what actually exists so nothing downstream hallucinates |
| story-writer | Story doc | — | Turns a rough ask into testable acceptance criteria |
| architect | Spec doc | — | Defines the data model, API contract, and the disjoint work split |
| backend-engineer | Yes | Backend globs only | Migrations, services, handlers, unit tests |
| frontend-engineer | Yes | Frontend globs only | Components, state, API client, UI states |
| e2e-verifier | Tests only | Test files | Proves the feature works from the user's perspective |
| validator | No | Read-only | Catches what was missed, skipped, or left insecure |
| data-engineer | Yes | Data-layer globs only | ETL/ELT, schemas, indexing, query optimization, data security — optional, for data-heavy features |

## Why the boundaries matter

The two engineers never communicate. The spec's API contract is the only seam between them, which is why the architect's contract must be fully specified — exact field names, types, and error shapes. That constraint is what makes the parallel build safe.

The ownership globs must be provably disjoint. The orchestrator checks this before dispatching, and each engineer verifies its own `git diff --name-only` before reporting. If both agents can write the same file, you have a race, not a pipeline.

## Where the gates are

- **After the story** — a misunderstood requirement caught here costs one message
- **After the spec** — a wrong data model caught here costs one message; caught after the build it costs the build

Everything after the spec runs unattended because it is constrained to a document you already approved.

## Tuning

- Swap `model:` in any agent's frontmatter. Researcher and story-writer run fine on Sonnet; architect, engineers, and validator benefit from Opus.
- Add repo-specific conventions to each agent's Standards section rather than repeating them in every prompt.
- If your repo does not split cleanly into backend and frontend, redefine the two engineer agents along whatever seam your codebase actually has — the pattern is disjoint ownership, not the specific names.
- Back the boundary rule with a CI check that fails a PR whose backend commits touch frontend paths. Prompt-level scoping is a strong convention, not a hard sandbox.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Security reports: [SECURITY.md](SECURITY.md).

## Trademarks

Claude Code and Anthropic are trademarks of Anthropic, PBC. Cursor is a trademark of Anysphere, Inc. This project is not affiliated with, endorsed by, or sponsored by Anthropic or Anysphere.
