# Project domain experts

**Your agents are generalists. Your project isn't.** Skailr's roles — researcher, architect, backend-engineer, validator — are process roles, generic on purpose so the same pack works on a billing SaaS and a compliance tool. What they don't carry is *depth in your domain*.

A **minted expert** is that depth, stored as data in your project: one markdown profile under `.claude/experts/profiles/<slug>.md` that names a narrow band, cites the sources its knowledge rests on, and gets consulted by the roles that were already going to run.

```
/mint-expert invoice dunning and payment retries
```

The mechanism ships with the pack. The roster is yours — git-tracked in your repo, and the installers never touch it. A project with no `.claude/experts/` directory behaves exactly as it did before experts existed; that's the normal state of most projects and never an error.

| | Teams (`.claude/teams/registry.md`) | Experts (`.claude/experts/registry.md`) |
| --- | --- | --- |
| What they are | Process roles, generic across projects | Named project-local depth in one vertical and one part of this repo |
| Routed a workstream | Yes | **Never** |
| Own files | Yes, along a boundary unit | No — an expert writes only its own profile and per-run input files |
| What they do | Build the deliverable | Advise, co-author as scoped input, gate as evidence |
| Ships with the pack | Yes | No — minted per project at runtime |

## How a consult works

Dispatch always names the role `expert`, never the slug — the slug is input. That's what lets a fresh mint become consultable with no routing entry, no Cursor mirror, no install allowlist edit. The expert loads exactly one profile; that file is its entire identity for the run.

| Mode | Writes | Used by |
| --- | --- | --- |
| `advise` | `.claude/tmp/ask.md` plus an `## Expert` block | Plain-chat intake, when a question falls in exactly one band |
| `co-author` | `$ARTIFACT_ROOT/expert-<slug>.md` | `story-writer` and `architect` (disposition tables); `/build-program` also passes the file to domain leads |
| `gate` | `$ARTIFACT_ROOT/expert-verdict-<slug>.md` | `validator` and `program-validator`, which cite the verdict |

Two rules govern every mode. **Every substantive claim cites a `sources` entry from the profile** — an uncited claim is a protocol violation, not a style lapse. And the expert **stops at `## Known limits`**: "I cannot establish that from my sources" is a correct and expected answer.

Co-authoring is scoped input, never direct authorship. The expert writes its own file and never edits `story.md`, `spec.md`, or anything another role owns, even to fix something obviously wrong. Disjoint ownership is the pack's core invariant; the owning role incorporates or explicitly rejects each item.

### Routing is guarded against ambiguity

Intake reads only the Roster table, never a profile. All four must hold to route to an expert:

1. No slash command is driving the turn.
2. The registry exists with a non-empty roster.
3. **Exactly one** row's `route-when` covers the ask.
4. The matched row is not `deprecated`.

Zero matches and two-or-more matches both mean "no expert route" — the caller falls back to its normal behavior. That's deliberate: band overlap has no mechanical check anywhere in this system, so picking between two overlapping experts would be a guess dressed as depth. A generic grounded answer beats a confidently misrouted one. A `no-expert` return (profile missing, unparseable, or deprecated) means fall through silently; callers never surface it as an error.

## Why a fresh expert cannot block

An expert is evidence, not a parallel authority. There is exactly one sign-off role per tier, and it cites the expert's verdict in its own sign-off.

| Maturity | Can advise and co-author | Can gate bindingly | In the roster table |
| --- | --- | --- | --- |
| `provisional` | Yes | No, under any configuration | Yes |
| `established` | Yes | Only when both gate settings are `hard` | Yes |
| `deprecated` | No — never dispatched | No | No |

Every mint starts `provisional`. Promotion to `established` is the one lifecycle transition that **requires explicit human action** — nothing infers it: not age, not a clean validation run, not a streak of useful answers. Retirement sets `maturity: deprecated` and never deletes the profile; it leaves the roster and stays in the log as history.

`authority` on a verdict is **computed, never chosen**. `binding` requires all three:

| Condition | Required value |
| --- | --- |
| `config.gate_mode` | `hard` |
| profile `gate` | `hard` |
| profile `maturity` | `established` |

Anything else is `advisory`. Under the shipped default (`gate_mode: soft`) nothing is ever binding: a `fail` becomes a recorded finding plus a heads-up, and the pipeline continues. A per-expert `gate` narrows but never widens `gate_mode`. Experts gate on **domain correctness** only — internal consistency, test coverage, and code quality already belong to `validator`, `e2e-verifier`, and the domain reviewers. A `fail` names the domain requirement violated and the source establishing it; "this would be better if…" is a `pass-with-notes` at most.

