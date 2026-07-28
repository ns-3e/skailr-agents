# skailr-agents v1.2.0

Agent org **control plane** release: mechanical enforcement, legal/PM teams, portfolio tier, CLI + CEO UI, demo seed.

## Highlights

- **Control plane:** `npx skailr init` → `npx skailr serve` opens a CEO exception inbox (JSON store at `.skailr/skailr.json`)
- **First-run demo:** empty stores auto-seed `examples/parallel-api` so Inbox / Contracts / Lineage are non-empty
- **Enforcement scripts + skills:** ownership, contracts, channels, ledger, stubs
- **Domain teams:** legal/compliance and PM/delivery (built); portfolio agents + commands
- **Auth UX:** browser UI gets a public `/` plus injected local token (no more bare `unauthorized` on navigation)

## Quick try

```bash
npm install && npm run build
npx skailr init
npx skailr serve
# Open the printed URL, approve the seeded inbox item, check Lineage
```

## Install pack into a project

```bash
./install.sh /path/to/your-project
```

## Notes

- Workers remain Claude Code / Cursor — Skailr is the org/control plane, not a model runtime
- Intair ontology engine remains a separate project; see `docs/intair-seam.md`
- Design / marketing / finance teams stay registry stubs

## Full changelog

See [CHANGELOG.md](CHANGELOG.md) `[1.2.0]`.
