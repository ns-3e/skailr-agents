---
name: route-intake
description: Classify a plain-chat user ask into expert advise-mode, researcher ask-mode, /map-repo, /patch, /yolo, or /yolo-program. Use when no slash command is active and skailr intake applies.
---

# Skill: route-intake

## When to use

Before acting on a plain-chat message in a repo with skailr installed, when no skailr slash command is driving the turn. Authoritative short rules: `.claude/intake.md`.

## Procedure

1. **Command / resume check** (from `.claude/intake.md`). If either applies, stop classifying.
2. **Expert band check** — only for asks that are questions (no code change requested). Read the Roster table in `.claude/experts/registry.md` and apply the ambiguity guard below. Exactly one match routes to `expert` advise mode; anything else falls through to step 3. A missing registry is an empty roster, not an error.
3. **Pick exactly one route** using the heuristics below. Prefer the *smaller* path when uncertain between patch and feature; prefer `/yolo-program` over `/yolo` when the ask clearly spans multiple independent subsystems. Prefer `/map-repo` when the ask is clearly a whole-repo baseline (not a single-path question).
4. **Execute** that route immediately (Task or load the command file). Do not ask the user which command to run unless the ask is empty or contradictory.

## Heuristics

### Question in one expert's band → `expert` (advise mode)

Checked **before** researcher ask mode, and only for asks that request no code change.

Read `.claude/experts/registry.md` and match the ask against each roster row's `route-when`. Do **not** open a profile to decide; the roster table is the whole routing surface.

The guard, all four required:

| Condition | If it fails |
| --------- | ----------- |
| No slash command driving the turn | That command wins; stop classifying |
| Registry exists with a non-empty roster | Fall through (fresh projects have no roster) |
| **Exactly one** row's `route-when` covers the ask | 0 or 2+ matches → fall through to researcher ask mode |
| Matched row's `maturity` is not `deprecated` | Fall through |

Two-or-more matches falling through is deliberate: band overlap has no mechanical check, so picking between overlapping experts would be a guess dressed as depth. A generic grounded answer beats a confidently misrouted one.

Action: Task `expert` (always the role name `expert`, never the slug) with `mode: advise`, `slug: <matched slug>`, `question: <the ask verbatim>`. It writes `.claude/tmp/ask.md` with an added `## Expert` block. Summarize the Answer in chat and name the expert.

A `no-expert` return (missing, unparseable, or deprecated profile) means fall through to researcher ask mode silently. Never mint an expert from plain chat — minting has exactly three triggers and none of them is intake.

### Question → researcher (ask mode)

Signals: why / how / where / what / explain / does X exist / walk me through — and **no** request to change, add, fix, implement, or build. One-off “where is X?” stays here even on an unmapped repo.

This is the default for every question that did not match exactly one expert band, including projects with no roster at all. Experts add depth on top of this route; they never replace it.

Action: Task `researcher` with ask-mode instructions (output `.claude/tmp/ask.md`). Parent summarizes the answer in chat.

### Brownfield baseline → `/map-repo`

Signals: map this repo / onboard skailr / brownfield / baseline the codebase / audit this repo for gaps / what’s in this repo (with intent to inventory and backlog, not answer one fact).

Action: Execute `.claude/commands/map-repo.md` as `/map-repo` (optional focus args). Incomplete `.claude/repo/progress.md` + continue/resume → re-enter `/map-repo`, not a fresh patch.

### Small change → `/patch`

Signals: bug, typo, fix, tweak, adjust, rename one symbol, “make button blue”, one endpoint behavior change, localized regression, copy change in one place.

Thresholds that **still** stay on `/patch`:

- Touches one concern (backend-only or frontend-only) or a tight pair of files
- No new user journey / no new major entity
- Existing story/spec ACs may need a surgical edit, not a new story

Escalate **out** of `/patch` (re-route) if during patch the size gate fails.

### One feature → `/yolo`

Signals: “add the ability to…”, invite flow, new settings page with API, multi-file vertical slice, several acceptance criteria, new domain object with UI + API.

Not a whole product — one shippable story.

### Whole app / program → `/yolo-program`

Signals: greenfield product, MVP with several subsystems, billing + portal + admin, “build me an app that…”, unclear large scope that needs decomposition and contracts.

## Ambiguity

| Situation | Choose |
| --------- | ------ |
| Fix vs small feature unclear | `/patch`; size-gate inside `/patch` may re-route to `/yolo` |
| Feature vs whole app unclear | `/yolo-program` if ≥2 independent workstreams likely; else `/yolo` |
| Question that implies a fix (“why is X broken?”) | Ask mode first; if user then asks to fix, `/patch` |
| “What’s in this repo?” as a one-off Q vs full baseline | One-off → ask mode; inventory/backlog/onboard → `/map-repo` |
| User names a gated command | That command wins |
| Two experts' bands both plausibly cover the ask | Researcher ask mode (the ambiguity guard; do not pick one) |
| Ask is in an expert's band **and** requests a code change | The build route wins (`/patch` / `/yolo` / `/yolo-program`); that command consults the expert itself |

## Do not

- Start `/ship-feature` or `/discover` from plain-chat auto-routing (YOLO paths only unless the user asked for gates; `/map-repo` is the exception for brownfield baseline)
- Freestyle multi-file builds outside `/patch` / `/yolo` / `/yolo-program` / `/map-repo` (map-repo does not build)
- Re-triage mid-command
- Mint, revise, or retire an expert from intake — plain chat consults the roster, it never writes to it
- Dispatch an expert by its slug as a role name, or load more than one profile in a consult
- Treat a missing `.claude/experts/` as a problem to report; it is the normal state of most projects
