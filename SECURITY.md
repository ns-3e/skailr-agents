# Security Policy

## Supported versions

The latest release on the default branch is the only supported version. Prompt and installer changes land there first.

## Reporting a vulnerability

This repository is a prompt pack and installer — not a hosted service. Still report anything that could harm users who install it, including:

- Malicious or unexpected instructions in agent/command prompts that could exfiltrate secrets or destroy data
- Installer scripts that write outside the intended target paths
- Supply-chain issues in CI or release artifacts

**Please do not open a public GitHub issue for security reports.**

Prefer one of:

1. **GitHub Security Advisories** on this repository (Private vulnerability reporting), once the repo is public
2. Email the maintainer listed on the GitHub profile / org that owns this repository

We will acknowledge receipt when we can and work on a fix or clarification before any public disclosure.

## Scope

Out of scope: bugs in Claude Code, Cursor, or third-party models; insecure use of the agents in a consumer’s own project (e.g. granting tools that can access production secrets).
