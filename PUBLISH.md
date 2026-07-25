# Publishing checklist

`gh` was not available in the environment that prepared this release. After installing the [GitHub CLI](https://cli.github.com/), run:

```bash
# From the repo root, after committing
gh repo create skailr-agents --public --source=. --remote=origin --push

# Or if the empty repo already exists:
# git remote add origin https://github.com/YOUR_ORG/skailr-agents.git
# git push -u origin main

gh release create v1.1.0 -F RELEASE_NOTES_v1.1.0.md --title "v1.1.0"

# Then replace YOUR_ORG in README.md Quick start URLs and push again.
```
