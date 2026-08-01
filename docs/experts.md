# Project domain experts

Skailr's agents are **process roles**: researcher, architect, backend-engineer, validator. They are generic on purpose, so the same pack works on a billing SaaS and a compliance tool. What they do not carry is *depth in your domain*.

A **minted expert** is that depth, stored as data in your project. It is one markdown profile under `.claude/experts/profiles/<slug>.md` that names a narrow band, cites the sources its knowledge rests on, and is consulted by the roles that were already going to run.

The mechanism ships with the pack. The roster is yours: it lives in your repo, is git-tracked, and `install.sh` never touches it.

| | Teams (`.claude/teams/registry.md`) | Experts (`.claude/experts/registry.md`) |
| --- | --- | --- |
| What they are | Process roles, generic across projects | Named project-local depth in one vertical and one part of this repo |
| Routed a workstream | Yes | **Never** |
| Own files | Yes, along a boundary unit | No. An expert writes only its own profile and per-run input files |
| What they do | Build the deliverable | Advise, co-author as scoped input, gate as evidence |
| Ships with the pack | Yes | No. Minted per project at runtime |

A project with no `.claude/experts/` directory behaves exactly as it did before experts existed. That is the normal state of most projects and is never an error.

---

## The layout

```
.claude/experts/
  registry.md              # generated routing view; the only file routing reads
  config.json              # optional; absent means all defaults
  profiles/<slug>.md       # one per expert; the unit of identity
  research/<slug>.md       # required for external and hybrid experts only
```

Directories are created lazily, only when something needs them. Slugs must match `^[a-z0-9]+(-[a-z0-9]+)*-expert$`; the mandatory `-expert` suffix is what guarantees a fresh mint can never collide with a pack role name.

`registry.md` is **generated** from profile frontmatter. Do not hand-edit its roster table or depth index; the one hand-written region is the append-only log at the bottom.

---

## Classifications

Every expert carries **both** an industry dimension and a repo dimension. Classification says where the depth came from, and each one has mechanical consequences.

| Classification | Depth sourced from | Requires |
| --- | --- | --- |
| `internal` | This repo | At least one `repo-path` source |
| `external` | The field beyond this repo | At least one `url` or `doc` source, plus a research artifact |
| `hybrid` | Both | Both source sets, plus a research artifact |

`depth.industry` and `depth.repo` are both non-empty for **every** classification, including `internal`. An internal expert still knows things about the field your repo operates in; dual depth is the point of the mechanism.

Only an explicit `/mint-expert` can create an `external` or `hybrid` expert, and only after `expert-scout` has written `.claude/experts/research/<slug>.md`. That role holds the pack's only web tooling and it is expected to return `do-not-mint` when the sources cannot carry a depth claim. A profile labeled `external` that was written from a guess launders that guess as field expertise, which is worse than having no expert.

---

## Maturity, and why a fresh expert cannot block

| Maturity | Can advise and co-author | Can gate bindingly | Appears in the roster table |
| --- | --- | --- | --- |
| `provisional` | Yes | No, under any configuration | Yes |
| `established` | Yes | Only when both gate settings are `hard` | Yes |
| `deprecated` | No. Never dispatched | No | No |

Every mint starts `provisional`. Promotion to `established` is the one lifecycle transition that **requires explicit human action**, because promotion is what makes an expert eligible to gate bindingly. Nothing infers it: not age, not a clean validation run, not a run of useful answers.

Retirement sets `maturity: deprecated` and never deletes the profile. A retired expert leaves the roster table and the depth index, and stays in the log as history.

---

## How a consult works

Dispatch always names the role `expert`, never the slug. The slug is input. That is what lets a fresh mint become consultable with no routing entry, no Cursor mirror, and no install allowlist edit.

The expert loads exactly one profile, and that file is its entire identity for the run. Three modes:

| Mode | Writes | Used by |
| --- | --- | --- |
| `advise` | `.claude/tmp/ask.md` plus an `## Expert` block | Plain-chat intake, when a question falls in exactly one band |
| `co-author` | `.claude/tmp/expert-<slug>.md` | `story-writer` and `architect` (disposition tables); `/build-program` also passes the file to domain leads |
| `gate` | `.claude/tmp/expert-verdict-<slug>.md` | `validator` and `program-validator`, which cite the verdict |

Two rules govern every mode. **Every substantive claim cites a `sources` entry from the profile**; an uncited claim is a protocol violation, not a style lapse. And the expert **stops at `## Known limits`**: "I cannot establish that from my sources" is a correct and expected answer.

