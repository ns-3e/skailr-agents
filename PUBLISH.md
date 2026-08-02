# Publishing checklist

Release cut moves **four** versions together (CI enforces): `package.json`,
`manifest.json` (regenerated from package.json by `scripts/remirror.sh`),
`.claude-plugin/plugin.json`, and the newest `CHANGELOG.md` `## [x.y.z]` heading.

Publishing itself is **not done locally** — pushing a `vX.Y.Z` tag triggers two
GitHub Actions workflows that do it:

- `.github/workflows/publish-npm.yml` — publishes to npm via **Trusted Publishing
  (OIDC)**. No `NPM_TOKEN` secret exists or is needed; npm exchanges GitHub's OIDC
  token for a short-lived publish credential at run time. See
  [npm Trusted Publishers](https://docs.npmjs.com/trusted-publishers).
- `.github/workflows/publish-plugin.yml` — validates `.claude-plugin/*.json`
  (`claude plugin validate . --strict`) and cuts the GitHub Release from the
  matching `CHANGELOG.md` section. Claude Code plugins have no registry upload:
  this repo *is* the marketplace, so "publishing" the plugin channel is validate +
  release, not an upload.

Both workflows independently verify the tag matches the version in
`package.json` / `.claude-plugin/plugin.json` and refuse to run otherwise, and
both run `doctor.mjs` before doing anything else.

## One-time npm setup: bootstrap, then Trusted Publishing

npm's Trusted Publisher settings only exist for a package that has already been
published once — there is nothing to configure for a name with zero versions.
`skailr-agents` has never published, so the very first release needs one
bootstrap run before OIDC can take over. Neither step happens on a laptop.

**Step 1 — bootstrap (once, ever):**

1. Create a Granular Access Token at
   `https://www.npmjs.com/settings/<you>/tokens` → **Read and write** on this
   package (or "All packages," since it doesn't exist yet) → enable **"Bypass
   2FA for write actions."**
2. Add it as the repo secret `NPM_TOKEN` (`Settings → Secrets and variables →
   Actions` on GitHub).
3. Run `.github/workflows/publish-npm-bootstrap.yml` manually (`workflow_dispatch`
   — Actions tab → select it → **Run workflow**). It refuses to run if the
   package already exists, so it can't accidentally fire twice.

**Step 2 — configure Trusted Publishing (once, right after step 1 succeeds):**

On npmjs.com → `skailr-agents` package → **Settings → Trusted Publisher**:

| Field | Value |
|---|---|
| Organization or user | `ns-3e` |
| Repository | `skailr-agents` |
| Workflow filename | `publish-npm.yml` |
| Allowed actions | `npm publish` |

Then **delete the `NPM_TOKEN` secret** — every release from here on goes
through `publish-npm.yml` (OIDC, triggered by pushing a `vX.Y.Z` tag), with no
stored credential at all. Requires npm CLI ≥ 11.5.1 and Node ≥ 22.14.0 on the
runner — both pinned in the workflow.

## Cutting a release

```bash
# 1. Bump package.json + .claude-plugin/plugin.json to the same version,
#    move CHANGELOG.md [Unreleased] content under a new ## [x.y.z] heading,
#    then regenerate the manifest:
./scripts/remirror.sh

# 2. Verify everything locally before tagging:
node scripts/skailr/doctor.mjs

# 3. Commit, push, tag, push the tag — the tag push is what triggers publishing:
git add -A && git commit -m "release: cut x.y.z"
git push origin main
git tag vX.Y.Z
git push origin vX.Y.Z

# 4. Watch both publish workflows:
gh run list --limit 5
```

If the remote does not exist yet:

```bash
gh repo create skailr-agents --public --source=. --remote=origin --push
```

## Verify after a release

```bash
npx skailr-agents@latest "$(mktemp -d)"   # npm channel
claude plugin marketplace update skailr    # plugin channel (or a fresh `add`)
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
- Run `npm publish` locally — it requires 2FA/a bypass token per npm account
  policy and bypasses the tag/version/doctor checks the workflow enforces
