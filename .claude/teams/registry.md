# Team Registry

The routing manifest for the program tier. This is the **only** team-level file the
program-architect loads during decomposition. Each entry is deliberately thin — a name,
a capability line, a routing trigger, and the boundary type its work is owned along.
Full team and agent definitions are **not** here; they load only when a workstream is
actually routed to that team and dispatched. This is just-in-time disclosure: the
architect's context stays flat no matter how many teams exist.

## How the architect uses this

During `/plan-program`, for each workstream it defines, the architect reads the
`route-when` line of each team and assigns the workstream to exactly one team. It does
**not** read the team's agent files to make this decision. At `/build-program` time, the
orchestrator loads the chosen team's lead (Tier 2), which in turn loads its workers and
domain reference (Tier 3) only as it dispatches them.

## Boundary types

Every team enforces disjoint ownership, but *what* is owned differs by domain. The
architect uses the boundary type to draw non-overlapping ownership within a domain, the
same way it does for engineering files.

| Team | boundary unit |
|---|---|
| engineering | files / directories |
| content | content pieces / documents / sections |
| design | assets / artboards / components |
| marketing | channels / campaigns / audience segments |
| finance | worksheets / models / line-item schedules |

---

## Registry

### engineering
- **capability:** Builds working software — research, spec, backend, frontend, optional data pipelines, tests, validation, and documentation. The workstream pipeline (core roles plus optional `data-engineer`).
- **route-when:** The workstream produces or changes running code, APIs, databases, data pipelines, or any software artifact that must execute correctly.
- **lead:** invoke the standard `/ship-feature` → `/build-feature` workstream flow (no separate `eng-lead` agent yet)
- **owns:** source files, migrations, tests, config
- **produces contracts of type:** API shapes, data schemas, module interfaces, events
- **status:** built

### content
- **capability:** Produces written deliverables that are on-brand, factually grounded, and human-sounding — articles, posts, announcements, docs, scripts, email copy. Strategy → drafting → brand + fact verification → validation.
- **route-when:** The workstream's deliverable is primarily *words meant to be read* — marketing copy, blog/Medium/LinkedIn posts, announcements, documentation, video scripts, email sequences, landing-page copy.
- **lead:** `content-lead`
- **owns:** content pieces, document sections, scripts
- **produces contracts of type:** message/positioning briefs, approved copy blocks, content that downstream teams (design, marketing) consume
- **consumes:** brand guidelines; factual source material; positioning from marketing
- **status:** built

### design
- **capability:** Visual and interaction design — layouts, brand assets, mockups, design-system components, with accessibility and system-conformance review.
- **route-when:** The workstream's deliverable is primarily *visual* — mockups, graphics, slide/landing-page layouts, brand assets, UI design (as distinct from UI *implementation*, which is engineering).
- **lead:** `design-lead`
- **owns:** assets, artboards, design-system entries
- **produces contracts of type:** design specs / handoff files that engineering implements; approved visual assets that marketing uses
- **consumes:** brand guidelines; approved copy from content
- **status:** not built — add agents under `.claude/agents/design/` and flip to built

### marketing
- **capability:** Campaign strategy and channel execution — positioning, audience, channel plans, distribution, and performance analysis.
- **route-when:** The workstream is about *reaching an audience* — campaign planning, channel strategy, launch distribution, SEO strategy, performance measurement. Not the copy itself (content) or the visuals (design), but the plan that orchestrates them.
- **lead:** `mkt-lead`
- **owns:** channels, campaigns, audience segments
- **produces contracts of type:** positioning/message briefs that content and design build to; a campaign plan
- **consumes:** approved copy (content), approved assets (design), finance's pricing/budget
- **status:** not built

### finance
- **capability:** Financial analysis, modeling, and accounting — models, forecasts, pricing, budgets, unit economics — with a numerical audit as the correctness gate. Prime directive is numerical correctness and auditability.
- **route-when:** The workstream's deliverable is *numbers that must be right and traceable* — a financial model, forecast, pricing analysis, budget, unit-economics breakdown, or accounting reconciliation.
- **lead:** `fin-lead`
- **owns:** worksheets, models, line-item schedules
- **produces contracts of type:** pricing/budget figures other teams depend on; a validated model
- **consumes:** assumptions and volumes from other teams
- **status:** not built

---

## Adding a team

1. Create `.claude/agents/<prefix>/` with the team's lead and worker agents.
2. Add a registry entry above with a sharp `route-when` line — this is what makes routing
   reliable, exactly like a skill's `description`. Vague triggers cause misrouting.
3. Flip `status` to built. Nothing in the program tier needs to change — the architect
   routes off this file, and the team loads only when used.