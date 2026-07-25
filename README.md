# skailr-agents

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-compatible-blue)](https://docs.anthropic.com/en/docs/claude-code)
[![Cursor](https://img.shields.io/badge/Cursor-compatible-black)](https://cursor.com/docs)

**A multi-agent operating model for Claude Code and Cursor**, not an agent framework or a hosted runtime. skailr-agents is an open-source prompt pack that structures AI coding agents like a real project organization: planning before build, role-separated teams, progressive context disclosure, a visible markdown message board, and frozen contracts so parallel workstreams can ship without colliding.

Install it into a repo. Claude Code or Cursor runs the agents. You get hierarchy, division of labor, and change control that out-of-the-box single-agent chat does not provide.

| You have… | Start with… |
|---|---|
| One feature, clear enough to ship | Workstream tier: `/ship-feature` → `/build-feature` |
| A large, ambiguous, multi-part initiative | Program tier: `/discover` → `/plan-program` → `/build-program` |

---

## Why this exists

Single agents are asked to plan, architect, build, test, and validate in one pass. Models have gotten better at that, and “ok” results are common, but large projects still fail the same way large human projects fail: unclear scope, overlapping ownership, silent interface drift, and coordination buried in one long chat.

skailr-agents applies how real organizations run delivery:

1. **Plan first:** deconstruct the work before anyone builds.
2. **Specialize:** each agent has one job (research, story, architecture, backend, frontend, verify, validate, document).
3. **Disclose context just in time:** agents and domain teams load only when needed, so context stays lean.
4. **Coordinate in the open:** questions and blockers go on an append-only markdown channel, not a private chat thread.
5. **Freeze interfaces:** downstream teams build against frozen contracts (and stubs) in parallel; changing a contract requires explicit human approval.

If your agents are failing on large work, the model may not be the problem. **The operating model** might be.

---

## What this is (and is not)

**What this is**

- An **agent operating model** expressed as markdown: agent definitions, slash commands, a team registry, channel protocol, and install scripts
- Compatible with **Claude Code** (authoritative `.claude/` tree) and **Cursor** (generated `.cursor/` mirror)
- A two-tier system: **program** (VP-level discovery + decomposition + parallel teams) and **workstream** (feature pipeline)

**What this is not**

- Not a hosted SaaS, model API, or orchestration runtime. Claude Code or Cursor executes the prompts.
- Not LangGraph / CrewAI / AutoGen. Those are frameworks with code APIs; this is org design as prompts and conventions.
- Not a replacement for human judgment. Discovery, plan approval, and contract changes still gate on you.

**Claude Code vs Cursor.** `.claude/` is the source of truth (agents under `.claude/agents/`, commands under `.claude/commands/`, registry at `.claude/teams/registry.md`). `.cursor/` mirrors agents as requestable rules and commands as `.cursor/commands/`. Edit `.claude/` first, then run `./scripts/remirror.sh`.

---

## Five capabilities that make it different

| Capability | What it means |
|---|---|
| **Hierarchy of agents** | A planning layer deconstructs work before build; then project teams execute. Program: `/discover` → `/plan-program` → `/build-program`. Feature: `/ship-feature` → `/build-feature`. |
| **Division of labor** | Domain and role-specific agents with a single job (researcher, story-writer, architect, backend/frontend/data engineers, verifiers, validators, documenter), plus a content team for written deliverables. |
| **Progressive disclosure of context** | Three tiers: thin team registry → team lead → workers and heavy domain refs. A pure-engineering program never loads content/marketing/finance tokens. |
| **Agent message board** | Append-only markdown channels (`.claude/program/channels/`). Agents post typed messages and end their turn; the orchestrator routes replies. Coordination is auditable, not buried in chat. |
| **Frozen contracts** | Cross-team seams freeze after plan approval. Downstream builds against stubs in parallel. Only the program-architect may change a frozen contract, and only after you approve the blast radius. |

---

## Quick start

```bash
git clone https://github.com/ns-3e/skailr-agents.git
cd skailr-agents
./install.sh /path/to/your-project
```

Windows (PowerShell):

```powershell
git clone https://github.com/ns-3e/skailr-agents.git
cd skailr-agents
.\install.ps1 -TargetPath C:\path\to\your-project
```

Flags: `--claude-only` / `-ClaudeOnly`, `--cursor-only` / `-CursorOnly`.

### Ship one feature

```
/ship-feature Users should get an email reminder 3 days before an invoice is due
```

Runs researcher → story-writer, then stops for your approval. Approve the story, then the architect runs and stops again for spec approval.

```
/build-feature
```

Runs the rest unattended: backend and frontend engineers in parallel → E2E verification → adversarial validation → documentation.

### Run a large program

```
/discover <long description of the initiative>
```

Clarifying questions until you confirm a shared brief (`brief.md`).

```
/plan-program
```

Workstreams, shared kernel, frozen contracts, dependency DAG. Approve to freeze contracts.

```
/build-program
```

Foundation (build + freeze kernel) → parallel workstream teams → integration → program validation → release docs.

---

## Program tier (large initiatives)

When a request is long, ambiguous, or too big for one team, the program tier runs first, like a VP overseeing simultaneous project teams.

### How conflict is designed out, not managed

- **Spatial (two teams, same file):** ownership must be disjoint; shared paths belong in the frozen kernel.
- **Temporal (Team B needs Team A's output):** contract-first. A freezes an interface; B builds against a stub in parallel; they integrate at the end.
- **Change control:** only the program-architect changes a frozen contract, and only after your approval. That is the one move that can cascade a wrong assumption across teams.

### Program roles

| Agent | Writes code? | Purpose |
|---|---|---|
| program-architect | No | Discovery; decomposition; owns all cross-team contracts |
| integration-verifier | Tests only | Proves independently-built workstreams compose (real against real) |
| program-validator | No | Final sign-off of the whole delivery against the original brief |
| program-documenter | Docs only | Changelog, API refs, runbooks from the diff, not the plan |

Persistent state lives in `.claude/program/` (`brief.md`, `plan.md`, `contracts/`, `ledger.md`) so long-horizon programs resume across sessions.

### Channels: the agent message board

Agents coordinate through an append-only board at `.claude/program/channels/` (`.claude/tmp/channels/` for a single feature). It is a **board, not a chat**: agents run to completion and cannot wait for a live reply.

- A blocked agent posts one typed message (`question`, `blocker`, `contract-change`, `heads-up`…), addresses `@agent` / `@team` / `@architect` / `@human`, and **ends its turn**.
- The orchestrator is the **router**: it scans `status: open` messages, dispatches the addressee with that thread, and re-dispatches the blocked agent with the answer.
- `@human` and `contract-change` messages **halt** for you; unrelated workstreams keep running.

Posting discipline: post only when blocked or when another team must know something decision-relevant. Never negotiate a contract in the channel; flag `@architect` and stop. Full protocol: [`.claude/program/channels/PROTOCOL.md`](.claude/program/channels/PROTOCOL.md). Seeded example: [`program.md`](.claude/program/channels/program.md).

### Documentation as a pipeline phase

`program-documenter` runs after validation. It documents the **diff**, not the plan; writes for a named reader; and supports **create** and **reconcile** modes so docs stay current. Engineers can leave `DOC:` anchors; the documenter harvests them.

---

## Domain teams and just-in-time disclosure

The program tier is domain-agnostic. Engineering is one team; content, design, marketing, and finance plug in as siblings under the same program-architect.

**Built today:** engineering (`/ship-feature` / `/build-feature`) and **content**. Design, marketing, and finance are listed in the [registry](.claude/teams/registry.md) as stubs (`status: not built`).

Disclosure happens in three tiers so unused teams cost almost nothing:

1. **Tier 1: registry** (`.claude/teams/registry.md`, always loaded, ~5 lines/team): name, capability, `route-when`. The only team file the architect reads to route.
2. **Tier 2: team lead**, loaded only when a workstream routes to that team.
3. **Tier 3: workers + domain reference**, loaded only as the lead dispatches them.

| Team | Owns (boundary unit) | Verifier means |
|---|---|---|
| engineering | files / directories | behavior proven by tests |
| content | content pieces / sections | facts sourced + brand voice + human prose |
| design | assets / artboards | accessibility + design-system conformance |
| marketing | channels / segments | message + measurement alignment |
| finance | worksheets / models | numbers reconcile + assumptions traced |

Cross-domain handoffs use the same frozen-contract mechanism as code seams (e.g. engineering delivers feature X → content announces it → design lays it out → marketing distributes it).

### Content team (reference domain implementation)

- `content-lead`: brief, disjoint pieces, fact + brand gates
- `content-strategist`: angle and structure
- `content-writer`: one owned piece, grounded in named sources
- `content-editor`: fact audit + brand + AI-tell sweep

Prime directive: **never ship a false claim, never ship generic AI prose.**

To add a domain: create `.claude/agents/<prefix>/`, add a sharp `route-when` registry entry, flip `status` to built. The program tier does not need to change.

---

## Workstream tier (feature pipeline)

One feature request in, a validated implementation out, with two human gates where mistakes are cheapest. Program workstreams run this internally; you can also run it standalone.

**Path:** researcher → story-writer → architect → backend + frontend engineers (optional `data-engineer`) → e2e-verifier → validator → program-documenter.

| Agent | Writes code? | Scope | Purpose |
|---|---|---|---|
| researcher | No | Read-only | Maps what exists so nothing downstream hallucinates |
| story-writer | Story doc | n/a | Testable acceptance criteria |
| architect | Spec doc | n/a | Data model, API contract, disjoint work split |
| backend-engineer | Yes | Backend globs only | Migrations, services, handlers, unit tests |
| frontend-engineer | Yes | Frontend globs only | Components, state, API client, UI states |
| data-engineer | Yes | Data-layer globs only | ETL/ELT, schemas, indexing (optional) |
| e2e-verifier | Tests only | Test files | Proves the feature from the user's perspective |
| validator | No | Read-only | Catches misses, skips, and security gaps |

**Why boundaries matter.** The engineers do not negotiate mid-build. The spec's API contract is the seam. Ownership globs must be disjoint; the orchestrator checks before dispatch, and each engineer verifies `git diff --name-only` before reporting.

**Gates.** After the story (cheap requirement fix). After the spec (cheap data-model fix). Everything after the approved spec runs unattended.

---

## Install details

The installer copies `.claude/` and `.cursor/` into your project, creates `.claude/tmp/` and `.claude/program/`, and appends ignore rules if missing. Idempotent and safe to re-run; it never strips unrelated `.gitignore` lines or foreign Cursor rules.

```bash
./install.sh /path/to/your-project
```

Manual (Claude Code only):

```bash
cp -r .claude /path/to/your-repo/
mkdir -p /path/to/your-repo/.claude/tmp /path/to/your-repo/.claude/program
```

Commit `.claude/agents/`, `.claude/commands/`, `.claude/teams/`, and tracked channel templates under `.claude/program/channels/`. Ignore runtime state under `.claude/tmp/` and most of `.claude/program/` (see `.gitignore`). Inventory: [`manifest.json`](manifest.json). License: [MIT](LICENSE).

---

## Tuning

- Swap `model:` in agent frontmatter. Researcher and story-writer often fine on Sonnet; architect, engineers, and validator benefit from Opus.
- Add repo-specific conventions to each agent's Standards section.
- If your repo does not split into backend/frontend, redefine engineers along your real seam. The pattern is **disjoint ownership**, not the names.
- Back boundaries with CI that fails PRs whose backend commits touch frontend paths. Prompt scoping is a strong convention, not a hard sandbox.

---

## FAQ

### Is skailr-agents an agent framework?

No. An agent framework (LangGraph, CrewAI, AutoGen, etc.) provides a runtime and APIs that execute agents. skailr-agents is an **agent operating model**: roles, hierarchy, contracts, and communication rules delivered as markdown for Claude Code and Cursor to run.

### How is this different from built-in Cursor or Claude Code agents?

Those tools give you powerful agents and chat. This pack adds **org structure on top**: planning before build, single-job roles, just-in-time context, a shared message board, and frozen cross-team contracts with human change control.

### When should I use `/ship-feature` vs `/discover`?

Use `/ship-feature` for one cohesive feature. Use `/discover` when the ask is large, ambiguous, or spans multiple teams/domains that must not collide.

### Do agents talk to each other directly?

They appear to, via markdown channels. Mechanism: an agent posts and ends its turn; the **orchestrator** routes the thread to the addressee and re-dispatches the blocked agent with the answer. See [PROTOCOL.md](.claude/program/channels/PROTOCOL.md).

### What happens if a frozen contract is wrong?

The team posts `type: contract-change` to `@architect` and stops. The program-architect assesses blast radius; **you** approve before the contract updates and affected teams re-sync. Teams never silently edit frozen interfaces.

### Can I add my own domain team (design, marketing, finance)?

Yes. Mirror the content-team shape under `.claude/agents/<prefix>/`, register a sharp `route-when` in [`.claude/teams/registry.md`](.claude/teams/registry.md), and set `status: built`. Unused teams stay unloaded.

### Does this work only for software engineering?

No. The program tier is domain-agnostic. Engineering and content are built; other domains use the same frozen-contract and registry pattern.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Security reports: [SECURITY.md](SECURITY.md).

## Trademarks

Claude Code and Anthropic are trademarks of Anthropic, PBC. Cursor is a trademark of Anysphere, Inc. This project is not affiliated with, endorsed by, or sponsored by Anthropic or Anysphere.
