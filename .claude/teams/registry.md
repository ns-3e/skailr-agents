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
| legal | requirements / clauses / control statements |
| pm | milestones / dependency edges / risk items / status digests |
| design | assets / artboards / components |
| marketing | channels / campaigns / audience segments |
| finance | worksheets / models / line-item schedules |

---

## Registry

### engineering
- **capability:** Builds working software — research, spec, backend, frontend, optional data pipelines, tests, validation, and documentation. The workstream pipeline (core roles plus optional `data-engineer`).
- **route-when:** The workstream produces or changes running code, APIs, databases, data pipelines, or any software artifact that must execute correctly.
- **lead:** follow skill `run-feature-queue` (serial MECE features from `plan.md`; each feature runs the nested `/ship-feature`→`/build-feature` or YOLO pipeline + `run-ticket-board` under `workstreams/<ws>/features/<slug>/`; no separate `eng-lead` agent yet)
- **owns:** source files, migrations, tests, config
- **produces contracts of type:** API shapes, data schemas, module interfaces, events
- **status:** built — agents under `.claude/agents/engineering/`

### content
- **capability:** Produces written deliverables that are on-brand, factually grounded, and human-sounding — articles, posts, announcements, docs, scripts, email copy. Strategy → drafting → brand + fact verification → validation.
- **route-when:** The workstream's deliverable is primarily *words meant to be read* — marketing copy, blog/Medium/LinkedIn posts, announcements, documentation, video scripts, email sequences, landing-page copy.
- **lead:** `content-lead`
- **owns:** content pieces, document sections, scripts
- **produces contracts of type:** message/positioning briefs, approved copy blocks, content that downstream teams (design, marketing) consume
- **consumes:** brand guidelines; factual source material; positioning from marketing
- **status:** built

### legal
- **capability:** Legal and compliance analysis — requirements, control statements, evidence maps, residual risk — with traceability as the correctness gate. Prime directive: never ship an unsourced obligation or unsigned control.
- **route-when:** The workstream's deliverable is *obligations, controls, or compliance evidence* — policy clauses, regulatory mapping, security/privacy control checklists, audit traceability matrices, residual-risk registers.
- **lead:** `legal-lead`
- **owns:** requirements, clauses, control statements
- **produces contracts of type:** approved requirement sets, compliance checklists, residual-risk registers
- **consumes:** product briefs, engineering specs/ACs that create obligations, PM delivery commitments
- **status:** built

### pm
- **capability:** Project/delivery management — milestones, dependency health, risk register, and exception digests for the CEO inbox. Escalates blockers, not green status noise.
- **route-when:** The workstream's deliverable is *delivery coordination* — roadmap slices, dependency maps, risk registers, status digests, cross-team schedule health — not the underlying eng/content/legal artifacts themselves.
- **lead:** `pm-lead`
- **owns:** milestones, dependency edges, risk items, status digests
- **produces contracts of type:** delivery commitments, milestone definitions, exception digests
- **consumes:** eng/content/legal contracts for “blocked on”; ledger and channel inbox
- **status:** built

### design
- **capability:** Visual and interaction design — layouts, brand assets, mockups, design-system components, with accessibility, system-conformance, and craft (anti-AI layout) review via skill `apply-ux-quality`.
- **route-when:** The workstream's deliverable is primarily *visual* — mockups, graphics, slide/landing-page layouts, brand assets, UI design (as distinct from UI *implementation*, which is engineering). Prefer routing here when success needs net-new brand/visual language; eng product features still meet the feature-path UX bar (`ui-spec` + Pass 4) without loading this team.
- **lead:** `design-lead`
- **owns:** assets, artboards, design-system entries
- **produces contracts of type:** design specs / handoff files that engineering implements; approved visual assets that marketing uses
- **consumes:** brand guidelines; approved copy from content; positioning from marketing
- **status:** built

### marketing
- **capability:** Campaign strategy and channel execution — positioning, audience, channel plans, distribution, and performance analysis.
- **route-when:** The workstream is about *reaching an audience* — campaign planning, channel strategy, launch distribution, SEO strategy, performance measurement. Not the copy itself (content) or the visuals (design), but the plan that orchestrates them.
- **lead:** `mkt-lead`
- **owns:** channels, campaigns, audience segments
- **produces contracts of type:** positioning/message briefs that content and design build to; a campaign plan
- **consumes:** approved copy (content), approved assets (design), finance's pricing/budget
- **status:** built

### finance
- **capability:** Financial analysis, modeling, and accounting — models, forecasts, pricing, budgets, unit economics — with a numerical audit as the correctness gate. Prime directive is numerical correctness and auditability.
- **route-when:** The workstream's deliverable is *numbers that must be right and traceable* — a financial model, forecast, pricing analysis, budget, unit-economics breakdown, or accounting reconciliation.
- **lead:** `fin-lead`
- **owns:** worksheets, models, line-item schedules
- **produces contracts of type:** pricing/budget figures other teams depend on; a validated model
- **consumes:** assumptions and volumes from other teams
- **status:** built

---

## Experts are not a team

Some projects also keep a small roster of **minted domain experts** under `.claude/experts/`. They are a different axis from teams and they are deliberately absent from the registry above.

| | Teams (this file) | Experts (`.claude/experts/registry.md`) |
|---|---|---|
| What they are | Process roles, generic across projects | Named project-local depth in one vertical and one part of this repo |
| Routed a workstream | Yes | **Never** |
| Own files | Yes, along a boundary unit | No. An expert writes only its own profile and per-run input files |
| What they do | Build the deliverable | Advise, co-author as scoped input, and gate as evidence |
| Where the roster lives | Here | `.claude/experts/registry.md`, consumer-owned |

**The live roster is never written into this file.** `install.sh` copies this registry fresh and `scripts/remirror.sh` regenerates it, so anything added here at runtime is destroyed on the next pack upgrade. The consumer roster at `.claude/experts/registry.md` is git-tracked in the consumer project and survives upgrades; this section is a static pointer to it and nothing more.

The program-architect does **not** read the expert roster during decomposition, and never routes a workstream to an expert. Expert consultation happens inside the commands and roles that were already routed: intake advisory routing, the consult-or-mint setup step in the build commands, co-author input to `story-writer` / `architect` / domain leads, and verdicts cited by `validator` and `program-validator`. A project with no `.claude/experts/` directory behaves exactly as it did before experts existed.

---

## Adding a team

1. Create `.claude/agents/<prefix>/` with the team's lead and worker agents.
2. Add a registry entry above with a sharp `route-when` line — this is what makes routing
   reliable, exactly like a skill's `description`. Vague triggers cause misrouting.
3. Flip `status` to built. Nothing in the program tier needs to change — the architect
   routes off this file, and the team loads only when used.