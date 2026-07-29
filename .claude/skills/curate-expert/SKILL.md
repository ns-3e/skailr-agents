---
name: curate-expert
description: Maintain a minted expert over time — refresh against changed sources, revise a band or depth, promote provisional to established, retire to deprecated. Git-based staleness, validate-then-regenerate, durable log line. Use when a curate pass is dispatched for one slug.
---

# Skill: curate-expert

## When to use

When a curate pass is **dispatched** for exactly one slug: an expert's cited sources have moved, its band or depth is wrong, a human has approved promotion, or it is being retired. Also the follow-up path when a consult posted a staleness heads-up.

Not for minting (that is `/mint-expert`, three auditable triggers only), and not self-initiated: an expert never curates itself because a question fell just outside its band.

Executed by the `expert` role, which already loads and can write the one profile involved. One slug per pass.

## Preflight

1. Read `.claude/experts/profiles/<slug>.md`. Missing → report `no-expert` and stop.
2. Read `.claude/experts/config.json` (missing means all defaults: `gate_mode: soft`, `auto_mint: true`, `roster_cap: 7`, `mint_threshold: 2`).
3. Note the current sha and keep the pre-edit profile content so step 5 can revert:

```bash
git rev-parse HEAD
```

4. Decide **one** operation: refresh, revise, promote, or retire. Never two in one pass.

## Staleness (git, not a timer)

For each `sources[]` entry with `kind: repo-path`:

```bash
git diff --name-only <last_reviewed.against_sha>..HEAD -- <ref>
git log --oneline <last_reviewed.against_sha>..HEAD -- <ref>
```

- `against_sha: unknown`, an unresolvable sha (shallow clone, rewritten history), or no git → **skip silently and note it**. Staleness is skipped, never an error.
- Non-empty output → the profile's basis moved. Refresh is warranted; the changed refs are what you re-read.
- Empty output on every ref → nothing is stale. A refresh pass may still advance `last_reviewed` (see below); a revise pass proceeds on its own merits.

## Operations

### Refresh — the basis moved

1. Re-read every changed `repo-path` source (and any `doc` source in the repo). For `external`/`hybrid`, re-read `.claude/experts/research/<slug>.md`; a stale *external* basis needs `expert-scout`, not this skill.
2. Correct `## Industry depth`, `## Repo depth`, and `## Known limits` so every claim still matches what its source now says. Delete claims the source no longer supports rather than hedging them.
3. Update `sources[].ref` where a path moved; **drop** an entry whose ref no longer exists (a `repo-path` ref that does not exist on disk fails validation rule 10).
4. Set `last_reviewed.at` to now (ISO-8601 UTC, `Z`-suffixed) and `last_reviewed.against_sha` to current HEAD.
5. Log a `revised` line. When nothing substantive changed, say so: `last_reviewed advanced to <sha>; no substantive change`.

### Revise — the band or depth is wrong

Edit only what is wrong, in the profile frontmatter and matching body sections: `route_when` and `## Band`, `depth.industry` / `depth.repo`, `sources`, `name`, `gate`.

- Sharpen `route_when` rather than widening it. Band overlap between experts is **not mechanically checkable** anywhere in this system, so a widened band is a misrouting risk no validator will catch. If revision reveals an overlap with an existing band, post a heads-up naming both slugs.
- `gate: hard` is only valid with `maturity: established`; setting it otherwise fails validation rule 16.
- `classification` changes are constrained: moving to `external` or `hybrid` requires `.claude/experts/research/<slug>.md` and at least one `url` or `doc` source, so it needs `expert-scout` first. Do not relabel a profile to `external` in this skill.
- **Material** revision (band, classification, depth, gate, or a dropped source) → log line **and** heads-up. Non-material (wording, a `note`, a typo) → log line only.
- Advance `last_reviewed` as in refresh.

### Promote — provisional to established

The one lifecycle transition that **requires explicit human action**, because promotion is what makes an expert eligible to gate bindingly.

- No explicit human instruction in the dispatch → **refuse**, change nothing, and report why. Do not infer approval from age, from a clean validation run, or from the fact that the expert has been useful.
- Otherwise set `maturity: established`, advance `last_reviewed`, and log a `promoted` line naming who approved it and why.
- Promotion does not change `gate`. Raising `gate` to `hard` is a separate revise pass, and under `gate_mode: soft` it stays advisory regardless.

### Retire — the band is dead or absorbed

1. Set `maturity: deprecated`. **Never delete the profile**; deprecated experts are retained for history and are simply never dispatched again.
2. If a replacement expert exists, set `supersedes: <retired-slug>` on **the replacement's** profile (a second, separate pass on that slug).
3. Regenerate the registry: a `deprecated` expert disappears from the roster table and depth index, and remains only in the log.
4. Log a `retired` line with the reason.

## Validate, then regenerate — in that order

```bash
node scripts/skailr/check-experts.mjs --slug <slug>
node scripts/skailr/check-experts.mjs --regen-registry
```

- Non-zero exit on the first command → **restore the pre-edit profile content** and report the failure. A roster never holds an invalid profile, even transiently.
- Exit `0` with a skip message on a missing roster directory is normal and never an error.
- Warnings (roster cap, weak `route_when`, staleness on another profile) do not block the pass; carry them into the report.
- Never hand-edit the roster table or the depth index. They are regenerated from frontmatter, which is the whole point of a derived view.

## Durable log line

Append **one** line for the pass to `.claude/experts/registry.md`, at the end of the file below the `<!-- mint-log:append-below -->` anchor. Append-only: never reorder, reword, or prune an existing line, and never let regeneration touch this region.

```
- `<ISO-8601 UTC>` **revised** `<slug>` — <what changed>
- `<ISO-8601 UTC>` **promoted** `<slug>` provisional to established — <who/why>
- `<ISO-8601 UTC>` **retired** `<slug>` — <reason>
```

This log is the only durable record of the pass. Channels are per-run and gitignored, so a heads-up alone does not survive the run.

## Heads-up (non-blocking)

For a material revision, a promotion, or a retirement, post to `@all` on `.claude/program/channels/program.md` (program run) or `.claude/tmp/channels/feature.md` (feature run). Scan every channel file for the highest `MSG-<seq>` first and use the next.

```
### MSG-<next-seq>
from: expert (<workstream or "program">)
to: @all
type: heads-up
status: open
---
Revised <slug> — <what changed>. Profile: .claude/experts/profiles/<slug>.md.
```

Never `to: @human` and never `type: contract-change`: either halts the orchestrator and converts maintenance into an approval gate, which the notification-not-approval rule forbids.

When the profile count exceeds `roster_cap`, post one additional consolidation heads-up naming the closest bands. It is a soft cap: it never blocks a pass.

## Never

- Curate two slugs, or perform two operations, in one pass.
- Promote without explicit human action, or self-promote.
- Delete a profile, a research artifact, or a log line.
- Relabel a profile `external`/`hybrid` without a research artifact.
- Widen a band to capture a question that missed it.
- Touch `story.md`, `spec.md`, an ownership map, a contract, or another expert's profile.
- Leave an invalid profile on disk after a failed validation.