## Where depth comes from (classifications)

Every expert carries **both** an industry dimension and a repo dimension — dual depth is the point, including for `internal`. Classification says where the depth came from, with mechanical consequences:

| Classification | Depth sourced from | Requires |
| --- | --- | --- |
| `internal` | This repo | At least one `repo-path` source |
| `external` | The field beyond this repo | At least one `url` or `doc` source, plus a research artifact |
| `hybrid` | Both | Both source sets, plus a research artifact |

Only an explicit `/mint-expert` can create an `external` or `hybrid` expert, and only after `expert-scout` has written `.claude/experts/research/<slug>.md`. That role holds the pack's only web tooling and is expected to return `do-not-mint` when the sources cannot carry a depth claim — a profile labeled `external` that was written from a guess launders that guess as field expertise, which is worse than having no expert.

## Minting

Exactly **three** auditable triggers, no fourth. No ambient, inferred, or background minting; plain chat never mints.

| Trigger | Path | Classification | `minted.by` |
| --- | --- | --- | --- |
| T1 explicit | `/mint-expert <topic> [internal\|external\|hybrid]` | Any | `mint-expert` |
| T2 baseline | The `/map-repo` phase after its human-confirm gate | `internal` only | `map-repo` |
| T3 build setup | Skill `consult-or-mint` in `/yolo`, `/yolo-program`, `/ship-feature`, `/patch`, `/plan-program` (and recovery in `/build-program`) | `internal` only | `build-consult` |

(The T3 row lists where the *mint evaluation* can fire. `consult-or-mint` is wired more widely — `/build-feature`, `/map-repo`, and `/discover` also consult — but those callers run consult-only or T2; the two lists differ on purpose.)

Callers follow skill `consult-or-mint`, which owns consult → optional mint eval → mint → **re-consult** → carry-forward of matched slugs. Co-author and gate read the carry-forward note, never "does the registry exist?". **Empty roster ≠ skip mint**: a missing `.claude/experts/` means zero bands matched on consult, not a skipped evaluation. Narrating "no experts registry" to the user is a bug; silence is required.

T2 and T3 run the identical Step 0–9 procedure in `.claude/commands/mint-expert.md`. They fire only when `auto_mint` is true **and** the vertical shows at least `mint_threshold` (default 2) **independent** signals:

| Qualifying signal | Counts as |
| --- | --- |
| Directory Boundaries entry in `.claude/repo/orientation.md` for that vertical | 1 |
| ≥2 `backlog.md` items sharing a category for that vertical | 1 total |
| Explicit human mention of the vertical in the active request | 1 |
| Researcher/architect artifact names that vertical against concrete repo paths | 1 |
| ≥3 consult attempts in this run that found no band for the same vertical | 1 total |

