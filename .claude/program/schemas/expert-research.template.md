---
schema: skailr.expert-research/v1  # const; never change
slug: example-domain-expert         # the expert this research authorizes; ^...-expert$
topic: <the vertical or field researched>
researched:
  at: 2026-01-01T00:00:00Z          # ISO-8601 UTC, Z-suffixed
  by: expert-scout                  # the only pack role with web tooling
  mode: web                         # web | human-brief  (see Degradation below)
depth_proposed:
  industry:                         # >= 1 ; lifts straight into the profile's depth.industry
    - <field topic>
  repo:                             # >= 1 ; lifts straight into the profile's depth.repo
    - <subsystem or path>
recommendation: mint-external       # mint-external | mint-hybrid | do-not-mint
---

<!-- SEED TEMPLATE for .claude/experts/research/<slug>.md.

     This artifact is the precondition for minting an `external` or `hybrid` expert. Mint
     step 2 dispatches `expert-scout`, confirms this file exists, and REFUSES to mint without
     it. A shallow profile labeled `external` launders a guess as field expertise, which is
     worse than no expert at all.

     No frozen contract fixes this shape in v1: `expert-validation-gate` rule 13 checks
     existence only. This template is the kernel's definition of the shape, so the scout, the
     mint path, and the docs all write and read the same artifact. Anything that needs this
     shape ENFORCED mechanically is a `type: contract-change` to `@architect`, not a local
     invention.

     Fill every <bracketed> prompt and delete this comment. Sections below are required. -->

# Research: <topic>

## Scope of the question

<What was researched and why, in two or three sentences. Name the vertical precisely enough
that a reader can tell what falls outside it. This becomes the basis for the profile's
`route_when`, so vagueness here produces a misrouting expert.>

## Practitioner pain points

<What actually goes wrong for people working in this domain, ranked. Not a feature list and
not a market summary: the concrete failures a generic implementation would walk into. Each
item names the source that establishes it. This section is the reason external research is
required at all, so an empty or generic list means the research is not done.>

1. <pain point> — <source ref>
2. <pain point> — <source ref>

## Findings

<The substantive domain knowledge: rules, constraints, regulatory or operational
requirements, standard vocabulary, accepted patterns, and known anti-patterns. Each claim
names the source it rests on. Anything you could not establish from a source belongs under
`## What this does not cover`, not here.>

## Sources

| kind | ref | supports |
|---|---|---|
| url | <https://...> | <what this source establishes> |
| doc | <docs/... or a named external document> | <what this source establishes> |

<Same `kind` vocabulary as a profile's `sources` (`repo-path` | `doc` | `url` |
`intair-node` | `human-brief`), so rows lift directly into the minted profile's frontmatter.

Two hard requirements the mint depends on:
  - At least one `url` or `doc` row, or the resulting profile fails validation rule 12.
  - A `hybrid` recommendation needs both an external row and at least one `repo-path` row,
    or the resulting profile fails validation rule 14.
An artifact whose only source is `kind: intair-node` cannot authorize a mint: Intair is
optional, so an expert groundable only through it cannot function offline.>

## What this does not cover

<Where the research stopped: questions left open, sources that were unavailable, sub-areas
deliberately excluded. Required and must be non-empty. This section becomes the minted
profile's `## Known limits`, and a profile claiming no limits is the worst-case correctness
failure.>

## Degradation

<Required when `researched.mode` is `human-brief`. When no web tooling is available in the
host, the scout works from a human-supplied brief plus local `docs/` and records here exactly
what was and was not verifiable. If the result cannot support the findings above, the correct
outcome is `recommendation: do-not-mint`. Refusing to mint is the safe failure.

When `mode: web`, state "Full research mode; no degradation." and nothing else.>

## Proposed profile fields

<The bridge from research to a profile, so the mint path does not re-derive judgment calls.>

- `classification`: <external | hybrid>
- `route_when`: <the single sharp sentence routing will read>
- `maturity`: provisional  <!-- every fresh mint starts here; promotion needs human action -->
- `gate`: soft             <!-- `hard` requires `maturity: established`, so never at mint -->
- `minted.basis`: <the signal that justified this mint, referencing this artifact>

## Mint recommendation

<One paragraph justifying `recommendation` in the frontmatter, and for `do-not-mint`, what
would have to be true to change the answer. State plainly whether the findings above are
strong enough to carry a depth claim. `do-not-mint` is a legitimate and expected outcome; a
scout that always recommends minting is not adding a safety check.>
