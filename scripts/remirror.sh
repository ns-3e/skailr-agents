#!/usr/bin/env bash
# Regenerate .cursor/ mirror and manifest.json from authoritative .claude/ tree.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

python3 <<'PY'
import json
from pathlib import Path

ROOT = Path(".").resolve()
CLAUDE_AGENTS = ROOT / ".claude" / "agents"
CLAUDE_CMDS = ROOT / ".claude" / "commands"
CURSOR_RULES = ROOT / ".cursor" / "rules"
CURSOR_CMDS = ROOT / ".cursor" / "commands"
CURSOR_RULES.mkdir(parents=True, exist_ok=True)
CURSOR_CMDS.mkdir(parents=True, exist_ok=True)

CHANNEL_WRITE_ONLY = {
    "researcher": "Read, Grep, Glob, Write — Write solely to append channel messages; never write/edit any other file.",
    "validator": "Read, Grep, Glob, Bash, Write — Write solely to append channel messages; never edit application code.",
    "program-validator": "Read, Grep, Glob, Bash, Write — Write solely to append channel messages; never edit application code.",
    "content-editor": "Write is for the audit report and channel appends; do not rewrite draft content as an author.",
    "legal-validator": "Read, Grep, Glob, Bash, Write — Write solely to validation report and channel appends.",
}

def parse_frontmatter(text):
    if not text.startswith("---"):
        return {}, text
    end = text.find("\n---", 3)
    if end == -1:
        return {}, text
    fm_raw = text[3:end].strip()
    body = text[end + 4:].lstrip("\n")
    fm = {}
    for line in fm_raw.splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            fm[k.strip()] = v.strip()
    return fm, body

agent_files = []
agent_files += list(CLAUDE_AGENTS.glob("*.md"))
for sub in ("content", "legal", "pm"):
    d = CLAUDE_AGENTS / sub
    if d.exists():
        agent_files += list(d.glob("*.md"))

for src in sorted(agent_files):
    text = src.read_text()
    fm, body = parse_frontmatter(text)
    name = fm.get("name", src.stem)
    desc = fm.get("description", name)
    tools = fm.get("tools", "")
    restriction_note = ""
    if name in CHANNEL_WRITE_ONLY:
        restriction_note = (
            f"<!-- Cursor limitation: Claude Code tools are [{tools}]. "
            f"Cursor rules cannot enforce tool allowlists; honor the restriction in prose below. -->\n\n"
            f"**Tool restriction (honor manually):** {CHANNEL_WRITE_ONLY[name]}\n\n"
        )
    out = (
        f"---\n"
        f"description: {desc}\n"
        f"alwaysApply: false\n"
        f"---\n\n"
        f"{restriction_note}"
        f"{body}"
    )
    (CURSOR_RULES / f"{name}.mdc").write_text(out)
    print(f"rule: {name}")

registry_mdc = """---
description: Team routing registry for the program tier. Always loaded so the architect can route workstreams without loading full team definitions.
alwaysApply: true
---

# Team Registry (pointer)

The authoritative team routing manifest lives at `.claude/teams/registry.md`.

When planning or building a program (`/plan-program`, `/build-program`, or when acting as program-architect), **read that file** before routing any workstream. Do not invent teams or leads that are not listed there. Full team agent definitions load only when a workstream is routed to that team — this file is Tier-1 JIT disclosure only.
"""
(CURSOR_RULES / "registry.mdc").write_text(registry_mdc)
print("rule: registry")

CURSOR_NOTE = """<!--
Cursor execution note: Claude Code dispatches subagents via the Task tool.
Cursor has no native cross-agent Task dispatch. In Cursor, run this orchestration
in one agent session by invoking the corresponding `.cursor/rules/<agent>.mdc`
roles in sequence (or via Background Agents for parallel engineer/workstream steps).
The phase order, gates, and contracts below are unchanged — only the dispatch mechanism differs.
-->

"""