**Timing:** T3 never mints at cold start with no evidence — feature YOLO consults existing experts before research, then runs `consult-and-mint` after research; program paths mint after the brief exists; `/patch` evaluates in one cheap setup step and usually stays below threshold. Below threshold, a run mints nothing (most `/patch` runs mint nothing — that's the expected outcome). A one-signal vertical is not a weak mint; it is no mint.

Two invariants to rely on:

- **A roster never contains an invalid profile, even transiently.** If validation fails, the just-written profile is deleted.
- **Notification, never approval.** A mint posts `type: heads-up` to `@all` — never `to: @human`, never `type: contract-change`. Either of those would halt a pipeline and turn notification into per-mint approval.

## Validation

One script is the only pass condition for a mint and the only mechanical safety net for a runtime-authored role artifact:

```bash
node scripts/skailr/check-experts.mjs                    # whole roster
node scripts/skailr/check-experts.mjs --slug <slug>      # one profile
node scripts/skailr/check-experts.mjs --regen-registry   # rewrite registry.md from profiles
node scripts/skailr/check-experts.mjs --strict           # warnings become errors
```

| Exit | Meaning |
| --- | --- |
| `0` | Valid, or nothing to check |
| `1` | Validation errors |
| `2` | Bad usage (unreadable `--dir`, unknown flag, unparseable `config.json`) |

A **missing** roster directory exits `0` with a skip message — a fresh install that has never minted must never fail a gate for not having experts. Zero npm dependencies, like every script in `scripts/skailr/`.

<details>
<summary><strong>What the 21 rules cover</strong> — and the one deliberate non-check</summary>

Checks include: the schema tag; slug pattern (`^[a-z0-9]+(-[a-z0-9]+)*-expert$` — the mandatory `-expert` suffix guarantees a mint can never collide with a pack role name), uniqueness, filename match; dual depth; every `repo-path` source exists on disk; the classification requirements above; that `gate: hard` requires `maturity: established`; all eight required body sections present; `## Known limits` non-empty.

Warnings (never blocking): `route_when` under 30 characters, a cited path changed since `last_reviewed.against_sha`, `provisional` for over 90 days, roster above `roster_cap`.

**What it does not check:** `route-when` band overlap, between two experts or between an expert and a team. Textual overlap is not mechanically decidable (an LLM-in-a-gate would make a script gate nondeterministic), so this is a **deliberate non-check**: the intake-side ambiguity guard — zero or two-plus matches both mean "no expert route" — is the operational backstop, and sharp bands at mint/curate time are the only defense.

Regeneration is deterministic and never runs on a failed roster, so a broken profile cannot corrupt the routing view. Safe to wire as a `Stop` hook, but only without `--strict`, so a soft cap warning never fails an ordinary turn.

</details>

## Maintaining an expert

Refresh, revise, promote, and retire are a **`curate-expert` pass** — not a mint, not a fourth consult mode:

```
/mint-expert promote <slug>
/mint-expert revise <slug>
/mint-expert retire <slug>
```

Staleness is detected from **git, not a timer**: each profile records `last_reviewed.against_sha`, and a consult checks `git diff --name-only <against_sha>..HEAD -- <ref>` for every cited `repo-path`. An `unknown` or unresolvable sha, or no git, means staleness detection is **skipped silently, never failed**. When paths have moved, the expert still answers, then posts a heads-up recommending a refresh — it never refreshes itself mid-consult and never withholds the answer.

Every pass appends one line to the registry log (channels are per-run and gitignored, so the log is the only durable record):

```
- `2026-07-29T07:03:17Z` **minted** `skailr-pack-expert` (`internal`) by `mint-expert` — Frozen contract dogfood-worked-example v1 requires this repo to carry a real two-expert roster, minted by hand in workstream dogfood-roster.
- `2026-07-29T15:40:03Z` **revised** `skailr-pack-expert` — sharpened band; dropped a moved source
- `2026-08-02T09:12:55Z` **promoted** `skailr-pack-expert` provisional to established — reviewed by maintainer
```

An expert never initiates maintenance on itself: it does not mint, does not promote itself out of `provisional`, and does not widen its own band because a question fell just outside it.

## Configuration

`.claude/experts/config.json` is optional. **A missing file means all defaults** — the normal state of a project that has never minted. Nothing creates it for you; writing one would freeze today's defaults into your project.

| Key | Default | Effect |
| --- | --- | --- |
| `gate_mode` | `soft` | `soft`: an expert `fail` is a recorded finding plus a heads-up, never a halt. `hard`: a `fail` halts the orchestrator |
| `auto_mint` | `true` | `false` makes T2 and T3 no-ops; explicit `/mint-expert` still mints |
| `roster_cap` | `7` | Soft cap — exceeding it posts a consolidation heads-up, never blocks a mint |
| `mint_threshold` | `2` | Independent signals required before an auto-mint fires |

Unknown keys are ignored. An out-of-enum `gate_mode` or unparseable JSON is a **usage error**, not a silent fallback — getting gate behavior wrong by typo is exactly the quiet failure that makes a gate decorative. Keep the roster small: two sharp bands beat five fuzzy ones, because nothing mechanically prevents two overlapping bands from both failing to match.

## The layout

```
.claude/experts/
  registry.md              # generated routing view; the only file routing reads
  config.json              # optional; absent means all defaults
  profiles/<slug>.md       # one per expert; the unit of identity
  research/<slug>.md       # required for external and hybrid experts only
```

Directories are created lazily. `registry.md` is **generated** from profile frontmatter — don't hand-edit its roster table or depth index; the one hand-written region is the append-only log at the bottom.

## Worked example

The expert actually minted on this repo, `internal` — depth sourced entirely from paths in this repository. (A `hybrid` mint would add `expert-scout` and a research artifact to the same Step 0–9 procedure.)

```
/mint-expert skailr pack internal
```

It lands `provisional`, `gate: soft` — advising and co-authoring right away, blocking nothing. The regenerated roster:

```markdown
| slug | name | classification | maturity | gate | route-when |
|---|---|---|---|---|---|
| skailr-pack-expert | Skailr Pack | internal | provisional | soft | Asks about how the skailr pack itself is structured, how roles/commands/skills are defined and wired, or how a change reaches Claude Code, Cursor, and consumer installs. |
```

Now a plain-chat question lands: *"How does a change to a role file reach a consumer's Cursor install?"* Exactly one band covers it, so intake dispatches `expert` in `advise` mode with `slug: skailr-pack-expert`. The answer cites `scripts/remirror.sh` and `install.sh`, with a leading line noting the depth is unreviewed (`provisional`). Ask the same question with two overlapping bands on the roster and it falls through to the researcher instead, unchanged.

Later, `scripts/remirror.sh` changes. The next consult notices the cited path moved since `against_sha`, answers anyway, and posts a heads-up. You run `/mint-expert revise skailr-pack-expert`; once you trust its answers, `/mint-expert promote skailr-pack-expert` makes it `established` — the only way it becomes eligible to gate bindingly, and only if you also set both gate settings to `hard`.

<details>
<summary><strong>The frontmatter behind one profile</strong></summary>

```yaml
---
schema: skailr.expert/v1
slug: skailr-pack-expert
name: Skailr Pack
classification: internal
route_when: Asks about how the skailr pack itself is structured, how roles/commands/skills are defined and wired, or how a change reaches Claude Code, Cursor, and consumer installs.
depth:
  industry:
    - agent-orchestration frameworks
    - multi-agent pipeline design
    - prompt-as-source-of-truth packaging
  repo:
    - .claude/agents/** role definitions
    - the command phase machines
    - scripts/remirror.sh generation
    - install.sh distribution
    - the four hand-maintained allowlists
sources:
  - kind: repo-path
    ref: scripts/remirror.sh
    note: The generator that turns the authoritative .claude/ tree into the .cursor/ mirror, CLAUDE.md, and manifest.json, including the flat-file hard fail and the four hand-maintained lists.
  - kind: repo-path
    ref: install.sh
    note: How the pack lands in a consumer project, which artifacts are copied, the two Cursor allowlists, and the roster fingerprint that keeps .claude/experts/ untouched on upgrade.
  - kind: repo-path
    ref: .claude/teams/registry.md
    note: The Tier-1 routing view whose route-when voice expert bands imitate, plus the standing rule that experts are not a team and the live roster is never written into the pack.
  - kind: repo-path
    ref: .claude/agents/engineering/researcher.md
    note: A representative role definition showing the frontmatter keys and tool-restriction prose every pack role follows.
maturity: provisional
gate: soft
minted:
  at: 2026-07-29T07:03:17Z
  by: mint-expert
  basis: Frozen contract dogfood-worked-example v1 requires this repo to carry a real two-expert roster, minted by hand in workstream dogfood-roster.
last_reviewed:
  at: 2026-07-29T13:00:00Z
  against_sha: 4dc05314e7d7fd529ce3c4c04c3b13a9a2c767a5
supersedes: null
---
```

</details>

## Distribution and upgrade safety

| | Ships with the pack | Lives in your project |
| --- | --- | --- |
| The mechanism | `.claude/agents/experts/`, `.claude/commands/mint-expert.md`, `.claude/skills/curate-expert/`, kernel schemas and templates under `.claude/program/schemas/`, `scripts/skailr/check-experts.mjs` | |
| The instances | | `.claude/experts/` in full: profiles, research, registry, config |

The installers **never touch `.claude/experts/`** — that roster is accumulated project expertise owned by you, and an upgrade must leave it byte-identical. The reverse also holds: `.claude/teams/registry.md` is copied fresh on install and regenerated by remirror, so a live roster is never written into it; anything added there at runtime is destroyed on the next upgrade.

The roster is **not gitignored**. It is git-tracked, consumer-owned, and agent-mutated by design — commit `.claude/experts/` the way you commit `.claude/repo/` after a confirmed baseline. That's what makes an expert's depth survive a session, a teammate's clone, and a pack upgrade.

## Reference

| What | Where |
| --- | --- |
| Mint procedure, lifecycle forms | `.claude/commands/mint-expert.md` |
| Consult + auto-mint orchestration | `.claude/skills/consult-or-mint/SKILL.md` |
| Consult protocol, three modes | `.claude/agents/experts/expert.md` |
| External research and refusal rules | `.claude/agents/experts/expert-scout.md` |
| Maintenance operations | `.claude/skills/curate-expert/SKILL.md` |
| Profile and config schemas | `.claude/program/schemas/expert.schema.json`, `expert-config.schema.json` |
| Profile, registry, research templates | `.claude/program/schemas/expert-*.template.md` |
| Validator | `scripts/skailr/check-experts.mjs` |
| Why experts are not a team | `.claude/teams/registry.md` |
| Plain-chat routing | [INTAKE.md](INTAKE.md) |
