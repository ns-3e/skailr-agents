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
    "researcher": "Read, Grep, Glob, Write, Edit — Write/Edit only to `.claude/tmp/research.md`, `.claude/tmp/ask.md`, and channel appends; never edit application code.",
    "validator": "Read, Grep, Glob, Bash, Write, Edit — Write/Edit solely to append channel messages; never edit application code.",
    "program-validator": "Read, Grep, Glob, Bash, Write, Edit — Write/Edit solely to append channel messages; never edit application code.",
    "content-editor": "Write and Edit are for the audit report and channel appends; do not rewrite draft content as an author.",
    "legal-validator": "Read, Grep, Glob, Bash, Write, Edit — Write/Edit solely to validation report and channel appends.",
    "design-reviewer": "Write and Edit are for the design-review report and channel appends; do not rewrite asset specs as an author.",
    "mkt-analyst": "Write and Edit are for the mkt-review report and channel appends; do not rewrite campaign plans as an author.",
    "fin-auditor": "Read, Grep, Glob, Bash, Write, Edit — Write/Edit solely to audit-report and channel appends; do not rewrite models as an author.",
    "expert": "Read, Grep, Glob, Write, Edit, Bash — Write and Edit only for `.claude/tmp/ask.md`, `.claude/tmp/expert-<slug>.md`, `.claude/tmp/expert-verdict-<slug>.md`, the one loaded profile under `.claude/experts/` during a curate-expert pass, and channel appends; Bash is for read-only git staleness checks; never edit application code, `story.md`, or `spec.md`.",
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
root_md = list(CLAUDE_AGENTS.glob("*.md"))
if root_md:
    raise SystemExit(
        "flat agent files are not allowed under .claude/agents/; "
        f"move into a subdirectory: {[p.name for p in root_md]}"
    )
for d in sorted(p for p in CLAUDE_AGENTS.iterdir() if p.is_dir()):
    agent_files += list(d.glob("*.md"))

