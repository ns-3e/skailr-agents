#!/usr/bin/env bash
# Install skailr-agents (.claude + .cursor trees) into a target project.
# Usage: ./install.sh /path/to/target/project [--claude-only|--cursor-only]

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./install.sh <target-project-path> [--claude-only|--cursor-only]

Copies the packaged agent library into a project:
  .claude/agents/  .claude/commands/  .claude/teams/
  .cursor/rules/   .cursor/commands/  (packaged roles/commands only)
  Creates .claude/tmp/ and .claude/program/
  Appends ignore rules if missing

Flags:
  --claude-only   Install only the .claude/ tree
  --cursor-only   Install only the .cursor/ mirror (still creates .claude/tmp + program + registry path expectations via .claude/teams if missing — prefer full install)
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

install_claude() {
  mkdir -p "$TARGET/.claude/agents/content" \
           "$TARGET/.claude/commands" \
           "$TARGET/.claude/teams" \
           "$TARGET/.claude/tmp" \
           "$TARGET/.claude/program/channels"

  # Agents
  for f in "$SCRIPT_DIR"/.claude/agents/*.md; do
    cp "$f" "$TARGET/.claude/agents/"
    echo "  + .claude/agents/$(basename "$f")"
  done
  for f in "$SCRIPT_DIR"/.claude/agents/content/*.md; do
    cp "$f" "$TARGET/.claude/agents/content/"
    echo "  + .claude/agents/content/$(basename "$f")"
  done
  # Commands
  for f in "$SCRIPT_DIR"/.claude/commands/*.md; do
    cp "$f" "$TARGET/.claude/commands/"
    echo "  + .claude/commands/$(basename "$f")"
  done
  # Registry
  cp "$SCRIPT_DIR/.claude/teams/registry.md" "$TARGET/.claude/teams/registry.md"
  echo "  + .claude/teams/registry.md"

  # Channel templates (tracked protocol + seeds)
  for f in PROTOCOL.md program.md feature.md; do
    cp "$SCRIPT_DIR/.claude/program/channels/$f" "$TARGET/.claude/program/channels/$f"
    echo "  + .claude/program/channels/$f"
  done

  # Working dirs
  [[ -f "$TARGET/.claude/tmp/.gitkeep" ]] || touch "$TARGET/.claude/tmp/.gitkeep"
  [[ -f "$TARGET/.claude/program/.gitkeep" ]] || touch "$TARGET/.claude/program/.gitkeep"
  echo "  + .claude/tmp/ .claude/program/"
}

# Packaged Cursor artifacts only (do not wipe unrelated project rules)
PACKAGED_RULES=(
  architect backend-engineer content-editor content-lead content-strategist
  content-writer data-engineer e2e-verifier frontend-engineer integration-verifier
  program-architect program-documenter program-validator researcher story-writer
  validator registry
)
PACKAGED_COMMANDS=(ship-feature build-feature discover plan-program build-program)

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

  # Cursor registry pointer expects .claude/teams/registry.md — ensure it exists on cursor-only
  if [[ ! -f "$TARGET/.claude/teams/registry.md" ]]; then
    mkdir -p "$TARGET/.claude/teams"
    cp "$SCRIPT_DIR/.claude/teams/registry.md" "$TARGET/.claude/teams/registry.md"
    echo "  + .claude/teams/registry.md (needed by Cursor registry rule)"
  fi
  mkdir -p "$TARGET/.claude/tmp" "$TARGET/.claude/program"
  [[ -f "$TARGET/.claude/tmp/.gitkeep" ]] || touch "$TARGET/.claude/tmp/.gitkeep"
  [[ -f "$TARGET/.claude/program/.gitkeep" ]] || touch "$TARGET/.claude/program/.gitkeep"
}

append_gitignore() {
  local gi="$TARGET/.gitignore"
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
  )
  touch "$gi"
  # Migrate away from the old blanket ignore if present
  if grep -qxF ".claude/program/" "$gi" 2>/dev/null; then
    # portable delete of exact line
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

case "$MODE" in
  both)
    install_claude
    install_cursor
    ;;
  claude) install_claude ;;
  cursor) install_cursor ;;
esac

append_gitignore
echo "Done."
