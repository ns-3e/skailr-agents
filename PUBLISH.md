# Publishing checklist

After installing the [GitHub CLI](https://cli.github.com/) and committing the release tree:

```bash
# Push main (if not already)
git push -u origin main

# Create the GitHub release (example: 1.3.0 pack-only)
gh release create v1.3.0 -F CHANGELOG.md --title "v1.3.0 — Pack-only agent operating model"

# Optional: verify CI
gh run list --limit 5
```

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
./install.sh "$(mktemp -d)"
```

## Do not

- Force-push `main` / rewrite published tags without an explicit request
- Commit `node_modules/`