Co-authoring is scoped input, never direct authorship. The expert writes its own file and never edits `story.md`, `spec.md`, or anything another role owns, even to fix something obviously wrong. Disjoint ownership is the pack's core invariant, and the owning role incorporates or explicitly rejects each item.

### Routing is guarded against ambiguity

Intake reads only the Roster table, never a profile. All four conditions must hold to route to an expert:

1. No slash command is driving the turn.
2. The registry exists with a non-empty roster.
3. **Exactly one** row's `route-when` covers the ask.
4. The matched row is not `deprecated`.

Zero matches and two-or-more matches both mean "no expert route," and the caller falls back to its normal behavior. That is deliberate: band overlap has no mechanical check anywhere in this system, so picking between two overlapping experts would be a guess dressed as depth. A generic grounded answer beats a confidently misrouted one.

A `no-expert` return (profile missing, unparseable, or deprecated) means fall through silently. Callers never surface it as an error.

---

## The soft gate

An expert is evidence, not a parallel authority. There is exactly one sign-off role per tier, and it cites the expert's verdict in its own sign-off.

`authority` on a verdict is **computed, never chosen**. `binding` requires all three:

| Condition | Required value |
| --- | --- |
| `config.gate_mode` | `hard` |
| profile `gate` | `hard` |
| profile `maturity` | `established` |

Anything else is `advisory`. So a `provisional` expert can never block, and under the shipped default (`gate_mode: soft`) nothing is ever binding: a `fail` becomes a recorded finding plus a heads-up, and the pipeline continues. A per-expert `gate` narrows but never widens `gate_mode`.

Experts gate on **domain correctness** only. Internal consistency, test coverage, and code quality already belong to `validator`, `e2e-verifier`, and the domain reviewers. A `fail` names the domain requirement violated and the source establishing it; "this would be better if…" is a `pass-with-notes` at most.

---

## Minting

There are exactly **three** auditable triggers and no fourth. There is no ambient, inferred, or background minting.

| Trigger | Path | Classification | `minted.by` |
| --- | --- | --- | --- |
| T1 explicit | `/mint-expert <topic> [internal\|external\|hybrid]` | Any | `mint-expert` |
| T2 baseline | The `/map-repo` phase after its human-confirm gate | `internal` only | `map-repo` |
| T3 build setup | Skill `consult-or-mint` in `/yolo`, `/yolo-program`, `/ship-feature`, `/patch`, `/plan-program` (and recovery in `/build-program`) | `internal` only | `build-consult` |

Callers follow skill `consult-or-mint`. That skill owns consult → optional mint eval → mint → **re-consult** → carry-forward of matched slugs. Co-author and gate read the carry-forward note, never “does registry exist?”

**Empty roster ≠ skip mint.** A missing `.claude/experts/` or `registry.md` means zero bands matched on consult. It does **not** skip mint evaluation. Narrating “no experts registry” to the user is a bug; silence is required.

T2 and T3 run the identical nine-step procedure in `.claude/commands/mint-expert.md`. They fire only when `auto_mint` is true **and** the vertical shows at least `mint_threshold` (default 2) **independent** signals:

| Qualifying signal | Counts as |
| --- | --- |
| Directory Boundaries entry in `.claude/repo/orientation.md` for that vertical | 1 |
| ≥2 `backlog.md` items sharing a category for that vertical | 1 total |
| Explicit human mention of the vertical in the active request | 1 |
| Researcher/architect artifact names that vertical against concrete repo paths (`research.md` Prior Art, or brief/plan citing real paths) | 1 |
| ≥3 consult attempts in this run that found no band for the same vertical | 1 total |

**Timing:** T3 does not mint at cold start with no evidence. Feature YOLO consults existing experts before research, then runs `consult-and-mint` after research (before story). Program paths mint after the brief exists. `/patch` evaluates in one cheap setup step and usually stays below threshold (one signal).

Below threshold, a run mints nothing and may post a single heads-up about the near miss. A one-signal vertical is not a weak mint; it is no mint. Most `/patch` runs mint nothing, which is the expected outcome.

Two invariants worth knowing before you rely on this:

- **A roster never contains an invalid profile, even transiently.** If validation fails, the profile that was just written is deleted.
- **Notification, never approval.** A mint posts `type: heads-up` to `@all`, never `to: @human` and never `type: contract-change`. Either of those would halt a pipeline and turn notification into per-mint approval.

