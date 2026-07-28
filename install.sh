#!/usr/bin/env bash
# Install skailr-agents (.claude + .cursor trees + scripts/skills) into a target project.
# Usage: ./install.sh /path/to/target/project [--claude-only|--cursor-only]

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./install.sh <target-project-path> [--claude-only|--cursor-only]

Copies the packaged agent library into a project:
  .claude/agents/  .claude/commands/  .claude/teams/  .claude/skills/
  .claude/program/schemas/  .claude/settings.skailr.json
  scripts/skailr/  scripts/hooks/
  .cursor/rules/   .cursor/commands/
  Creates .claude/tmp/ and .claude/program/
  Appends ignore rules if missing

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
  mkdir -p "$TARGET/.claude/agents/content" \
           "$TARGET/.claude/agents/legal" \
           "$TARGET/.claude/agents/pm" \
           "$TARGET/.claude/commands" \
           "$TARGET/.claude/teams" \
           "$TARGET/.claude/skills" \
           "$TARGET/.claude/tmp" \
           "$TARGET/.claude/program/channels" \
           "$TARGET/.claude/program/schemas"

  for f in "$SCRIPT_DIR"/.claude/agents/*.md; do
    cp "$f" "$TARGET/.claude/agents/"
    echo "  + .claude/agents/$(basename "$f")"
  done
  for team in content legal pm; do
    for f in "$SCRIPT_DIR"/.claude/agents/"$team"/*.md; do
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

  if [[ -f "$SCRIPT_DIR/.claude/settings.skailr.json" ]]; then
    cp "$SCRIPT_DIR/.claude/settings.skailr.json" "$TARGET/.claude/settings.skailr.json"
    echo "  + .claude/settings.skailr.json"
  fi

  if [[ -f "$SCRIPT_DIR/.claude/model-routing.json" ]]; then
    cp "$SCRIPT_DIR/.claude/model-routing.json" "$TARGET/.claude/model-routing.json"
    echo "  + .claude/model-routing.json"
  fi

  [[ -f "$TARGET/.claude/tmp/.gitkeep" ]] || touch "$TARGET/.claude/tmp/.gitkeep"
  [[ -f "$TARGET/.claude/program/.gitkeep" ]] || touch "$TARGET/.claude/program/.gitkeep"
  echo "  + .claude/tmp/ .claude/program/"
}

PACKAGED_RULES=(
  architect backend-engineer content-editor content-lead content-strategist
  content-writer data-engineer e2e-verifier frontend-engineer integration-verifier
  program-architect program-documenter program-validator researcher story-writer
  validator registry portfolio-architect initiative-lead
  legal-lead legal-analyst compliance-reviewer legal-validator
  pm-lead pm-planner risk-analyst status-reporter
)
PACKAGED_COMMANDS=(
  ship-feature build-feature continue-feature yolo
  discover plan-program build-program continue-program yolo-program
  discover-portfolio plan-portfolio status-portfolio
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
    "!.claude/program/schemas/"
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

append_gitignore
echo "Done."
