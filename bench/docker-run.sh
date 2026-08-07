#!/usr/bin/env bash
# Runs a Skailr Bench campaign inside a disposable Docker container.
#
# The host repo is mounted read-only at /repo; the container copies it into
# its own throwaway filesystem and runs there, so a real (non-mock) campaign
# — which invokes Claude Code with --dangerously-skip-permissions — can never
# touch anything on the host outside ./bench-docker-out/. See bench/README.md
# "Security" for why that flag needs this kind of isolation.
#
# Usage:
#   bench/docker-run.sh -- --task patch-webhook --smoke --reps 1   # real run
#   BENCH_MOCK=1 bench/docker-run.sh -- --task patch-webhook --reps 1  # spend-free, no token needed
#
# Real runs need CLAUDE_CODE_OAUTH_TOKEN in the environment (generate with
# `claude setup-token` on an already-authenticated machine — that's a
# subscription token, not an API key).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE="skailr-bench:local"
OUT_DIR="$REPO_ROOT/bench-docker-out"

if [ "${BENCH_MOCK:-}" != "1" ] && [ -z "${CLAUDE_CODE_OAUTH_TOKEN:-}" ]; then
  echo "CLAUDE_CODE_OAUTH_TOKEN is not set." >&2
  echo "  Real runs need a subscription token: run 'claude setup-token' on an" >&2
  echo "  authenticated machine, then re-run with CLAUDE_CODE_OAUTH_TOKEN=<value>." >&2
  echo "  Or set BENCH_MOCK=1 for a spend-free dry run that needs no token." >&2
  exit 1
fi

CLAUDE_CODE_VERSION=$(grep -m1 '^claude_code_version:' "$REPO_ROOT/bench/config.yaml" | sed -E 's/^claude_code_version:[[:space:]]*"?([^"[:space:]]+)"?.*/\1/')

echo "Building $IMAGE (claude-code@$CLAUDE_CODE_VERSION)..."
docker build \
  --build-arg "CLAUDE_CODE_VERSION=$CLAUDE_CODE_VERSION" \
  -t "$IMAGE" \
  "$REPO_ROOT/bench/docker"

mkdir -p "$OUT_DIR"

echo "Running campaign in a disposable container (host repo mounted read-only)..."
docker run --rm \
  -e CLAUDE_CODE_OAUTH_TOKEN \
  -e BENCH_MOCK \
  -v "$REPO_ROOT:/repo:ro" \
  -v "$OUT_DIR:/out" \
  "$IMAGE" \
  npm run bench -- "$@"

echo "Done. Results in $OUT_DIR/{results,benchmarks}"