Plain chat never mints. Intake consults the roster; it does not write to it.

---

## Validation

One script is the only pass condition for a mint and the only mechanical safety net for a runtime-authored role artifact.

```bash
node scripts/skailr/check-experts.mjs                    # validate the whole roster
node scripts/skailr/check-experts.mjs --slug <slug>      # one profile
node scripts/skailr/check-experts.mjs --regen-registry   # rewrite registry.md from profiles
node scripts/skailr/check-experts.mjs --strict           # warnings become errors
```

| Exit | Meaning |
| --- | --- |
| `0` | Valid, or nothing to check |
| `1` | Validation errors |
| `2` | Bad usage (unreadable `--dir`, unknown flag, unparseable `config.json`) |

A **missing** roster directory exits `0` with a skip message. A fresh install that has never minted must never fail a gate for not having experts. Zero npm dependencies, like every other script in `scripts/skailr/`.

It checks 21 numbered rules, including: the schema tag; slug pattern, uniqueness, filename match, and non-collision with a pack role name; dual depth; that every `repo-path` source exists on disk; the classification implications above; that no expert is groundable only through Intair; that `gate: hard` requires `maturity: established`; that all eight required body sections are present; and that `## Known limits` is non-empty.

Warnings do not block: a `route_when` under 30 characters, a cited path that changed since `last_reviewed.against_sha`, a profile `provisional` for over 90 days, and a roster above `roster_cap`.

**What it does not check:** `route-when` band overlap, between two experts or between an expert and a team. Textual overlap is not mechanically decidable, so nothing here protects a caller from misrouting. Sharp bands are the only defense.

Regeneration is deterministic and never runs on a failed roster, so a broken profile cannot corrupt the routing view. Safe to wire as a `Stop` hook, but only without `--strict`, so a soft cap warning never fails an ordinary turn.

---

## Maintaining an expert

Refresh, revise, promote, and retire are a **`curate-expert` pass**, not a mint and not a fourth consult mode. Dispatch the `expert` role by naming the skill plus one slug, with no `mode`; the pass produces no consult artifact.

```
/mint-expert promote <slug>
/mint-expert revise <slug>
/mint-expert retire <slug>
```

Staleness is detected from **git, not a timer**. Each profile records `last_reviewed.against_sha`, and a consult checks whether any cited `repo-path` has changed since it:

```bash
git diff --name-only <against_sha>..HEAD -- <ref>
```

An `unknown` sha, an unresolvable sha, or no git available means staleness detection is **skipped silently, never failed**. When paths have moved, the expert still answers, then posts a heads-up recommending a refresh. It does not refresh itself mid-consult and does not withhold the answer.

Every pass appends one line to the registry log. Channels are per-run and gitignored, so the log is the only durable record:

```
- `2026-07-29T07:03:17Z` **minted** `skailr-pack-expert` (`internal`) by `mint-expert` — Frozen contract dogfood-worked-example v1 requires this repo to carry a real two-expert roster, minted by hand in workstream dogfood-roster.
- `2026-07-29T15:40:03Z` **revised** `skailr-pack-expert` — sharpened band; dropped a moved source
- `2026-08-02T09:12:55Z` **promoted** `skailr-pack-expert` provisional to established — reviewed by maintainer
- `2026-09-14T11:00:00Z` **retired** `skailr-pack-expert` — band absorbed by a successor expert
```

An expert never initiates maintenance on itself. It does not mint, does not promote itself out of `provisional`, and does not widen its own band because a question fell just outside it.

---

## Configuration

`.claude/experts/config.json` is optional. **A missing file means all defaults** and is the normal state of a project that has never minted. Nothing creates it for you; writing one would freeze today's defaults into your project.

```json
{
  "schema": "skailr.expert-config/v1",
  "gate_mode": "soft",
  "auto_mint": true,
  "roster_cap": 7,
  "mint_threshold": 2
}
```

| Key | Default | Effect |
| --- | --- | --- |
| `gate_mode` | `soft` | `soft`: an expert `fail` is a recorded finding plus a heads-up and never halts. `hard`: a `fail` halts the orchestrator. |
| `auto_mint` | `true` | When `false`, T2 and T3 become no-ops. An explicit `/mint-expert` still mints. |
| `roster_cap` | `7` | Soft cap. Exceeding it posts a consolidation heads-up and never blocks a mint. |
| `mint_threshold` | `2` | Independent signals required before an auto-mint fires. |

