# Agent Channels — Protocol

The channels are how agents raise something that a frozen contract cannot encode: a
mid-build discovery that something is ambiguous, wrong, or needs another team's input.
They are a **message board**, not a chat room. Agents post typed, structured messages and
read replies; they do not hold a live conversation.

## The mechanism (read this first — it is not Slack)

An agent is a run-to-completion invocation. It cannot pause mid-execution and wait for
another agent to reply. So "await a response" is not literal. Instead:

1. An agent that is **blocked** on another team posts a `question` (or `blocker`) to a
   channel and **ends its turn**. It does not spin, and it does not guess the answer.
2. The **orchestrator** (the build command) is the router. After each work step it scans
   the channels for open messages, dispatches each addressee with just that thread as
   context, collects the reply, and then **re-dispatches the blocked agent** with the
   answer now in context so it resumes.
3. Peer-to-peer in appearance; orchestrator-mediated in mechanism.

This channel **subsumes** the older dedicated mechanisms: team blockers and
contract-change requests are now just typed messages here (`type: blocker` and
`type: contract-change`). There is one place to look and one router to run.

## Files

Under `.claude/program/channels/` (or `.claude/tmp/channels/` for a single-feature run):

- `program.md` — program-wide: announcements, contract-change requests, escalations to
  the architect or human, anything crossing two or more workstreams.
- `ws-<name>.md` — one per workstream, for messages local to that team.

All channels are **append-only**. Never edit or delete a prior message. Status changes
are made by appending a new message that references the original, or by updating only the
`status:` line of the referenced message (the one permitted in-place edit).

## Message format

Every post is one fenced block with a header and a body, separated by `---`:

```
### MSG-<zero-padded-seq>
from: <agent-name> (<workstream or "program">)
to: @<agent-name> | @<team> | @architect | @human | @all
type: question | answer | decision | heads-up | blocker | contract-change | ack
re: MSG-<seq>            # omit if this starts a thread
status: open | answered | resolved | blocked-on-human
---
<body: one clear point. A question states exactly what is blocking and what a usable
answer looks like. An answer resolves it unambiguously. Keep it short.>
```

Rules:
- `MSG-<seq>` is globally unique across all channel files, monotonically increasing.
  Before posting, scan all channels for the highest existing seq and use the next.
- A reply always sets `re:` to its parent and repeats the thread until `resolved`.
- Posting an `answer` or `decision` that closes a thread: also append an in-place edit
  flipping the parent's `status:` to `answered`/`resolved`.

## Addressing

- `@<agent-name>` — a specific role (e.g. `@architect`, `@data-engineer`).
- `@<team>` — the team's lead fields it (e.g. `@content` → content-lead).
- `@architect` — the program-architect. **Required** for anything touching a frozen
  contract (`type: contract-change`).
- `@human` — halts the pipeline for the user. Used for contract changes (which always
  need human approval) and genuine judgment calls no agent should make alone.
- `@all` — a program-wide `heads-up` or `announcement`; informational, not a question.

## Posting discipline — the rule that keeps this from becoming a talk-shop

The coordination this system relies on happens at **planning** time, in frozen contracts.
The channel is the narrow exception for what contracts cannot cover. Therefore:

- **Post only when blocked, or when you have a decision-relevant heads-up another team
  genuinely must know.** Not to chat, agree, socialize, narrate progress, or think out
  loud.
- **If you can proceed without the answer, proceed** and post a `heads-up` rather than a
  blocking `question`. Prefer building against the frozen contract with a stated
  assumption over stopping to ask.
- **One point per message.** No threads-of-consciousness.
- **Never negotiate a contract in the channel.** If a frozen contract seems wrong, post
  one `contract-change` to `@architect` stating the problem and stop; do not propose,
  debate, or agree on a new shape with a peer. Only the architect (with human approval)
  changes a contract.
- **Answer precisely.** An `answer` that is itself ambiguous just creates another round.
- **Do not @-mention a peer to hand them work.** Work is assigned by the plan, not by
  messages. The channel resolves questions; it does not re-route tasks.

Every agent operates under this discipline. A channel full of chatter is a failure state
— it means agents are coordinating at build time what should have been a contract.

## What the orchestrator does with the channel (router loop)

At each checkpoint (after a concurrency group, after each engineer step, etc.):

1. Scan every channel file for messages with `status: open`.
2. For each, in seq order:
   - If `to: @human` or `type: contract-change` → **halt**, surface the thread to the
     user, and wait. Do not auto-resolve.
   - Else dispatch the addressee (a `@team` routes to its lead) with **only that thread**
     as context. It appends a typed `answer`/`decision` and flips the parent's status.
   - If the answer unblocks a waiting agent, re-dispatch that agent with the resolved
     thread in context so it resumes its work.
3. Repeat until no `open` messages remain that can be resolved without the human.
4. A message left `blocked-on-human` pauses only the threads that depend on it; unrelated
   workstreams continue.

## The end artifact

Because every channel is append-only and every cross-team interaction flows through it,
`.claude/program/channels/` is a complete, readable transcript of who asked what, who
answered, what was decided, and what went to the human — the auditable record of how the
program actually coordinated. That transcript is a deliverable, not scratch: the
program-documenter and program-validator both read it.
