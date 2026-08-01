---
name: cleanup-scoped-artifacts
description: Purge allowlisted build caches inside the agent's own Claude/Cursor worktree, and optionally retire that worktree after a successful complete run. Never touches the main checkout, sibling worktrees, or artifact roots.
---

# Skill: cleanup-scoped-artifacts

## When to use

| Who | When | Mode |
| --- | ---- | ---- |
| Build workers (`backend-engineer`, `frontend-engineer`, `data-engineer`) | After writing the final report, **before** `DONE:` | `purge` |
| Orchestrators (`/yolo`, `/ship-feature` via `/build-feature`, `/build-feature`, `/yolo-program`, `/build-program`, `/patch`) | After the run is `complete: true`, before the final user report | `purge` then `retire` |

For **program** orchestrators: run skill `archive-program-state` **before** this skill when the ledger is complete.

**Do not** run on `YIELD:`, blockers, incomplete `/continue-*`, or mid-phase checkpoints. Caches must survive resume.

## Commands

Always use the script. Never freestyle `rm -rf`.

```bash
node scripts/skailr/cleanup-scoped.mjs dry-run
node scripts/skailr/cleanup-scoped.mjs purge
node scripts/skailr/cleanup-scoped.mjs retire
```

Optional: set `CLEANUP_ROOT=<dir>` to a subdirectory **inside** the current agent worktree (still allowlist-gated). Omit for the whole worktree root.

## What purge does

1. Resolve the git worktree toplevel (`git rev-parse --show-toplevel`).
2. If that path is **not** under `.claude/worktrees/<id>/` → **no-op success** (shared main checkout; leave `target/` / `node_modules` alone).
3. If it is the **current** agent worktree → delete only allowlisted cache directory names under that root:
   - `target/`, `node_modules/`, `.venv/`, `venv/`, `.next/`, `dist/`, `build/`, `coverage/`, `__pycache__/`, `.pytest_cache/`, `.turbo/`, `.vite/`
4. Print what was deleted (or would be, for `dry-run`).

## What retire does

Orchestrator-only, after a successful complete run:

1. Same isolation check as purge.
2. If not an agent worktree → no-op success.
3. If it is → `git worktree remove --force` **this** worktree only.
4. Never removes sibling `.claude/worktrees/*` or the main checkout.

Prefer `purge` then `retire` so free space lands before the tree disappears.

## Deny forever

The script must refuse (non-zero) if asked to touch:

- Paths outside the own agent worktree root
- Sibling worktrees
- `$ARTIFACT_ROOT`, `.claude/tmp`, `.claude/program`, `.claude/repo`, `.claude/experts`
- `data/`, `.env*`, credentials, `.git/`

## Yield

Skill `write-handoff-and-yield`: **never** call purge or retire on yield. Resume needs the caches.