Unknown keys are ignored. An out-of-enum `gate_mode` or unparseable JSON is a **usage error**, not a silent fallback: getting gate behavior wrong by typo is exactly the quiet failure that makes a gate decorative.

Keep the roster small. Seven is a soft ceiling, and two sharp bands beat five fuzzy ones, because nothing mechanically prevents two overlapping bands from both failing to match.

---

## Intair is optional

If `intair_get_schema` is available and `INTAIR_BASE_URL` is set, experts ground answers against the graph and record what their band learned. If it is unreachable, every mode completes fully offline: grounding falls back to profile `sources`, then `.claude/repo/orientation.md` and `findings.md`, then local `docs/`. The output carries one line saying so and nothing else.

**No expert capability is Intair-only.** Validation rule 15 enforces the floor: a profile whose every source is `kind: intair-node` is invalid, because an expert groundable only through optional infrastructure cannot function offline. Experts may *propose* additive schema changes and record the proposal id; a human approves over REST, and that route is unreachable from any tool an expert holds.

See [intair-seam.md](intair-seam.md).

---

## Worked example

The two experts actually minted on this repo, both `internal`: the depth for each is sourced entirely from paths in this repository, with no field-level `url` or `doc` source needed. (A `hybrid` mint would add `expert-scout` and a research artifact to the same nine steps; see Classifications above.)

```
/mint-expert skailr pack internal
/mint-expert intair seam internal
```

Both land as `maturity: provisional`, `gate: soft`, and can advise and co-author right away without blocking anything.

The resulting roster table, regenerated from frontmatter:

```markdown
| slug | name | classification | maturity | gate | route-when |
|---|---|---|---|---|---|
| intair-seam-expert | Intair Seam | internal | provisional | soft | Asks about reading from or writing to Intair, attribution shape, schema proposals, or how a playbook should degrade when Intair is unreachable. |
| skailr-pack-expert | Skailr Pack | internal | provisional | soft | Asks about how the skailr pack itself is structured, how roles/commands/skills are defined and wired, or how a change reaches Claude Code, Cursor, and consumer installs. |
```

And the frontmatter behind one of them:

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

Now a plain-chat question lands:

> How does a change to a role file reach a consumer's Cursor install?

Exactly one band covers it, so intake dispatches `expert` in `advise` mode with `slug: skailr-pack-expert`. The answer arrives in `.claude/tmp/ask.md`, citing `scripts/remirror.sh` and `install.sh` for the mirror-and-install path, with a leading line noting that this expert's depth is unreviewed because it is still `provisional`. Ask the same question with two overlapping bands on the roster and it falls through to the researcher instead, unchanged.

Later, `scripts/remirror.sh` changes. The next consult on `skailr-pack-expert` notices the cited path moved since `against_sha`, answers anyway, and posts a heads-up recommending a refresh. You run `/mint-expert revise skailr-pack-expert`, the profile is re-validated, the registry is regenerated, and one `revised` line is appended to the log. Once you have read enough of its answers to trust them, `/mint-expert promote skailr-pack-expert` makes it `established`; that is the only way it becomes eligible to gate bindingly, and only if you also set both gate settings to `hard`.

---

## Distribution and upgrade safety

The distinction that makes this safe to install repeatedly:

| | Ships with the pack | Lives in your project |
| --- | --- | --- |
| The mechanism | `.claude/agents/experts/`, `.claude/commands/mint-expert.md`, `.claude/skills/curate-expert/`, kernel schemas and templates under `.claude/program/schemas/`, `scripts/skailr/check-experts.mjs` | |
| The instances | | `.claude/experts/` in full: profiles, research, registry, config |

`install.sh` **never touches `.claude/experts/`**. That roster is accumulated project expertise owned by you, and an upgrade must leave it byte-identical.

The reverse also holds. `.claude/teams/registry.md` is copied fresh on install and regenerated by `scripts/remirror.sh`, so a live roster is never written into it; anything added there at runtime is destroyed on the next upgrade. The pointer section in that file is static, and the real roster is at `.claude/experts/registry.md`.

The roster is **not gitignored**. It is git-tracked, consumer-owned, and agent-mutated by design, so commit `.claude/experts/` the way you commit `.claude/repo/` after a confirmed baseline. That is also what makes an expert's depth survive a session, a teammate's clone, and a pack upgrade.

---

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
