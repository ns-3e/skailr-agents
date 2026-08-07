# Disposable environment for REAL (non-mock) Skailr Bench campaigns.
#
# Runs Claude Code with --dangerously-skip-permissions confined to this
# container's own filesystem. Use via ../docker-run.sh, not directly — that
# script mounts the host repo read-only, resolves the pinned claude CLI
# version from ../config.yaml, and wires up the read-only-in / results-only-out
# volumes.

FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Pinned to bench/config.yaml's claude_code_version — see docker-run.sh.
ARG CLAUDE_CODE_VERSION
RUN test -n "$CLAUDE_CODE_VERSION" || (echo "CLAUDE_CODE_VERSION build-arg is required" >&2; exit 1)
RUN npm install -g "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}"

RUN useradd --create-home --uid 10001 --shell /bin/bash bench
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Claude Code refuses --dangerously-skip-permissions as root — never run this
# image as root.
USER bench
WORKDIR /home/bench/work

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["npm", "run", "bench", "--", "--smoke"]
