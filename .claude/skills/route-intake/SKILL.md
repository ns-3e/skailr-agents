---
name: route-intake
description: Classify a plain-chat user ask into researcher ask-mode, /patch, /yolo, or /yolo-program. Use when no slash command is active and skailr intake applies.
---

# Skill: route-intake

## When to use

Before acting on a plain-chat message in a repo with skailr installed, when no skailr slash command is driving the turn. Authoritative short rules: `.claude/intake.md`.

## Procedure

1. **Command / resume check** (from `.claude/intake.md`). If either applies, stop classifying.
2. **Pick exactly one route** using the heuristics below. Prefer the *smaller* path when uncertain between patch and feature; prefer `/yolo-program` over `/yolo` when the ask clearly spans multiple independent subsystems.
3. **Execute** that route immediately (Task or load the command file). Do not ask the user which command to run unless the ask is empty or contradictory.

## Heuristics

### Question → researcher (ask mode)

Signals: why / how / where / what / explain / does X exist / walk me through — and **no** request to change, add, fix, implement, or build.

Action: Task `researcher` with ask-mode instructions (output `.claude/tmp/ask.md`). Parent summarizes the answer in chat.

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
| User names a gated command | That command wins |

## Do not

- Start `/ship-feature` or `/discover` from plain-chat auto-routing (YOLO paths only unless the user asked for gates)
- Freestyle multi-file builds outside `/patch` / `/yolo` / `/yolo-program`
- Re-triage mid-command
