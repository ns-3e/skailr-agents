#!/usr/bin/env bash
# Copies the read-only host repo (/repo) into a disposable in-container
# working copy, runs the given bench command against that copy, then exports
# only bench/results and bench/benchmarks back out to /out. The host repo at
# /repo is never written to; nothing outside /out ever reaches the host.
set -euo pipefail

if [ "$(id -u)" = "0" ]; then
  echo "::error:: refusing to run as root (Claude Code refuses --dangerously-skip-permissions under root)" >&2
  exit 1
fi

if [ ! -d /repo/.git ]; then
  echo "::error:: /repo is not mounted (expected the host repo at /repo:ro)" >&2
  exit 1
fi

rm -rf repo
mkdir -p repo
cp -a /repo/. repo/
cd repo/bench

echo "node: $(node --version)"
echo "claude: $(claude --version 2>/dev/null || echo 'not installed (mock mode does not need it)')"

npm ci

# Never let a stray ANTHROPIC_API_KEY on the host env sneak in — real runs
# authenticate via CLAUDE_CODE_OAUTH_TOKEN (subscription), not an API key.
export ANTHROPIC_API_KEY=""

"$@"

mkdir -p /out/results /out/benchmarks

# The harness marks completed run dirs read-only (fsutil.mjs markReadOnly).
# `cp -a` tries to replicate that exact mode onto the bind-mounted /out
# volume and fails ("Permission denied" setting perms on the FUSE-backed
# mount) on Docker Desktop for Mac — which `cp` treats as a hard error,
# aborting the copy of that subtree before any file content lands. Drop the
# read-only bit on our own throwaway copy first so the export can't silently
# lose data the way it did the first time this ran for real.
[ -d results ] && chmod -R u+w results
[ -d benchmarks ] && chmod -R u+w benchmarks

[ -d results ] && cp -a results/. /out/results/
[ -d benchmarks ] && cp -a benchmarks/. /out/benchmarks/

echo "Exported bench/results and bench/benchmarks to the host-mounted /out."
