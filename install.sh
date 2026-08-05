#!/usr/bin/env bash
# Install skailr-agents (.claude + .cursor trees + scripts/skills) into a target project.
# Usage: ./install.sh /path/to/target/project [--claude-only|--cursor-only]

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./install.sh <target-project-path> [--claude-only|--cursor-only]

Copies the packaged agent library into a project:
  .claude/agents/  .claude/commands/  .claude/teams/  .claude/skills/
  .claude/program/schemas/  .claude/settings.skailr.json  .claude/intake.md
  CLAUDE.md (plain-chat intake for Claude Code)
  scripts/skailr/  scripts/hooks/
  .cursor/rules/   .cursor/commands/
  Creates .claude/tmp/, .claude/program/, and .claude/repo/
  Appends ignore rules if missing

Never touches .claude/experts/. That roster is accumulated project expertise
owned by the consumer, and an upgrade must leave it byte-identical.

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

install_claude() {
  mkdir -p "$TARGET/.claude/agents" \
           "$TARGET/.claude/commands" \
           "$TARGET/.claude/teams" \
           "$TARGET/.claude/skills" \
           "$TARGET/.claude/tmp" \
           "$TARGET/.claude/repo" \
           "$TARGET/.claude/program/channels" \
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
  cp "$SCRIPT_DIR/.claude/teams/registry.md" "$TARGET/.claude/teams/registry.md"
  echo "  + .claude/teams/registry.md"

  if [[ -d "$SCRIPT_DIR/.claude/skills" ]]; then
    cp -R "$SCRIPT_DIR/.claude/skills/." "$TARGET/.claude/skills/"
    echo "  + .claude/skills/"
  fi

  for f in PROTOCOL.md program.md feature.md; do
    cp "$SCRIPT_DIR/.claude/program/channels/$f" "$TARGET/.claude/program/channels/$f"
    echo "  + .claude/program/channels/$f"
  done

  for f in "$SCRIPT_DIR"/.claude/program/schemas/*; do
    [[ -f "$f" ]] || continue
    cp "$f" "$TARGET/.claude/program/schemas/"
    echo "  + .claude/program/schemas/$(basename "$f")"
  done

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

  if [[ -f "$SCRIPT_DIR/.claude/model-routing.json" ]]; then
    cp "$SCRIPT_DIR/.claude/model-routing.json" "$TARGET/.claude/model-routing.json"
    echo "  + .claude/model-routing.json"
  fi

  if [[ -f "$SCRIPT_DIR/.claude/intake.md" ]]; then
    cp "$SCRIPT_DIR/.claude/intake.md" "$TARGET/.claude/intake.md"
    echo "  + .claude/intake.md"
  fi

  if [[ -f "$SCRIPT_DIR/CLAUDE.md" ]]; then
    cp "$SCRIPT_DIR/CLAUDE.md" "$TARGET/CLAUDE.md"
    echo "  + CLAUDE.md"
  fi

  [[ -f "$TARGET/.claude/tmp/.gitkeep" ]] || touch "$TARGET/.claude/tmp/.gitkeep"
  [[ -f "$TARGET/.claude/program/.gitkeep" ]] || touch "$TARGET/.claude/program/.gitkeep"
  [[ -f "$TARGET/.claude/repo/.gitkeep" ]] || touch "$TARGET/.claude/repo/.gitkeep"
  echo "  + .claude/tmp/ .claude/program/ .claude/repo/"
}

PACKAGED_RULES=(
  architect backend-engineer content-editor content-lead content-strategist
  content-writer data-engineer e2e-verifier frontend-engineer integration-verifier
  program-architect program-documenter program-validator researcher story-writer
  validator registry intake portfolio-architect initiative-lead
  legal-lead legal-analyst compliance-reviewer legal-validator
  pm-lead pm-planner risk-analyst status-reporter
  design-lead design-strategist designer design-reviewer
  mkt-lead mkt-strategist channel-planner mkt-analyst
  fin-lead fin-modeler fin-analyst fin-auditor
  expert expert-scout
)
PACKAGED_COMMANDS=(
  ship-feature build-feature continue-feature yolo patch
  discover plan-program build-program continue-program yolo-program map-repo
  discover-portfolio plan-portfolio status-portfolio
  mint-expert
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

  if [[ -f "$SCRIPT_DIR/.cursor/model-routing.md" ]]; then
    cp "$SCRIPT_DIR/.cursor/model-routing.md" "$TARGET/.cursor/model-routing.md"
    echo "  + .cursor/model-routing.md"
  fi

  if [[ ! -f "$TARGET/.claude/teams/registry.md" ]]; then
    mkdir -p "$TARGET/.claude/teams"
    cp "$SCRIPT_DIR/.claude/teams/registry.md" "$TARGET/.claude/teams/registry.md"
    echo "  + .claude/teams/registry.md (needed by Cursor registry rule)"
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

run_migrations
append_gitignore
assert_roster_untouched "$ROSTER_BEFORE"
echo "Done."
