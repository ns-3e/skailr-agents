#!/usr/bin/env bash
# Install skailr-agents (.claude + .cursor trees + scripts/skills) into a target project.
# Usage: ./install.sh /path/to/target/project [--claude-only|--cursor-only]

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./install.sh <target-project-path> [--claude-only|--cursor-only]

Copies the packaged agent library into a project:
  .claude/agents/  .claude/commands/  .claude/skills/
  .claude/program/schemas/  .claude/settings.json  .claude/settings.skailr.json  .claude/intake.md
  CLAUDE.md (plain-chat intake for Claude Code — only the marked intake zone is
    kept in sync; a project-owned conventions zone, if /map-repo has written one,
    survives every install/upgrade untouched)
  scripts/skailr/  scripts/hooks/
  .cursor/rules/   .cursor/commands/
  Creates .claude/tmp/, .claude/program/, .claude/repo/, and .skailr/
  Appends ignore rules if missing
  Retires pack-owned files shipped by skailr-agents 2.x and earlier (the 3.0
    thin-layer restructuring — see docs/DESIGN-3.0.md). Only exact pack-shipped
    paths are removed; consumer runtime and project files are never touched.

Never touches .claude/experts/. That roster is accumulated project expertise
owned by the consumer, and an upgrade must leave it byte-identical (3.0 no
longer reads it, but it remains the consumer's data).

Flags:
  --claude-only   Install only the .claude/ tree (+ scripts)
  --cursor-only   Install only the .cursor/ mirror
EOF
  exit 1
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET=""
MODE="both"

for arg in "$@"; do
  case "$arg" in
    --claude-only) MODE="claude" ;;
    --cursor-only) MODE="cursor" ;;
    -h|--help) usage ;;
    *)
      if [[ -z "$TARGET" ]]; then
        TARGET="$arg"
      else
        echo "Unexpected argument: $arg" >&2
        usage
      fi
      ;;
  esac
done

[[ -n "$TARGET" ]] || usage
TARGET="$(cd "$TARGET" 2>/dev/null && pwd)" || {
  mkdir -p "$TARGET"
  TARGET="$(cd "$TARGET" && pwd)"
}

echo "Installing skailr-agents → $TARGET (mode: $MODE)"