for src in sorted(CLAUDE_CMDS.glob("*.md")):
    text = src.read_text()
    fm, body = parse_frontmatter(text)
    name = src.stem
    desc = fm.get("description", name)
    out = (
        f"---\n"
        f"name: {name}\n"
        f"description: {desc}\n"
        f"---\n\n"
        f"{CURSOR_NOTE}"
        f"{body}"
    )
    (CURSOR_CMDS / f"{name}.md").write_text(out)
    print(f"cmd:  {name}")

WORKSTREAM = {
    "researcher", "story-writer", "architect", "backend-engineer",
    "frontend-engineer", "data-engineer", "e2e-verifier", "validator",
}
PROGRAM = {
    "program-architect", "integration-verifier", "program-validator",
    "program-documenter", "portfolio-architect", "initiative-lead",
}
COMMANDS = {
    "ship-feature": "workstream",
    "build-feature": "workstream",
    "continue-feature": "workstream",
    "discover": "program",
    "plan-program": "program",
    "build-program": "program",
    "continue-program": "program",
    "discover-portfolio": "portfolio",
    "plan-portfolio": "portfolio",
    "status-portfolio": "portfolio",
}
TEAM_DIRS = {
    "content": "content",
    "legal": "legal",
    "pm": "pm",
}
entries = []
for p in sorted((ROOT / ".claude" / "agents").glob("*.md")):
    name = p.stem
    tier = "workstream" if name in WORKSTREAM else "program" if name in PROGRAM else "unknown"
    entries.append({
        "id": name, "tier": tier, "type": "agent",
        "claude_path": f".claude/agents/{name}.md",
        "cursor_path": f".cursor/rules/{name}.mdc",
    })
for team, tier in TEAM_DIRS.items():
    d = ROOT / ".claude" / "agents" / team
    if not d.exists():
        continue
    for p in sorted(d.glob("*.md")):
        name = p.stem
        entries.append({
            "id": name, "tier": tier, "type": "agent",
            "claude_path": f".claude/agents/{team}/{name}.md",
            "cursor_path": f".cursor/rules/{name}.mdc",
        })
for name, tier in sorted(COMMANDS.items()):
    entries.append({
        "id": name, "tier": tier, "type": "command",
        "claude_path": f".claude/commands/{name}.md",
        "cursor_path": f".cursor/commands/{name}.md",
    })
# skills
skills_root = ROOT / ".claude" / "skills"
if skills_root.exists():
    for skill_dir in sorted(skills_root.iterdir()):
        skill_md = skill_dir / "SKILL.md"
        if skill_md.exists():
            entries.append({
                "id": f"skill-{skill_dir.name}",
                "tier": "skill",
                "type": "skill",
                "claude_path": str(skill_md.relative_to(ROOT)),
                "cursor_path": None,
            })
entries.append({
    "id": "registry", "tier": "program", "type": "registry",
    "claude_path": ".claude/teams/registry.md",
    "cursor_path": ".cursor/rules/registry.mdc",
})
for fname in ("PROTOCOL.md", "program.md", "feature.md"):
    entries.append({
        "id": f"channels-{Path(fname).stem}",
        "tier": "program",
        "type": "template",
        "claude_path": f".claude/program/channels/{fname}",
        "cursor_path": None,
    })
for schema in ("ledger.template.md", "contract.template.md", "ownership.schema.json", "ownership.example.json"):
    entries.append({
        "id": f"schema-{Path(schema).stem}",
        "tier": "program",
        "type": "schema",
        "claude_path": f".claude/program/schemas/{schema}",
        "cursor_path": None,
    })

missing = [e[k] for e in entries for k in ("claude_path", "cursor_path") if e.get(k) and not (ROOT / e[k]).exists()]
if missing:
    raise SystemExit(f"missing paths: {missing}")

manifest = {
    "name": "skailr-agents",
    "description": "Agent org control plane for Claude Code and Cursor — teams, contracts, lineage, CLI/UI",
    "version": "1.2.0",
    "artifacts": entries,
}
(ROOT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
print(f"manifest: {len(entries)} artifacts")
PY

echo "Remirror complete."
