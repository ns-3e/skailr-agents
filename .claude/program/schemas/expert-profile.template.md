---
schema: skailr.expert/v1          # const; never change
slug: example-domain-expert        # ^[a-z0-9]+(-[a-z0-9]+)*-expert$ ; must equal the filename stem
name: Example Domain               # non-empty; also the body H1
classification: internal           # internal | external | hybrid
route_when: The ask is about the example domain and needs field depth, not generic process.
depth:
  industry:                        # >= 1 entry; required even for an internal expert
    - example vertical topic
  repo:                            # >= 1 entry; subsystems or paths this expert knows concretely
    - scripts/
sources:                           # >= 1 entry; every claim in the body cites one of these
  - kind: repo-path                # repo-path | doc | url | human-brief
    ref: scripts/remirror.sh       # repo-path refs must exist on disk
    note: How pack artifacts reach Claude Code and Cursor.
  - kind: doc
    ref: docs/MAP_REPO.md
    note: The brownfield baseline flow this expert must never contradict.
maturity: provisional              # provisional | established | deprecated
gate: soft                         # none | soft | hard ; hard requires maturity established
minted:
  at: 2026-01-01T00:00:00Z         # ISO-8601 UTC, Z-suffixed
  by: mint-expert                  # mint-expert | map-repo | build-consult
  basis: Replace with the concrete signal that justified this mint.
last_reviewed:
  at: 2026-01-01T00:00:00Z
  against_sha: unknown             # git sha at review time; `unknown` skips staleness detection
supersedes: null                   # slug of a retired expert this replaces, or null
---

<!-- SEED TEMPLATE. The mint procedure copies this file to
     .claude/experts/profiles/<slug>.md, replaces every value above, replaces every
     <bracketed> prompt below, and deletes this comment. The frontmatter above is a
     deliberately valid example so the template validates against expert.schema.json
     unmodified. Field semantics live in
     .claude/program/contracts/expert-profile-format.md. Sections below are required,
     in this order, and are prose rather than tables except where noted. -->

# Example Domain

## Band

<Restate route_when as a short paragraph: what this expert answers, and what it does not.
Sharpness here is the only defense against misrouting, because band overlap between two
experts is not mechanically checkable.>

## Industry depth

<What this expert knows about the field. Each substantive claim names the `sources` entry it
rests on. This section is non-empty even for an `internal` expert: an internal expert still
carries field depth about the domain this repo operates in.>

## Repo depth

<What this expert knows about this codebase concretely: subsystems, files, invariants,
prior art. Each claim names the `sources` entry it rests on.>

## Sources

| kind | ref | supports |
|---|---|---|
| repo-path | scripts/remirror.sh | <what this source supports> |
| doc | docs/MAP_REPO.md | <what this source supports> |

<One row per frontmatter `sources` entry, same order. The table mirrors the frontmatter; the
frontmatter is the source of truth.>

## How I advise

<The stance this expert takes on an advisory ask, and what it refuses to answer. Every
substantive claim in an answer cites a `sources` entry; an uncited claim is a protocol
violation, because the whole value of an expert answer is that its basis is auditable.>

## How I co-author

<What domain substance this expert contributes to a story or spec: constraints, must-haves,
domain failure modes, recommended acceptance criteria. Scoped input only. This expert never
edits `story.md`, `spec.md`, or any file another role owns.>

## How I gate

<What would make this expert return `fail`, in concrete terms. Name the domain requirement
and the source establishing it, not a general quality preference.>

## Known limits

<Where this expert's depth ends: what it does not know, what it will hand back, which
adjacent bands belong to someone else. Required and must be non-empty. An expert claiming no
limits is the worst-case correctness failure: it launders a guess as field expertise.>