install_scripts() {
  mkdir -p "$TARGET/scripts/skailr" "$TARGET/scripts/hooks"
  for f in "$SCRIPT_DIR"/scripts/skailr/*.mjs; do
    cp "$f" "$TARGET/scripts/skailr/"
    echo "  + scripts/skailr/$(basename "$f")"
  done
  if [[ -f "$SCRIPT_DIR/scripts/hooks/pre-commit.sample" ]]; then
    cp "$SCRIPT_DIR/scripts/hooks/pre-commit.sample" "$TARGET/scripts/hooks/"
    echo "  + scripts/hooks/pre-commit.sample"
  fi
}

# CLAUDE.md has two independently-owned zones (full contract: skill
# maintain-claude-md) — a Skailr-owned intake block, kept in sync on every
# install/upgrade exactly as CLAUDE.md always has been, and a project-owned
# conventions block written later by /map-repo (never by this installer) that
# must survive an upgrade untouched. Same class of problem settings.skailr.json
# and .claude/experts/ already solve for their own files — a blind overwrite
# here would silently destroy accumulated project knowledge on the next
# install.sh run. Portable POSIX sed/awk only; no node/python dependency in the
# installer itself (see IMPROVEMENT-BACKLOG.md B-5 for why that's off the table).
install_claude_md() {
  local pack="$SCRIPT_DIR/CLAUDE.md" target="$TARGET/CLAUDE.md"
  [[ -f "$pack" ]] || return 0

  if [[ ! -f "$target" ]]; then
    cp "$pack" "$target"
    echo "  + CLAUDE.md"
    return 0
  fi

  if grep -q '<!-- skailr:intake:start -->' "$target" 2>/dev/null \
     && grep -q '<!-- skailr:intake:end -->' "$target" 2>/dev/null; then
    local pack_block tmp
    pack_block="$(mktemp)"
    tmp="$(mktemp)"
    sed -n '/<!-- skailr:intake:start -->/,/<!-- skailr:intake:end -->/p' "$pack" > "$pack_block"
    awk -v blockfile="$pack_block" '
      /<!-- skailr:intake:start -->/ {
        while ((getline bline < blockfile) > 0) print bline
        close(blockfile)
        skipping = 1
        next
      }
      skipping && /<!-- skailr:intake:end -->/ { skipping = 0; next }
      skipping { next }
      { print }
    ' "$target" > "$tmp"
    mv "$tmp" "$target"
    rm -f "$pack_block"
    echo "  = CLAUDE.md (intake zone refreshed; project conventions preserved)"
  else
    # No (complete) Skailr zone yet — first install over a human's own CLAUDE.md,
    # or an upgrade from before this marker existed. Append rather than guess at
    # or destroy unknown existing content.
    local tmp
    tmp="$(mktemp)"
    { cat "$target"; echo; echo; cat "$pack"; } > "$tmp"
    mv "$tmp" "$target"
    echo "  = CLAUDE.md (intake block appended; existing content preserved)"
  fi
}

install_claude() {
  mkdir -p "$TARGET/.claude/agents" \
           "$TARGET/.claude/commands" \
           "$TARGET/.claude/skills" \
           "$TARGET/.claude/tmp" \
           "$TARGET/.claude/repo" \
           "$TARGET/.claude/program/schemas"

  for team_dir in "$SCRIPT_DIR"/.claude/agents/*/; do
    [[ -d "$team_dir" ]] || continue
    team=$(basename "$team_dir")
    mkdir -p "$TARGET/.claude/agents/$team"
    for f in "$team_dir"*.md; do
      [[ -f "$f" ]] || continue
      cp "$f" "$TARGET/.claude/agents/$team/"
      echo "  + .claude/agents/$team/$(basename "$f")"
    done
  done
  for f in "$SCRIPT_DIR"/.claude/commands/*.md; do
    cp "$f" "$TARGET/.claude/commands/"
    echo "  + .claude/commands/$(basename "$f")"
  done
  if [[ -d "$SCRIPT_DIR/.claude/skills" ]]; then
    cp -R "$SCRIPT_DIR/.claude/skills/." "$TARGET/.claude/skills/"
    echo "  + .claude/skills/"
  fi

  for f in "$SCRIPT_DIR"/.claude/program/schemas/*; do
    [[ -f "$f" ]] || continue
    cp "$f" "$TARGET/.claude/program/schemas/"
    echo "  + .claude/program/schemas/$(basename "$f")"
  done

  # settings.json carries the pack's hooks — the ONLY settings filename Claude Code
  # actually auto-loads (.claude/settings.json / .claude/settings.local.json /
  # ~/.claude/settings.json; confirmed against the official docs 2026-08-08 after
  # discovering hooks in settings.skailr.json had never fired in any run). Always
  # kept in sync with the pack, same as CLAUDE.md and model-routing.json below —
  # consumers who want their own hooks on top should use settings.local.json
  # (gitignored, higher precedence, Claude Code merges it automatically) rather than
  # hand-editing this file, which the next install/update will overwrite.
  if [[ -f "$SCRIPT_DIR/.claude/settings.json" ]]; then
    cp "$SCRIPT_DIR/.claude/settings.json" "$TARGET/.claude/settings.json"
    echo "  + .claude/settings.json"
  fi

  # Copy settings.skailr.json only if absent: it may carry a consumer's telemetry
  # enable/disable choice (optional `telemetry.enabled` key), which a blind overwrite
  # on upgrade would silently reset. Preserve consumer intent (AC-26).
  if [[ -f "$SCRIPT_DIR/.claude/settings.skailr.json" ]]; then
    if [[ -f "$TARGET/.claude/settings.skailr.json" ]]; then
      echo "  = .claude/settings.skailr.json exists (preserved; consumer telemetry choice kept)"
    else
      cp "$SCRIPT_DIR/.claude/settings.skailr.json" "$TARGET/.claude/settings.skailr.json"
      echo "  + .claude/settings.skailr.json"
    fi
  fi

  if [[ -f "$SCRIPT_DIR/.claude/intake.md" ]]; then
    cp "$SCRIPT_DIR/.claude/intake.md" "$TARGET/.claude/intake.md"
    echo "  + .claude/intake.md"
  fi

  install_claude_md

  [[ -f "$TARGET/.claude/tmp/.gitkeep" ]] || touch "$TARGET/.claude/tmp/.gitkeep"
  [[ -f "$TARGET/.claude/program/.gitkeep" ]] || touch "$TARGET/.claude/program/.gitkeep"
  [[ -f "$TARGET/.claude/repo/.gitkeep" ]] || touch "$TARGET/.claude/repo/.gitkeep"
  echo "  + .claude/tmp/ .claude/program/ .claude/repo/"

  # Telemetry fallback dir: the emitter's isEnabled() checks for it when
  # settings.skailr.json carries no explicit telemetry.enabled. Left empty and
  # gitignored; no .gitkeep — git cannot track an empty dir and .skailr/ is ignored.
  mkdir -p "$TARGET/.skailr"
  echo "  + .skailr/"
}

PACKAGED_RULES=(
  engineer verifier researcher program-architect intake
)
PACKAGED_COMMANDS=(
  patch build program map-repo yolo yolo-program
)

install_cursor() {
  mkdir -p "$TARGET/.cursor/rules" "$TARGET/.cursor/commands"

  for name in "${PACKAGED_RULES[@]}"; do
    src="$SCRIPT_DIR/.cursor/rules/${name}.mdc"
    if [[ -f "$src" ]]; then
      cp "$src" "$TARGET/.cursor/rules/${name}.mdc"
      echo "  + .cursor/rules/${name}.mdc"
    fi
  done

  for name in "${PACKAGED_COMMANDS[@]}"; do
    src="$SCRIPT_DIR/.cursor/commands/${name}.md"
    if [[ -f "$src" ]]; then
      cp "$src" "$TARGET/.cursor/commands/${name}.md"
      echo "  + .cursor/commands/${name}.md"
    fi
  done

  if [[ -f "$SCRIPT_DIR/.cursor/README.md" ]]; then
    cp "$SCRIPT_DIR/.cursor/README.md" "$TARGET/.cursor/README.md"
    echo "  + .cursor/README.md"
  fi

  if [[ -f "$SCRIPT_DIR/.claude/intake.md" ]] && [[ ! -f "$TARGET/.claude/intake.md" ]]; then
    cp "$SCRIPT_DIR/.claude/intake.md" "$TARGET/.claude/intake.md"
    echo "  + .claude/intake.md (needed by Cursor intake rule)"
  fi
  mkdir -p "$TARGET/.claude/tmp" "$TARGET/.claude/program" "$TARGET/.claude/repo"
  [[ -f "$TARGET/.claude/tmp/.gitkeep" ]] || touch "$TARGET/.claude/tmp/.gitkeep"
  [[ -f "$TARGET/.claude/program/.gitkeep" ]] || touch "$TARGET/.claude/program/.gitkeep"
  [[ -f "$TARGET/.claude/repo/.gitkeep" ]] || touch "$TARGET/.claude/repo/.gitkeep"
}

# DOC: 3.0 retire phase. skailr-agents ≤2.x shipped an orchestration framework
# (40 agents, 15 commands, 26 skills, SQLite state, channels, telemetry, model
# routing) that 3.0 removed — see docs/DESIGN-3.0.md. On upgrade, those
# pack-owned files must not linger in the target: stale agents/commands remain
# invocable and stale scripts are referenced by the old settings.json hooks.
# Only EXACT paths the ≤2.x pack itself shipped are listed here. Consumer data
# (.claude/experts/, program runtime like ledger.md/contracts, .claude/tmp/,
# the CLAUDE.md conventions zone) is never listed and never touched.
RETIRED_DIRS=(
  .claude/agents/content .claude/agents/design .claude/agents/finance
  .claude/agents/legal .claude/agents/marketing .claude/agents/pm
  .claude/agents/portfolio .claude/agents/experts
  .claude/teams .claude/program/channels
)
RETIRED_SKILLS=(
  archive-program-state check-ownership cleanup-scoped-artifacts
  compile-status-digest consult-or-mint curate-expert drain-exception-inbox
  emit-stubs emit-telemetry fit-test freeze-contract reconcile-model
  resume-from-feature-progress resume-from-ledger route-channels route-intake
  route-models run-feature-queue run-gated-pipeline run-ticket-board
  sync-lineage trace-requirement track-phase write-handoff-and-yield
)
RETIRED_FILES=(
  .claude/agents/engineering/architect.md
  .claude/agents/engineering/backend-engineer.md
  .claude/agents/engineering/data-engineer.md
  .claude/agents/engineering/e2e-verifier.md
  .claude/agents/engineering/frontend-engineer.md
  .claude/agents/engineering/story-writer.md
  .claude/agents/engineering/validator.md
  .claude/agents/program/integration-verifier.md
  .claude/agents/program/program-documenter.md
  .claude/agents/program/program-validator.md
  .claude/commands/ship-feature.md .claude/commands/build-feature.md
  .claude/commands/continue-feature.md .claude/commands/continue-program.md
  .claude/commands/discover.md .claude/commands/plan-program.md
  .claude/commands/build-program.md .claude/commands/discover-portfolio.md
  .claude/commands/plan-portfolio.md .claude/commands/status-portfolio.md
  .claude/commands/mint-expert.md
  .claude/model-routing.json
  .claude/program/schemas/artboard.template.md
  .claude/program/schemas/backlog.template.md
  .claude/program/schemas/board.template.md
  .claude/program/schemas/budget-ledger.template.md
  .claude/program/schemas/completion-report.template.md
  .claude/program/schemas/contract.template.md
  .claude/program/schemas/design-brief.template.md
  .claude/program/schemas/dispatch-packet.template.md
  .claude/program/schemas/expert-config.schema.json
  .claude/program/schemas/expert-profile.template.md
  .claude/program/schemas/expert-registry.template.md
  .claude/program/schemas/expert-research.template.md
  .claude/program/schemas/expert.schema.json
  .claude/program/schemas/feature-progress.template.md
  .claude/program/schemas/field-guide.template.md
  .claude/program/schemas/handoff.template.md
  .claude/program/schemas/ledger.template.md
  .claude/program/schemas/map-repo-progress.template.md
  .claude/program/schemas/map-report.template.md
  .claude/program/schemas/patch-report.template.md
  .claude/program/schemas/telemetry-event.schema.json
  .claude/program/schemas/ticket.template.md
  .claude/program/schemas/ui-spec.template.md
  scripts/skailr/apply-model-routing.mjs scripts/skailr/archive-program.mjs
  scripts/skailr/check-agent-tools.mjs scripts/skailr/check-blocks.mjs
  scripts/skailr/check-contracts.mjs scripts/skailr/check-experts.mjs
  scripts/skailr/check-phase-tracking.mjs scripts/skailr/cleanup-scoped.mjs
  scripts/skailr/db.mjs scripts/skailr/lib/db.mjs scripts/skailr/lib/render.mjs
  scripts/skailr/emit-stubs.mjs scripts/skailr/emit-telemetry.mjs
  scripts/skailr/feature-status.mjs scripts/skailr/ledger-status.mjs
  scripts/skailr/rotate-channels.mjs scripts/skailr/route-prompt.mjs
  scripts/skailr/status.mjs scripts/skailr/telemetry-smoke.mjs
  scripts/skailr/ticket-status.mjs scripts/skailr/validate-channels.mjs
  .cursor/model-routing.md
)
RETIRED_CURSOR_RULES=(
  architect backend-engineer content-editor content-lead content-strategist
  content-writer data-engineer e2e-verifier frontend-engineer integration-verifier
  program-documenter program-validator story-writer validator registry
  portfolio-architect initiative-lead
  legal-lead legal-analyst compliance-reviewer legal-validator
  pm-lead pm-planner risk-analyst status-reporter
  design-lead design-strategist designer design-reviewer
  mkt-lead mkt-strategist channel-planner mkt-analyst
  fin-lead fin-modeler fin-analyst fin-auditor
  expert expert-scout
)
RETIRED_CURSOR_COMMANDS=(
  ship-feature build-feature continue-feature discover plan-program
  build-program continue-program discover-portfolio plan-portfolio
  status-portfolio mint-expert
)

retire_legacy() {
  local removed=0 p
  for d in "${RETIRED_DIRS[@]}"; do
    if [[ -d "$TARGET/$d" ]]; then rm -rf "$TARGET/${d:?}"; removed=$((removed+1)); fi
  done
  for s in "${RETIRED_SKILLS[@]}"; do
    if [[ -d "$TARGET/.claude/skills/$s" ]]; then rm -rf "$TARGET/.claude/skills/${s:?}"; removed=$((removed+1)); fi
  done
  for p in "${RETIRED_FILES[@]}"; do
    if [[ -f "$TARGET/$p" ]]; then rm -f "$TARGET/$p"; removed=$((removed+1)); fi
  done
  for r in "${RETIRED_CURSOR_RULES[@]}"; do
    if [[ -f "$TARGET/.cursor/rules/$r.mdc" ]]; then rm -f "$TARGET/.cursor/rules/$r.mdc"; removed=$((removed+1)); fi
  done
  for c in "${RETIRED_CURSOR_COMMANDS[@]}"; do
    if [[ -f "$TARGET/.cursor/commands/$c.md" ]]; then rm -f "$TARGET/.cursor/commands/$c.md"; removed=$((removed+1)); fi
  done
  # Empty lib/ dir left behind after its two scripts retire
  rmdir "$TARGET/scripts/skailr/lib" 2>/dev/null || true
  if [[ "$removed" -gt 0 ]]; then
    echo "  - retired $removed pre-3.0 pack file(s)/dir(s) (see docs/DESIGN-3.0.md)"
  fi
}

# DOC: .claude/experts/ is a consumer runtime artifact, never a pack artifact. No install
# path may create, copy, or modify it; it is created lazily on first `/mint-expert`. This
# fingerprint is a defensive assertion only: if a future edit ever starts touching the
# roster, the install fails loudly instead of silently destroying project expertise.
HASH_CMD=""
for c in shasum sha1sum md5sum cksum; do
  if command -v "$c" >/dev/null 2>&1; then HASH_CMD="$c"; break; fi
done

roster_fingerprint() {
  local dir="$TARGET/.claude/experts" f acc=""
  [[ -d "$dir" ]] || { printf 'absent'; return 0; }
  # No hasher available: skip the assertion rather than fail the install. The guarantee rests
  # on no copy operation naming this path; the fingerprint only makes a regression loud.
  [[ -n "$HASH_CMD" ]] || { printf 'unhashed'; return 0; }
  while IFS= read -r f; do
    acc+="${f#"$TARGET/"}:$("$HASH_CMD" "$f" | awk '{print $1}')"$'\n'
  done < <(find "$dir" -type f | LC_ALL=C sort)
  printf '%s' "$acc" | "$HASH_CMD" | awk '{print $1}'
}

assert_roster_untouched() {
  local before="$1" after
  after="$(roster_fingerprint)"
  if [[ "$before" != "$after" ]]; then
    echo "FATAL: install modified .claude/experts/ (roster fingerprint changed)." >&2
    echo "       The consumer roster must survive an upgrade byte-identical." >&2
    exit 1
  fi
  case "$before" in
    absent)   echo "  = .claude/experts/ not created (consumer roster, minted on demand)" ;;
    unhashed) echo "  = .claude/experts/ not copied (no hasher; roster left alone)" ;;
    *)        echo "  = .claude/experts/ untouched (roster preserved across upgrade)" ;;
  esac
}

# Ordered list of migration ids implemented by scripts/skailr/migrate.mjs. All logic lives
# in the runner; this array is only the ordered call list. It is asserted identical to the
# runner's exports and to install.ps1's $SkailrMigrations by scripts/skailr/doctor.mjs, so
# ids must stay lowercase-hyphen (/^[a-z][a-z0-9-]*$/) and the literal must contain no
# parentheses beyond its own delimiters — doctor's extractor drops anything else.
SKAILR_MIGRATIONS=(
  telemetry-enabled-default
  autoupdate-enabled-default
)

# Additive-only upgrade migrations. Runs AFTER the copy phase (so it sees final on-disk
# state) and BEFORE assert_roster_untouched (so a roster-touching migration fails loudly).
# Never fatal: the runner reports and exits 0 for unparseable/unwritable files, and `|| true`
# covers even a usage error, because `set -euo pipefail` must not abort an install here.
run_migrations() {
  [[ "$MODE" == "cursor" ]] && return 0   # .claude/ is not managed in cursor-only mode
  if ! command -v node >/dev/null 2>&1; then
    echo "  ! migrations skipped (node not on PATH; install continues)"
    return 0
  fi
  if [[ -z "$MIGRATE_PRE_EXISTING" ]]; then
    echo "  = migrations skipped (fresh install; shipped defaults already current)"
    return 0
  fi
  for id in "${SKAILR_MIGRATIONS[@]}"; do
    # Invoked from $SCRIPT_DIR (the pack), never from $TARGET: the target's copy of the
    # runner may be an older version that predates this migration.
    node "$SCRIPT_DIR/scripts/skailr/migrate.mjs" --target "$TARGET" --only "$id" \
      --pre-existing "$MIGRATE_PRE_EXISTING" || true
  done
}

# Refresh $TARGET/.skailr/installed-version.json on EVERY claude-mode install/upgrade — it is
# the "installed" side of the update check and must track the pack, unlike autoUpdate.enabled
# (user-editable, copy-once-if-absent). Runs unconditionally, not gated on MIGRATE_PRE_EXISTING:
# a fresh install needs the marker too. Never fatal — the runner always exits 0 and `|| true`
# covers even a usage error, because `set -euo pipefail` must not abort an install here.
record_install() {
  [[ "$MODE" == "cursor" ]] && return 0   # .claude/ is not managed in cursor-only mode
  if ! command -v node >/dev/null 2>&1; then
    echo "  ! installed-version marker skipped (node not on PATH; install continues)"
    return 0
  fi
  # Invoked from $SCRIPT_DIR (the pack), never from $TARGET: the version stamped must be the
  # pack's own package.json version, and the target's copy may predate this script entirely.
  node "$SCRIPT_DIR/scripts/skailr/check-update.mjs" --record-install --target "$TARGET" || true
}

append_gitignore() {
  local gi="$TARGET/.gitignore"
  # Deliberately absent: .claude/experts/. The roster is git-tracked in consumer projects,
  # so it must never be ignored, despite the .claude/program/* and .claude/tmp/* entries
  # below suggesting that ".claude working directories get ignored".
  local lines=(
    ".DS_Store"
    ".claude/tmp/*"
    "!.claude/tmp/.gitkeep"
    ".claude/program/*"
    "!.claude/program/.gitkeep"
    "!.claude/program/channels/"
    ".claude/program/channels/*"
    "!.claude/program/channels/PROTOCOL.md"
    "!.claude/program/channels/program.md"
    "!.claude/program/channels/feature.md"
    "!.claude/program/schemas/"
    ".claude/skailr.db"
    ".claude/skailr.db-journal"
    ".claude/skailr.db-wal"
    ".claude/skailr.db-shm"
    ".skailr/"
    "node_modules/"
  )
  touch "$gi"
  if grep -qxF ".claude/program/" "$gi" 2>/dev/null; then
    local tmp
    tmp="$(mktemp)"
    grep -vxF ".claude/program/" "$gi" > "$tmp" || true
    mv "$tmp" "$gi"
    echo "  ~ .gitignore removed obsolete .claude/program/"
  fi
  for line in "${lines[@]}"; do
    if grep -qxF "$line" "$gi" 2>/dev/null; then
      echo "  = .gitignore already has $line"
    else
      printf '%s\n' "$line" >> "$gi"
      echo "  + .gitignore ← $line"
    fi
  done
}

ROSTER_BEFORE="$(roster_fingerprint)"

# Snapshot which migration targets existed BEFORE the copy phase. A file the copy phase
# creates in this same run already carries current shipped defaults, so migrating it would
# be a redundant double-write; only genuinely pre-existing consumer files are candidates.
# (written as an `if`, not `[[ … ]] && …`: the latter returns 1 when absent and `set -e`
# would abort the install on the ordinary fresh-install path.)
MIGRATE_PRE_EXISTING=""
if [[ -f "$TARGET/.claude/settings.skailr.json" ]]; then
  MIGRATE_PRE_EXISTING=".claude/settings.skailr.json"
fi

case "$MODE" in
  both)
    install_claude
    install_cursor
    install_scripts
    ;;
  claude)
    install_claude
    install_scripts
    ;;
  cursor) install_cursor ;;
esac

retire_legacy
run_migrations
record_install
append_gitignore
assert_roster_untouched "$ROSTER_BEFORE"
echo "Done."
