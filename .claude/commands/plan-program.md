---
description: Decompose a confirmed brief into parallel workstreams, a shared kernel, frozen contracts, and an execution DAG
allowed-tools: Task, Read, Write, Bash
---

You are the Program Orchestrator, at the planning stage. The brief is confirmed; now turn it into an executable program of parallel teams.

## Preflight

Confirm `.claude/program/brief.md` exists and was user-confirmed. If it does not, stop and direct the user to run `/discover` first.

## Decomposition

Invoke the `program-architect` subagent to run **Job 2 (Decomposition)**. It reads `brief.md` and produces: the shared kernel definition, the workstreams, the ownership map, the frozen contracts (written to `.claude/program/contracts/`), and the dependency DAG — all written to `.claude/program/plan.md`.

## Verify the plan yourself before showing the user

Do not relay a plan you have not checked. Confirm all of the following, and send the plan back to the architect to fix any that fail:

1. **Ownership is provably disjoint.** Build the union of all workstream ownership globs and confirm no path is claimed by two workstreams. Any shared path must belong to the kernel, not to a workstream. Write `.claude/program/ownership.json` (`skailr.ownership/v1`) and run `node scripts/skailr/check-ownership.mjs --map .claude/program/ownership.json` — non-zero exit fails the plan.
2. **Every cross-workstream seam has a complete contract** in `contracts/` (use schema template frontmatter `skailr.contract/v1`) — exact shapes, types, errors, semantics. Prefer OpenAPI/JSON Schema sidecars for machine checks. A workstream that consumes a contract that does not exist or is underspecified is a blocker. Run `node scripts/skailr/check-contracts.mjs`.
3. **The DAG is acyclic** and every workstream's depends-on list references real contracts. Concurrency groups are explicit.
4. **Every brief item maps to at least one workstream or the kernel.** Nothing the user asked for is unowned.
5. **Hard-sequenced dependencies are justified.** For each place one team must fully finish before another starts (rather than building against a stub in parallel), confirm the architect explained why a stub was not possible. Excessive sequencing is a decomposition smell.

## GATE — user approval of the program plan

Present to the user:
- The workstream list with each team's goal and ownership scope
- The shared kernel and what it contains
- The contracts index and the dependency DAG (foundation → concurrency groups → integration)
- Any hard-sequenced dependencies, called out explicitly
- Confirmation that ownership is disjoint

Then:

**"Approve this program plan to freeze the contracts and begin the build, or tell me what to change. Once approved, contracts are frozen and only the program-architect can change them. Run `/build-program` when it's right."**

End your turn. Do not start the build. On approval, follow skill `freeze-contract`: set contract status to `frozen`, seed `.claude/program/ledger.md` from `.claude/program/schemas/ledger.template.md`, record each contract version and workstream starting phase, keep `ownership.json` current, run `check-contracts` + `check-ownership` again.