for src in sorted(agent_files):
    text = src.read_text()
    fm, body = parse_frontmatter(text)
    name = fm.get("name", src.stem)
    desc = fm.get("description", name)
    tools = fm.get("tools", "")
    model = fm.get("model", "sonnet")
    restriction_note = ""
    if name in CHANNEL_WRITE_ONLY:
        restriction_note = (
            f"<!-- Cursor limitation: Claude Code tools are [{tools}]. "
            f"Cursor rules cannot enforce tool allowlists; honor the restriction in prose below. -->\n\n"
            f"**Tool restriction (honor manually):** {CHANNEL_WRITE_ONLY[name]}\n\n"
        )
    model_note = (
        f"**Model (Cursor Task):** {model} — pass this as the Task model when dispatching this role. "
        f"See `.cursor/model-routing.md` and skill `route-models`.\n\n"
    )
    out = (
        f"---\n"
        f"description: {desc}\n"
        f"alwaysApply: false\n"
        f"---\n\n"
        f"{model_note}"
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

## Experts are not a team

Minted domain experts under `.claude/experts/` are a different axis from teams and are deliberately absent from the registry. **Never route a workstream to an expert**, and never write the live roster into `.claude/teams/registry.md`: `install.sh` copies that file fresh on every upgrade, so anything added there at runtime is destroyed. The consumer roster lives at `.claude/experts/registry.md`, which is git-tracked in the consumer project and survives upgrades. Experts advise, co-author as scoped input, and gate as evidence, inside commands and roles that were already routed (skill `consult-or-mint`). A project with no `.claude/experts/` directory is an empty roster for consult — mint evaluation still runs when a build/map caller asks for it. The full comparison table is in the "Experts are not a team" section of `.claude/teams/registry.md`.
"""
(CURSOR_RULES / "registry.mdc").write_text(registry_mdc)
print("rule: registry")

intake_src = ROOT / ".claude" / "intake.md"
if not intake_src.exists():
    raise SystemExit("missing .claude/intake.md")
intake_body = intake_src.read_text().lstrip()
# Drop leading H1 if present — rule title follows frontmatter
intake_for_rule = intake_body
intake_mdc = (
    "---\n"
    "description: Skailr plain-chat intake — route a question inside exactly one registered expert's band to that expert in advise mode, other questions to researcher, small changes to /patch, features to /yolo, whole apps to /yolo-program. Always loaded.\n"
    "alwaysApply: true\n"
    "---\n\n"
    f"{intake_for_rule}"
)
(CURSOR_RULES / "intake.mdc").write_text(intake_mdc)
print("rule: intake")

claude_md = (
    "<!-- Generated by scripts/remirror.sh from .claude/intake.md — do not hand-edit; re-run remirror. -->\n\n"
    f"{intake_body}"
)
(ROOT / "CLAUDE.md").write_text(claude_md)
print("CLAUDE.md")

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

# Generate .cursor/model-routing.md from .claude/model-routing.json
routing_path = ROOT / ".claude" / "model-routing.json"
if routing_path.exists():
    routing = json.loads(routing_path.read_text())
    active = routing.get("active", "balanced")
    profile = routing.get("profiles", {}).get(active, {})
    roles = profile.get("roles", {})
    lines = [
        "# Model routing (Cursor mirror)",
        "",
        "Generated by `scripts/remirror.sh` from `.claude/model-routing.json`.",
        "Do not hand-edit; re-run remirror after changing the routing config or applying a profile.",
        "",
        f"**Active profile:** `{active}`",
        "",
        "When dispatching a role via Task in Cursor, pass the model from this table",
        "(or follow skill `route-models` for escalate/downgrade).",
        "",
        "| Role | Model |",
        "| ---- | ----- |",
    ]
    for role in sorted(roles.keys()):
        lines.append(f"| `{role}` | `{roles[role]}` |")
    lines.extend([
        "",
        "Switch profiles in the pack or installed project:",
        "",
        "```bash",
        "node scripts/skailr/apply-model-routing.mjs --profile economy",
        "./scripts/remirror.sh   # pack maintainers only",
        "```",
        "",
        "Full docs: [docs/MODEL_ROUTING.md](../docs/MODEL_ROUTING.md).",
        "",
    ])
    (ROOT / ".cursor" / "model-routing.md").write_text("\n".join(lines))
    print("mirror: model-routing.md")

# Map agent subdirectory name → manifest tier
DIR_TIER = {
    "engineering": "workstream",
    "program": "program",
    "portfolio": "portfolio",
    "content": "content",
    "legal": "legal",
    "pm": "pm",
    "experts": "workstream",
}
COMMANDS = {
    "ship-feature": "workstream",
    "build-feature": "workstream",
    "continue-feature": "workstream",
    "yolo": "workstream",
    "patch": "workstream",
    "mint-expert": "workstream",
    "discover": "program",
    "plan-program": "program",
    "build-program": "program",
    "continue-program": "program",
    "yolo-program": "program",
    "map-repo": "program",
    "discover-portfolio": "portfolio",
    "plan-portfolio": "portfolio",
    "status-portfolio": "portfolio",
}
entries = []
agents_root = ROOT / ".claude" / "agents"
root_md = list(agents_root.glob("*.md"))
if root_md:
    raise SystemExit(
        "flat agent files are not allowed under .claude/agents/; "
        f"move into a subdirectory: {[p.name for p in root_md]}"
    )
for d in sorted(p for p in agents_root.iterdir() if p.is_dir()):
    tier = DIR_TIER.get(d.name, d.name)
    for p in sorted(d.glob("*.md")):
        name = p.stem
        entries.append({
            "id": name, "tier": tier, "type": "agent",
            "claude_path": f".claude/agents/{d.name}/{name}.md",
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
entries.append({
    "id": "intake",
    "tier": "config",
    "type": "intake",
    "claude_path": ".claude/intake.md",
    "cursor_path": ".cursor/rules/intake.mdc",
})
entries.append({
    "id": "claude-md",
    "tier": "config",
    "type": "config",
    "claude_path": "CLAUDE.md",
    "cursor_path": None,
})
entries.append({
    "id": "model-routing",
    "tier": "config",
    "type": "config",
    "claude_path": ".claude/model-routing.json",
    "cursor_path": ".cursor/model-routing.md",
})
for fname in ("PROTOCOL.md", "program.md", "feature.md"):
    entries.append({
        "id": f"channels-{Path(fname).stem}",
        "tier": "program",
        "type": "template",
        "claude_path": f".claude/program/channels/{fname}",
        "cursor_path": None,
    })
for schema in (
    "ledger.template.md",
    "contract.template.md",
    "ownership.schema.json",
    "ownership.example.json",
    "patch-report.template.md",
    "feature-progress.template.md",
    "handoff.template.md",
    "board.template.md",
    "ticket.template.md",
    "orientation.template.md",
    "ui-spec.template.md",
    "design-brief.template.md",
    "artboard.template.md",
    "backlog.template.md",
    "map-repo-progress.template.md",
    "map-report.template.md",
    "expert.schema.json",
    "expert-config.schema.json",
    "expert-profile.template.md",
    "expert-registry.template.md",
    "expert-research.template.md",
    "telemetry-event.schema.json",
):
    p = ROOT / ".claude" / "program" / "schemas" / schema
    if not p.exists():
        continue
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
    "description": "Multi-agent operating model for Claude Code and Cursor — teams, contracts, channels, script gates",
    "version": json.loads((ROOT / "package.json").read_text())["version"],
    "artifacts": entries,
}
(ROOT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
print(f"manifest: {len(entries)} artifacts")
PY

echo "Remirror complete."
