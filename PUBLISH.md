# Publishing checklist

After installing the [GitHub CLI](https://cli.github.com/) and committing the v1.2.0 tree:

```bash
# Push main (if not already)
git push -u origin main

# Create the GitHub release from notes
gh release create v1.2.0 -F RELEASE_NOTES_v1.2.0.md --title "v1.2.0 — Control plane"

# Optional: verify CI
gh run list --limit 5
```

If the remote does not exist yet:

```bash
gh repo create skailr-agents --public --source=. --remote=origin --push
gh release create v1.2.0 -F RELEASE_NOTES_v1.2.0.md --title "v1.2.0 — Control plane"
```

## Pre-release smoke (local)

```bash
npm install && npm run build && npm run test -w @skailr/server
node scripts/skailr/check-ownership.mjs --map examples/parallel-api/ownership.json --map-only
./install.sh "$(mktemp -d)"
rm -f /tmp/skailr-smoke.json
npx skailr serve --port 8799 --db /tmp/skailr-smoke.json &
# confirm log contains "Demo seed: imported parallel-api demo"
# open printed URL, approve inbox item, check Lineage for approval.decided
```

## Do not

- Force-push `main` / rewrite published tags without an explicit request
- Commit `.skailr/` runtime state or `node_modules/`
