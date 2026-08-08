# RETRACTED — 2026-08-08

This campaign's headline numbers are **not a valid capability comparison** and
must not be cited as one. Kept in place (rather than deleted) as the honest
record of what happened and why.

## What's wrong

The `skailr` arm's runs for `feature-api-keys` and `program-rbac` both show:

- `termination_reason: "finish"` (the session ended cleanly, not a crash/timeout)
- `trajectory.tool_calls: 0`
- `code.diff_bytes: 0`
- `skailr_diagnostics.agents_spawned: 0`
- `time.wall_clock_s: ~30` (vs. the baseline arm's 400+ seconds on the same task)

That is a **broken invocation**, not a real attempt: the agent made ~10 model
turns of pure text and stopped without touching a file.

## Root cause

`bench/tasks/feature-api-keys.yaml` and `program-rbac.yaml` used a plain-language
prompt (e.g. *"Add organization-scoped API keys..."*) with no explicit slash
command. That relies on this repo's own `CLAUDE.md` intake-routing skill to
self-route to a build path — and that skill's routing table includes
confirmation gates (e.g. the "unmapped brownfield" tie-breaker: *"offer
`/map-repo` first... build immediately if declined"*) that expect a human
reply. In Claude Code's headless `-p` mode (which is how the bench harness
invokes the CLI) there is no second turn to answer with — the model asks its
question and the session ends, with zero tool calls.

`patch-webhook`'s skailr-arm run is a milder version of the same problem: it
did edit 3 files (a real attempt), but bypassed the `/patch` command's
mandated engineer-dispatch discipline entirely, since nothing ever told it to
invoke `/patch` — it just used its own judgment directly.

## Fix

`bench/tasks/*.yaml` now hard-code the intended slash command
(`/yolo`, `/yolo-program`, `/patch`) at the top of the prompt itself, so the
task can never again depend on self-routing succeeding in a non-interactive
session. See `bench/README.md` → "Known issues" for the permanent record of
this failure mode, and `bench/src/report.mjs`'s new automatic "Warnings"
section, which now flags `tool_calls: 0` + `solve_rate: 0` rows like this one
so it can't silently ship again.

A corrected campaign, run against the fixed task prompts, replaces this one as
`latest.json`'s pointer once published.
