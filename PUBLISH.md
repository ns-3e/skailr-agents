# Publishing checklist

Release cut moves **four** versions together (CI enforces): `package.json`,
`manifest.json` (regenerated from package.json by `scripts/remirror.sh`),
`.claude-plugin/plugin.json`, and the newest `CHANGELOG.md` `## [x.y.z]` heading.

After installing the [GitHub CLI](https://cli.github.com/) and committing the release tree:

```bash
# Push main (if not already)
git push -u origin main

# Create the GitHub release (example: 1.6.0)
gh release create v1.6.0 -F CHANGELOG.md --title "v1.6.0 — Domain teams + Intair client seam"

# Optional: verify CI
gh run list --limit 5
```

## npm (npx install channel)

```bash
npm run doctor                 # must be all-green
npm pack --dry-run             # sanity: ~280 files incl. .claude/ and .cursor/
npm publish                    # requires npm login with rights to `skailr-agents`
# verify: npx skailr-agents@latest "$(mktemp -d)"
```

## Claude Code plugin channel

Nothing to upload — the marketplace is this repo (`.claude-plugin/marketplace.json`).
Pushing `main` publishes; users install with:

```bash
claude plugin marketplace add ns-3e/skailr-agents
claude plugin install skailr-agents@skailr
```

Verify after a release: `claude plugin validate .` passes with no errors.

If the remote does not exist yet:

```bash
gh repo create skailr-agents --public --source=. --remote=origin --push
```

## Pre-release smoke (local)

```bash
node scripts/skailr/check-ownership.mjs --map examples/parallel-api/ownership.json --map-only
node scripts/skailr/check-contracts.mjs --dir examples/parallel-api/contracts --ledger examples/parallel-api/ledger.md
node scripts/skailr/validate-channels.mjs --dir examples/parallel-api/channels
node scripts/skailr/emit-stubs.mjs --dir examples/parallel-api/contracts --out /tmp/skailr-stubs
node scripts/skailr/ledger-status.mjs --ledger examples/parallel-api/ledger.md
node scripts/skailr/feature-status.mjs --json
node scripts/skailr/check-intair-seam.mjs
./install.sh "$(mktemp -d)"
```

## Do not

- Force-push `main` / rewrite published tags without an explicit request
- Commit `node_modules/` or local `src/` checkouts (ignored)
