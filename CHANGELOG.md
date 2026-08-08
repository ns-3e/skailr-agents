# Changelog

All notable changes to this project are documented in this file.

## [1.14.0] — 2026-08-08

### Fixed

- **Hooks were never loading, in any install, ever.** Hooks lived in `.claude/settings.skailr.json` — a filename Claude Code does not auto-load (only `.claude/settings.json`, `.claude/settings.local.json`, and `~/.claude/settings.json` are recognized). Every hook this pack has shipped, including 1.13.0's `check-update.mjs` Stop entry, silently never fired in any real run. Root-caused via a session-init event carrying no `hooks` field at all, confirmed against Claude Code's own settings docs, and verified by direct evidence from two live campaign runs whose Stop-hook marker files were absent despite matching finding data. **Fix:** hooks now live in `.claude/settings.json`, which every install/upgrade always copies from the pack (the same treatment as `CLAUDE.md` and `model-routing.json`) — no migration needed, since it reaches every project unconditionally. `.claude/settings.skailr.json` keeps its original, narrower job: the `telemetry`/`autoUpdate` toggles, still preserved across upgrades. Verified live with `--include-hook-events`: `UserPromptSubmit` and all four `Stop` hooks now fire and exit 0. The now-permanently-obsolete `autoupdate-stop-hook` migration (its premise — hooks living in the preserve-on-upgrade `settings.skailr.json` — no longer holds) and the tests that existed only to cover it were removed; see [docs/UPDATE-CHECK.md](docs/UPDATE-CHECK.md#upgrading-from--1121) for the historical record of what it did through 1.13.0.
- `package.json`'s npm `files` whitelist omitted `.claude/settings.json` entirely, so `npx skailr-agents` installs would have shipped the hooks-fix file to nobody. Fixed and verified with `npm pack --dry-run`.

### Added

- **`check-phase-tracking.mjs`, a new Stop hook enforcing the `track-phase` skill's DB-writing instruction mechanically instead of by prose.** `.claude/skills/track-phase/SKILL.md` asks the orchestrator to record every phase transition in `scripts/skailr/skailr.db` (`node:sqlite`) and render it into `ledger.md`/`progress.md` — but a real program-scale run showed those files' Phases tables advancing well past "pending" while the DB's `programs`/`features` tables stayed completely empty, because a rendered markdown file and the DB it's supposed to be generated from can silently drift once nothing enforces the write. The new hook compares the two on every `Stop` and blocks once, with the exact catch-up `db.mjs` calls to run, if a phase transition landed in markdown but never reached the DB — the same enforcement pattern 1.13.0-era `check-blocking-findings.mjs` already used for the validate→fix loop, and subject to the same one-block-per-run bound.

## [1.13.0] — 2026-08-05

### Added

- **An installed pack now tells you when it is out of date — check-and-notify only, on by default, and it never upgrades anything.** There has never been an update command: `npx skailr-agents` installs what you ask for, so a project could sit several minor versions behind indefinitely with no signal. A new zero-dep runtime script, `scripts/skailr/check-update.mjs`, is wired as a **third** `hooks.Stop` entry (`node scripts/skailr/check-update.mjs 2>/dev/null || true`, swallow-styled exactly like the existing channel and expert checks) and prints **one line** when the registry has a newer version: `skailr-agents: update available — installed <x>, latest <y>. Re-run the installer to upgrade: npx skailr-agents@latest .` **There is no auto-apply path anywhere in the code** — no flag, no prompt, no deferred job. Upgrading stays a deliberate installer re-run you choose to make and review as a normal diff. **Opt out** with `"autoUpdate": { "enabled": false }` in `.claude/settings.skailr.json`; the gate is the script's first action, re-read from disk on every invocation, and returns before any state read, any write, and any network call. Full behavior, request shape, cadence, and state files: [docs/UPDATE-CHECK.md](docs/UPDATE-CHECK.md).
  - **This is the pack's first and only runtime network call, and it is deliberately the smallest one possible.** At most one `GET https://registry.npmjs.org/skailr-agents/latest` per **24 hours**, carrying `accept: application/json` and nothing else: no `Authorization`, no cookie, no npm token, no `.npmrc` read, no custom `User-Agent` (undici's Node-version-default `user-agent: node` is sent, unmodified), no query string, no body — no repo name, path, git remote, username, or machine identifier. The header set is undici's default for a given Node version — identical across machines on the same Node version — and your installed version is never transmitted (comparison happens locally), and the check emits **no telemetry span** and never consults `telemetry.enabled`. Only the response's `version` field is read. Hostile/broken responses cannot hang or flood the hook: 2500 ms `AbortSignal.timeout`, non-200 discarded, bodies over 1 MB discarded (the ceiling is applied to the bytes as they stream in and the connection is dropped the moment it is passed, so a chunked body with no `content-length` is never buffered in full), versions failing a strict semver regex or over 128 chars discarded — every one of those paths silent, exit 0.
  - **Safe by construction:** the script **always exits 0**, on every path including usage errors (a deliberate, documented deviation from the `migrate.mjs`/`doctor.mjs` `exit 2` precedent — it runs unattended inside a live Stop hook, where a nonzero exit is risk with no upside). The 24 h stamp is written **before** the request goes out, so a timeout, an offline laptop, or a killed process still consumes the window — a broken network can never become a per-turn retry storm. On the ~99% of turns where a check is not due, the cost is two small file reads and no output. Comparison is real semver (numeric core, release outranks prerelease, dot-identifier prerelease ordering), so `1.9.0 → 1.10.0` notifies where a string compare would not, and the notice repeats on every due check until you upgrade — there is no suppression flag or snooze.
  - **State is two files with two separate writers**, both under the already-gitignored `.skailr/`, both written atomically (temp + rename, never torn): `installed-version.json` — stamped by the new `check-update.mjs --record-install`, which both installers call on every claude-mode install/upgrade — and `update-check.json` (`lastCheckAt` = last **attempt**, `lastLatest`). A missing or unparseable marker stops the check with no write and no network: an unknown installed version is never guessed at. **Writes never leave `<repo>/.skailr/`** — no home-directory cache, no npm cache, nothing under `.claude/`, and nothing under `.claude/experts/`, which this path never reads, enumerates, or opens (asserted by before/after tree hashes in the smoke suite). No new `.gitignore` lines were needed.
  - **Existing installs get it on their next upgrade, without losing anything they set.** Two new additive-only entries join the 1.12.0 migration list, in order after `telemetry-enabled-default`: **`autoupdate-enabled-default`** (a structural clone of the telemetry scalar fill) and **`autoupdate-stop-hook`** — the first **array-aware** migration, which appends the hook entry to your existing `hooks.Stop` default block. It is idempotent by re-derivation, not by a ledger: if any entry anywhere in `hooks.Stop[*].hooks` already mentions `check-update.mjs`, it is a no-op, so re-running an install is byte-for-byte stable. Your own third-party Stop entries are preserved verbatim and in order; entries are appended, never spliced, reordered, or mutated. An explicit `"autoUpdate": { "enabled": false }` is never overwritten, on this or any future upgrade. A deleted `hooks`/`hooks.Stop` block is **not resurrected** — that project keeps the flag but gets no notice, an accepted de-facto opt-out rather than an installer overriding a deliberate deletion.
  - **Gated, not asserted by prose.** `doctor.mjs` gains two pack-only rows via a new sibling module `scripts/skailr/doctor-autoupdate.mjs` (kept out of `doctor.mjs` itself to hold it under the 400-line megafile threshold): `autoupdate settings default` (the shipped template really does carry `autoUpdate.enabled === true`) and `autoupdate wiring` (the script exists; the template's hook entry is present *and* ends with the `2>/dev/null || true` swallow; the runner exports both ids; both `install.sh` and `install.ps1` name both ids and the script). The pre-existing three-way ordered id-parity row covers the rest — verified genuine by breaking it, not assumed. Both rows `SKIP` cleanly in a consumer repo or a pre-feature checkout, but **fail loudly on partial adoption**, which is exactly the drift they exist to catch. `scripts/skailr/update-smoke.mjs` (new, `npm run smoke:update`) is the executable proof: **82 hermetic cases** — no real network, success paths served by a local `node:http` stub through a test-only registry seam and failure paths by a closed loopback port — covering the opt-out gate, cadence (including the offline-still-consumes-window case), 14 hostile responses, 10 semver orderings, the exact notice string byte-for-byte, request-header shape, write confinement, and both migrations' fill / never-overwrite / idempotence / no-resurrection behavior. It exits non-zero on any failure (verified by injecting an inverted assertion). `npm run smoke:migrate` and `npm run smoke:telemetry` are registered alongside it — the two existing smoke suites were previously reachable only by path.

### Known limitations

- **No auto-upgrade, no release notes in the notice, and no configurable interval, registry, or notice format** — the only setting is on/off. `SKAILR_UPDATE_REGISTRY` exists solely so the smoke suite can run with all egress blocked; it is a test seam, not supported configuration.
- **Two or more Claude Code sessions in the same repo that end at the same instant may each print the notice.** The 24 h claim is an unlocked read-then-write on `.skailr/update-check.json`, so simultaneous due-checks can all read "due" before any writes the stamp (measured: 4 of 8 forced-concurrent processes notified). State integrity and the cadence window are unaffected — the file stays valid, writes are atomic temp+rename, and the window is still consumed once; only the "at most one notice" framing is. Not worth a lock file in a swallow-everything hook, and unreachable outside a deliberately raced start.
- **`--cursor-only` installs get no marker and no notice** — the check is wired to the Claude Code `Stop` hook and the installers skip `--record-install` in cursor mode.
- **Behind a proxy that blocks `registry.npmjs.org`, every check silently fails**, consumes its 24 h window, and prints nothing. That is the intended degradation; there is no proxy or offline-mirror configuration.
- **The 1.13.0 `install.ps1` changes have not been executed on a real Windows or `pwsh` host** (same caveat as 1.12.0). They are held identical to `install.sh` by doctor's parity checks and the CI PowerShell parse gate, but the marker-write path was end-to-end confirmed only via `install.sh`/`npx`. Windows consumers should re-run `node scripts/skailr/doctor.mjs` after upgrading.

## [1.12.1] — 2026-08-05

### Fixed

- **Installers now always create an empty `.skailr/` directory (belt-and-suspenders for the telemetry fallback).** `emit-telemetry.mjs`'s `isEnabled()` falls back to `existsSync('.skailr')` whenever `.claude/settings.skailr.json`'s `telemetry.enabled` key is absent or non-boolean — but neither `install.sh` nor `install.ps1` actually created that directory, so a project that hit the fallback path (malformed settings, or the file hand-deleted) got a silent no-op: `span.start` never wrote and no error surfaced. Both installers' claude-only paths (`install_claude` / `Install-Claude`) now `mkdir -p` / `New-Item -Force` an empty `.skailr/` right after their existing `.claude/tmp/`, `.claude/program/`, `.claude/repo/` block, printing a matching `  + .skailr/` line; idempotent on upgrade, no `.gitkeep` or other file written inside it (it's already gitignored, and git can't track an empty dir anyway). `--cursor-only`/`-CursorOnly` installs are unaffected — that mode never installs the emitter. The emitter's gating precedence (`isEnabled()`) is unchanged. **One real behavioral consequence:** deleting `settings.skailr.json` no longer disables telemetry, since `.skailr/` now always exists after install — the only supported opt-out is an explicit `"telemetry": { "enabled": false }` in `.claude/settings.skailr.json`. Along the way, `install.ps1`'s `Append-Gitignore` gitignore-lines list was also found missing `.skailr/` (a pre-existing carrier-drift bug, `install.sh`'s equivalent list already had it) — added in the same relative position so both carriers stay line-for-line comparable. [docs/TELEMETRY.md](docs/TELEMETRY.md)

## [1.12.0] — 2026-08-05

### Changed

- **Telemetry now defaults to enabled out of the box, and existing installs pick that default up automatically on their next upgrade (behavior change).** `.claude/settings.skailr.json` ships with a real `"telemetry": { "enabled": true }` key, so `span.start`/`span.end` records are emitted from the first dispatch — replacing 1.11.0's "key shipped unset, derive enablement from `.skailr/` presence" default. **Opt out** with `"telemetry": { "enabled": false }` in `.claude/settings.skailr.json`. Emission remains local-only (`.skailr/telemetry/*.jsonl`, added to the installed `.gitignore`), non-networked, and structurally unable to block or fail a run. The emitter's gating logic (`scripts/skailr/emit-telemetry.mjs`) is **unchanged** — an explicit boolean still wins, and a missing key/file still falls back to `.skailr/` presence; only the shipped default flipped. Because `install.sh`/`install.ps1` copy `settings.skailr.json` only if absent, a project installed before this keeps its own file; the new migration mechanism below is what carries the new default into it. [docs/TELEMETRY.md](docs/TELEMETRY.md)

### Added

- **Versioned, additive-only install migrations — new defaults now reach already-installed repos, not just fresh installs.** A new zero-dep runner, `scripts/skailr/migrate.mjs`, holds an ordered `MIGRATIONS` array and is invoked by both installers (`install.sh`'s `run_migrations` / `install.ps1`'s `Invoke-Migrations`) **after** the copy phase and **before** the roster assertion, once per install run, against a pre-copy snapshot of which target files already existed. The first migration, **`telemetry-enabled-default`**, fills `"telemetry": { "enabled": true }` into a pre-existing `.claude/settings.skailr.json` — closing 1.11.0's gap where only fresh installs got the enabled-by-default file. Future default-changes ship as additional entries in the same array and reach existing installs the same way.
  - **Additive-only is the invariant, not a nicety:** the migration writes only when the write cannot destroy a value you typed. An explicit `telemetry.enabled` boolean — **`false` as much as `true`** — is left untouched (`noop`, reason `explicit`), so opting out survives every future upgrade. A `telemetry` key holding a non-object value (`"on"`, `1`, `null`, `[]`) is **skipped with a warning** and left exactly as-is for you to fix by hand — the installer never guesses at data it cannot safely parse. An unparseable `settings.skailr.json` is never opened for write. Files that did not exist before the copy phase are skipped before they are even read.
  - **Idempotent and state-derived:** re-running an install re-derives status from the live file (no applied-migrations ledger to drift), so a second run is a byte-for-byte no-op. The runner **always exits 0** and can never fail an install; it is skipped entirely for `--cursor-only` installs and when `node` is unavailable. Both installer arrays plus the runner's exports are held identical, in order and non-empty, by a new `migrations` check in `doctor.mjs` — a missing, misspelled, or unexported id fails the gate rather than passing vacuously. `scripts/skailr/migrate-smoke.mjs` is the executable proof (fill, never-overwrite, idempotence, malformed, read-only-file, unparseable cases). Full behavior and the upgrade path: [docs/TELEMETRY.md](docs/TELEMETRY.md).
- **CI now parses `install.ps1` with PowerShell's own parser** (`pwsh` + `System.Management.Automation.Language.Parser` on `ubuntu-latest`), failing the build with a file/line annotation on any syntax error. `install.ps1` is parsed as a whole file, so a single syntax error breaks the entire Windows installer, not just the edited function — this gate closes that class permanently.

### Fixed

- **`install.ps1` no longer overwrites `.claude/settings.skailr.json` on every run (Windows-only bug).** Through 1.11.0 the PowerShell installer copied that file unconditionally, so every re-install silently reset a Windows consumer's telemetry choice — including an explicit `"telemetry": { "enabled": false }` opt-out. It now uses the same if-exists guard `install.sh` has always had (`= .claude/settings.skailr.json exists (preserved; consumer telemetry choice kept)`), which is also the precondition that makes the additive migration above meaningful on that carrier. `install.sh` and `npx skailr-agents` were never affected.

### Known limitations

- **The 1.12.0 `install.ps1` changes have not been executed on a real Windows or `pwsh` host.** They are syntax-verified by the new CI parse gate and string-diffed against `install.sh`'s behavior, but the fill / no-op / opt-out-preserved path was end-to-end confirmed only via `install.sh` and `npx skailr-agents`. Windows consumers should re-run `node scripts/skailr/doctor.mjs` after upgrading and check `.claude/settings.skailr.json` by hand. Tracked in [.claude/tmp/validation-report.md](.claude/tmp/validation-report.md) (Blocking 1).
- **`install.ps1` has no roster-fingerprint assertion** around the migration phase, unlike `install.sh`. No shipped migration can reach `.claude/experts/` (the only migration targets `.claude/settings.skailr.json`), so this is latent — but it must be closed before a second migration lands.

## [1.11.0] — 2026-08-04

### Added

- **Opt-in telemetry emission around every subagent dispatch.** All 11 orchestrator commands (`patch`, `yolo`, `ship-feature`, `build-feature`, `continue-feature`, `map-repo`, `yolo-program`, `discover`, `plan-program`, `build-program`, `continue-program`) — plus nested lead→worker dispatches (`run-feature-queue`, `run-ticket-board`, and the 8 dispatching domain leads) — now emit append-only `span.start`/`span.end` records to `.skailr/telemetry/<YYYY-MM-DD>-<emitter-id>.jsonl`, matching Skailr Console's fixed **v1 schema** exactly (`.claude/program/schemas/telemetry-event.schema.json`). One compact JSON object per line, LF-terminated, written in a single atomic `O_APPEND` syscall (no partial lines on kill, never rewritten in place); UTC-date + 100 MiB rotation; one `trace_id` per run threaded through `/continue-*` resumes; `parent_span_id` threads lead spans to their workers; `hierarchy_path` + mirror fields + a reproducible `event_hash` (`sha256` over an RFC 8785 JCS `identity_subset`). All mechanics live in one new zero-dep CLI, `scripts/skailr/emit-telemetry.mjs` (with `scripts/skailr/telemetry-smoke.mjs` as executable hash-reproducibility proof); command prose calls it with zero branching, and it **swallows every error and always exits 0** — telemetry can never block or fail an orchestrated run. **Gating is opt-in and safe-by-default:** emission is off unless `.skailr/` already exists in the project, and `.claude/settings.skailr.json`'s `telemetry.enabled` key (shipped **unset**) forces on/off when present. A project that never set up Console gets zero telemetry files. `install.sh` now copies `settings.skailr.json` **only if absent** (never resets a consumer's choice on upgrade) and adds `.skailr/` to the installed `.gitignore`; upgrades touch zero files under `.skailr/`. Full model, gating table, file/rotation convention, `event_hash` verification, and the v1 scope boundary: [docs/TELEMETRY.md](docs/TELEMETRY.md).
- **`usage` events (token/cost data) are deferred — not in v1.** No token/cost data is available from a Task result in this runtime, so `tokens_in`/`tokens_out`/`cache_read_tokens`/`cache_write_tokens`/`cost_usd` are hardcoded `null` and never fabricated. Also out of v1 (reserved in the schema, noted here rather than left silently absent): `task.transition`/`channel.post`/`agent.status`/`budget.violation` event types, the 5-status ticket board (`in-review`/`claimed_by`), channel `seen_by` markers, `correction` emission, Cursor-native emission (authored once under `.claude/`, mirrored via `remirror.sh`, but not asserted to fire under Cursor's runtime), and backfill of pre-ship runs. `status: blocked`/`over-budget` **is** carried on the eventual `span.end`.

## [1.10.0] — 2026-08-04

### Changed

- **Intair integration removed.** The optional knowledge-graph seam (`call-intair` skill, `intair-seam-expert`, `docs/intair-seam.md`, the per-role "Intair (optional)" hooks, `check-intair-seam.mjs` CI gate) has been deleted entirely. Persistent memory / run-state tracking is now exclusively via the framework's existing `.md` file mechanisms — ledger, `progress.md`, ownership maps, the registry, and channel boards — which were always the primary mechanism; Intair was a bolt-on never required by any of them.
- **Intair seam doc fidelity refresh** — `docs/intair-seam.md` corrected to match Intair's shipped behavior without any architecture change: MCP face documents the identical `INTAIR_API_TOKENS` bearer gate as REST (missing/invalid → `401 UNAUTHORIZED` before dispatch, open/dev mode when unset); Attribution notes the operator opt-in `INTAIR_API_IDENTITIES` actor-override (read back `attribution.actor`); `CONFLICT` (409) reworded as reserved-in-enum-but-not-currently-emitted (concurrent/duplicate writes each get their own `rev`); `UNAUTHORIZED` row + a caller-adapt bullet cover the `detail.reason == "acl_layer_denied"`/`acl_scope_denied` ACL-denial variant; `intair_query`/`POST /query` guardrails (write-clause deny-list, `QUERY_TIMEOUT_S`, `QUERY_MAX_RECORDS`); `id@rev` write-handle resolution semantics; a neo4j-backend capability note (text-to-Cypher, vector/hybrid recall, graceful degrade); and the "Deliberate invocation" section corrected to name the per-role "Intair (optional)" hooks alongside `/map-repo` Phase 5. Nine-code enum, live-schema caveat, and propose-then-stop rule unchanged. `.claude/experts/profiles/intair-seam-expert.md` updated to match; `npm run check:intair` green
- **docs/ refreshed in the README's structure** — INTAKE, MAP_REPO, MODEL_ROUTING, YOLO, and experts now open with a problem-framed value line and usage within seconds, then narrative, then reference (long tails in `<details>`); every fact, table, and command preserved; `experts.md`'s consult-modes table corrected to the post-audit `$ARTIFACT_ROOT/expert-*.md` paths (was pre-F-10 `.claude/tmp/`); `intair-seam.md` intentionally kept structural (it is the client side of frozen contracts pinned by `check-intair-seam.mjs`) with only a framing sentence added. Seam gate, doctor, and a full cross-doc link+anchor sweep verified green
- `docs/audits/` is gitignored local working papers — untracked from git and excluded from the npm tarball (`files` now names the six shipped docs explicitly; doctor's tarball guard rejects `docs/audits/**`)

- **README restructured** (777 → 548 lines, no factual content dropped): install-first flow with all three channels (npx, Claude Code plugin, clone-and-run) as collapsible sections within 30 seconds of the top; "Why this exists" rewritten as four problem→fix sections (one agent/every hat → plan-first specialization; chat-buried coordination → message board; seamless parallelism → frozen contracts + mechanical gates; unverified "done" → evidence-required adversarial validation); path walkthroughs and deep dives (program tier, feature pipeline, domain teams, experts, Intair quickstart) folded into `<details>` blocks; quick-chooser, command-reference, and upgrade tables kept intact. All `docs/*.md` links and the intair-seam README requirements verified green (`check-intair-seam.mjs`, doctor)

### Added

- **Context-budget-aware recursive decomposition.** Context budget is now a first-class, enforced constraint, and the program → workstream → feature → ticket nesting is generalized as recursive N-tier: any lead runs a **fit test** at startup (`estimate = input + output + iteration overhead`, ×1.5–2, `>65%` of budget → decompose along contract seams / single-writer rules, `≤65%` → execute as leaf) before dispatching, and decomposes until every leaf fits the smart zone (≤125k tokens; hard ceiling 110k). Managers manage, workers work: a lead's context holds only plan/contracts/packets/reports — never raw work product. New shared kernel: skill `fit-test`, and schema templates `dispatch-packet.template.md` (8 fields, carries a required target/soft/hard token budget), `completion-report.template.md` (6 fields, ~1000-token cap), `budget-ledger.template.md` (append-only one-line-per-agent); `handoff.template.md` gains a **Budget checkpoint (80%)** section. At 80% of budget a worker checkpoints, files a **partial** completion report, and the lead re-dispatches the remainder as a fresh agent (skill `write-handoff-and-yield` trigger 4). Every role under `.claude/agents/**` states its budget obligation by reference; every dispatch (`route-models` preamble + the 8 dispatch commands) requires the budget field. Frozen contracts now apply at every delegation boundary, not just program/workstream. Backward compatible: a task that already fits one context runs exactly as today plus two appended lines (a fit-test decision and a budget-ledger row); default budgets preserve current behavior. Full model, 9 principles, 7 anti-patterns, migration notes, and a worked example: [docs/CONTEXT_BUDGET.md](docs/CONTEXT_BUDGET.md) + [examples/recursive-decomposition/](examples/recursive-decomposition/)
- **Both publish channels moved to GitHub Actions — no local `npm publish` or manual plugin distribution again.** `.github/workflows/publish-npm.yml` publishes to npm on a `vX.Y.Z` tag push via **Trusted Publishing (OIDC)** — no `NPM_TOKEN` secret stored or needed, per [npm's CI/CD guidance](https://docs.npmjs.com/using-private-packages-in-a-ci-cd-workflow). Since Trusted Publishing can only be configured for a package that already exists on the registry, `.github/workflows/publish-npm-bootstrap.yml` (manual `workflow_dispatch` only, refuses to run if the package already exists) handles the one unavoidable first publish via a temporary token, documented as a one-time step in `PUBLISH.md`. `.github/workflows/publish-plugin.yml` validates `.claude-plugin/*.json` with `claude plugin validate . --strict` and cuts the matching GitHub Release from the tag's `CHANGELOG.md` section — Claude Code plugins have no registry, so this repo's own marketplace file *is* the publish target and validate+release is the equivalent gate. All three workflows verify the tag matches the version in `package.json`/`plugin.json` and run `doctor.mjs` before doing anything else.
- **`actionlint` gates every workflow file in CI**, pinned to v1.7.12 via the official download script (not the mutable `main` ref) — verified it would have caught the `3399d14` YAML break (F-CI) at its exact line on day one. Zero findings across all four workflow files; the one pre-existing shellcheck info-level false positive (`` `story.md` `` inside a single-quoted `grep -F` pattern — backticks there are not command substitution) is suppressed with an inline `# shellcheck disable=SC2016`.

## [1.9.1] — 2026-08-02

### Fixed

- **npm tarball was shipping this repo's own runtime/dogfood state.** `package.json`'s `files` field listed `".claude"` (and other directories) wholesale — npm includes a listed directory verbatim from disk and **bypasses `.gitignore` entirely** when `files` is present, so every gitignored working file sitting in the checkout (this repo's own `research.md`, `spec.md`, `ledger.md`, contracts, workstream reports, `.claude/settings.local.json`, the full `.claude/experts` dogfood roster) rode along in 1.9.0 — 284 files / 1.7 MB unpacked, most of it internal history no consumer should receive. `files` now lists exact paths mirroring what `install.sh` actually copies (207 files / 1.2 MB, verified against the installer's own copy list). `doctor.mjs` gained a pack-repo-only "npm tarball contents" check — runs `npm pack --dry-run --json` and fails on any `.claude/tmp/**`, `.claude/repo/**`, `.claude/experts/**`, `.claude/settings.local.json`, or non-template `.claude/program/**` path — so this class cannot ship silently again (verified: passes on the fix, fails with the exact leaked paths on the reverted config)

## [1.9.0] — 2026-08-02

### Added

- **Claude Code plugin channel** — `.claude-plugin/plugin.json` + `.claude-plugin/marketplace.json` make this repo its own marketplace: `claude plugin marketplace add ns-3e/skailr-agents` then `claude plugin install skailr-agents@skailr`; the plugin exposes `/skailr-agents:install` (bootstraps the full pack into the project via the real installers, then doctor-verifies) and `/skailr-agents:doctor`. `claude plugin validate .` passes; `doctor.mjs` validates the manifests and CI's version-consistency gate now covers `plugin.json` (four versions move together)
- **npm / npx install channel** — `npx skailr-agents [target-dir] [--claude-only|--cursor-only]` runs the real installers (`install.sh` on POSIX, `install.ps1` on Windows) via a thin `bin/skailr.mjs` wrapper; `package.json` is now publishable (bin, files whitelist, repository/license/keywords metadata). Verified end-to-end from a packed tarball: full install, doctor green in the target, `.claude/experts/` untouched, flag passthrough

### Fixed

- CI workflow was un-parseable since 2026-07-31 (`3399d14`): heredoc bodies at column 0 inside a `run: |` block terminate the YAML scalar, so GitHub created zero jobs and every push failed in 0s. The ticket-board fixture now uses indentation-safe `printf`; `doctor.mjs` gained a pack-repo check that fails on any column-0 line inside a workflow `run: |` block so this class cannot ship silently again

## [1.8.0] — 2026-08-02

### Fixed

- `install.ps1`: `$PackagedRules` now includes `expert` and `expert-scout` (Windows installs lacked both Cursor rules while `install.sh` shipped them) — caught by `doctor.mjs`'s installer-parity check on its first run
- `archive-program.mjs` no longer labels a no-ledger run `complete=true` — dry-run/report now say `ledger=no-ledger (archiving as leftovers)`, and skill `archive-program-state` documents the rule (pre-freeze kills are leftovers, archived not deleted) (audit F-13 / backlog B-7)

### Added

- `scripts/skailr/rotate-channels.mjs` — mechanical channel rotation: boards over `--max-resolved` (default 50) settled messages have their fully-settled threads moved, raw blocks verbatim, to `archive-<board>.md`; open and partially-settled threads never move, so append-only semantics are preserved; skill `route-channels` runs it after each drain and `archive-program.mjs` sweeps `archive-*.md` boards into the program archive (backlog B-10, per decision H-2)
- **Domain teams honor a workstream root** — the 21 content/design/finance/legal/marketing/pm agents that hardcoded `.claude/program/workstreams/<ws>/…` now parameterize on `WS_ROOT` (default unchanged: `.claude/program/workstreams/<ws>`; standalone runs pass `WS_ROOT=.claude/tmp`); `/build-program` prepends `WS_ROOT` to domain-team dispatches; the new block is canonical block #6 in `check-blocks.mjs` (backlog B-6, the inverse of audit F-10)
- **Intake tie-breakers** — before committing to a build row, plain-chat intake (a) offers `/map-repo` in one sentence when a build ask lands on a non-trivial repo with no `.claude/repo/orientation.md` (builds immediately if declined, never auto-runs), and (b) confirms `/yolo-program` when an ask names three or more separable capabilities phrased as one feature (`.claude/intake.md` → `CLAUDE.md`/`intake.mdc` via remirror; `docs/INTAKE.md`) (backlog B-13)
- **Channel staleness signals** — `validate-channels.mjs` prints `age=` (messages posted since) per inbox item and warns (never fails) on addressees matching no team, agent role, `ws-*`, or `@human/@all/@architect` (`--roster` to point at a different registry, `--no-roster` to disable); skill `route-channels` escalates items with `age >= 10` or an addressee WARN instead of letting them wait their turn (backlog B-9)
- **Verification evidence requirements** — `e2e-verifier` must paste the runner's real final output verbatim (`## Test Run Output`; typed totals are a claim, not evidence) and `validator` flags its absence; `validator` Requirements Coverage is now an AC-by-AC verdict table with evidence paths, and Pass 3 runs `check-ownership` itself against the final diff and pastes the output (`## Out-of-Scope Write Scan`) (backlog B-11)
- `scripts/skailr/status.mjs` (`npm run status`) — one read-only view of the in-flight run: ledger phases + cursors, active feature (nested cursor root or standalone `.claude/tmp`), ticket counts + frontier, channel inbox with age (messages posted since), ledger blockers (backlog B-3)

### Fixed

- `ledger-status.mjs` treats `done` as terminal alongside `complete` — a finished ledger using `done` rows (as `archive-program.mjs` and the shipped example do) no longer reports `next: A_kernel`, which `/continue-program` reads as a resume target

### Added

- **Contract-version-consumed stamps** — workstream rollups now record `built-against: <contract-id>@<version>` per consumed frozen contract (skill `run-feature-queue`), `check-contracts.mjs --consumed` cross-checks stamps against current contract versions and fails on stale consumers, and `integration-verifier` runs the cross-check first and pastes its output — a mid-flight contract bump can no longer leave a consumer silently built against the old interface (backlog B-8)
- `scripts/skailr/doctor.mjs` (`npm run doctor`, in CI) — one-shot read-only health check for a skailr installation: core files, agents (name=filename, no flat files), skill/script references resolve, delegated validators (model routing, agent tools, experts, contracts, channels), mirror presence; pack-repo-only: version consistency, manifest paths, installer-array ↔ mirror parity, canonical blocks. Distinguishes FAIL from SKIP so "all green" can no longer mean "nothing ran" (backlog B-1)
- `scripts/skailr/check-blocks.mjs` (`npm run check:blocks`, in CI) — canonical-boilerplate byte-identity lint: the blocks deliberately repeated across agent files (tone, task-return, artifact-root, context-handoff, cleanup-before-done) must stay identical across carriers; role-specific extensions after a block are allowed, deliberate variants are excluded in the manifest (backlog B-2)
- CI now runs `check-intair-seam.mjs`, `check-experts.mjs`, a version-consistency check (package.json = manifest.json = latest CHANGELOG cut), and a mirror-freshness check (`remirror.sh` must reproduce the committed tree) — the four gaps that let audit findings F-1 and F-2 rot undetected (audit F-14)

### Fixed

- Docs: `docs/experts.md` says "Step 0–9 procedure" instead of "nine steps" (mint-expert has ten labeled steps) and clarifies that the T3 mint-trigger list is narrower than the consult-or-mint wiring list on purpose; `.claude/teams/registry.md` explains why portfolio/program-tier roles are absent and that engineering's lead is a skill; removed stray empty `assets/Untitled` (audit F-17, F-18, F-19, F-20)
- `install.ps1`: `$PackagedCommands` now includes `mint-expert` (Windows installs silently lacked `.cursor/commands/mint-expert.md` while `install.sh` shipped it), and the gitignore list drops the extra `!.claude/program/schemas/**` line to match `install.sh` exactly (audit F-8)
- **Nested-run path discipline** — the feature commands (`/yolo`, `/ship-feature`, `/build-feature`, `/continue-feature`) now parameterize every script gate, state write, and expert dispatch on `$ARTIFACT_ROOT` instead of hardcoding `.claude/tmp` (`check-ownership --from-spec`, `feature-status --progress/--root`, `request.md`/`mode.md`/channels seeding); the `expert` role writes `expert-<slug>.md` / `expert-verdict-<slug>.md` under `$ARTIFACT_ROOT` so parallel program features no longer collide on consult files, matching where `architect`/`story-writer`/`validator` already read them; skills `route-channels` and `check-ownership` document the nested invocation forms. Standalone runs are unchanged (`ARTIFACT_ROOT` defaults to `.claude/tmp`) (audit F-10)
- `/build-program`: removed a truncated, misplaced duplicate of the field-guide init instruction from §2 (the complete instruction lives in Phase A) (audit F-16)
- `check-contracts.mjs`: contract `status` is validated strictly against `draft|frozen|superseded` — any value containing `|` previously bypassed validation entirely (templates live under `schemas/`, which the script never scans, so the carve-out protected nothing) (audit F-7)
- `emit-stubs.mjs`: contracts with no OpenAPI/JSON-Schema sidecar are now named in the output instead of being silently uncounted — `emitted 0` is distinguishable from "nothing to do" (audit F-12)
- `check-ownership.mjs`: git diff is invoked with an argument vector (`execFileSync`) instead of string interpolation — a `--base`/`baseRef` with spaces or metacharacters can no longer break or inject; when the diff cannot be obtained at all the gate now exits 1 instead of reporting `OK … 0 path(s) checked` (audit F-5)
- `check-ownership.mjs` / `ticket-status.mjs`: ownership globs using unsupported syntax (`{}`, `?`, `[]`) are rejected loudly instead of being matched as literals, which silently missed overlaps and misreported real paths as unowned (audit F-6)
- `validate-channels.mjs`: resolved/answered messages leave the inbox regardless of type or addressee — fresh installs no longer report the seeded worked example as `inbox=2`, and `--strict-inbox` can pass after a contract-change is resolved (audit F-3)
- `validate-channels.mjs`: a `### MSG-` heading that fails to parse (e.g. missing `---` separator) is now a validation error instead of silently vanishing from routing and validation (audit F-4)
- `check-intair-seam.mjs` AC-8 no longer fails the shipped repo: command/skill mentions of Intair are allowed when (and only when) they route through skill `call-intair`; bare coupling and auto-trigger phrasing still fail (audit F-1)

## [1.7.0] — 2026-08-02

### Added

- **Auto-archive program state on complete** — skill `archive-program-state` + `scripts/skailr/archive-program.mjs` move live `.claude/program/` runtime into `archive/<ts>-<slug>/` when the ledger reaches `complete` (before worktree cleanup). `/discover` and `/yolo-program` Setup no longer ask the user to archive finished leftovers; incomplete resume still never auto-archives. `--force` covers explicit start-over / new initiative.

### Changed

- **Expert consult-or-mint** — skill `consult-or-mint` is now the only build/map procedure for matching bands and T3/T2 auto-mint. Empty `.claude/experts/` / `registry.md` is an empty roster for consult, **not** a skip of mint evaluation. T3 runs after research/brief evidence (not at cold start); re-consults after mint; co-author/gate read carried-forward `matched:` slugs and must not narrate “no experts registry.” Signal table adds researcher/architect path evidence; threshold stays 2. Wired through `/yolo`, `/ship-feature`, `/patch`, `/plan-program`, `/yolo-program`, `/build-program`, `/build-feature`, `/map-repo`, `/discover`. Guide: [docs/experts.md](docs/experts.md).
- **Model routing — balanced profile worker downgrades.** In the `balanced` profile, `backend-engineer`, `frontend-engineer`, `content-writer`, `designer`, and `fin-modeler` move from `opus` to `sonnet`. These worker roles execute against a fully-specified spec produced by an upstream `opus` planner (architect / team lead), so they get comparable quality at far lower token cost. Planners, leads, verifiers, and validators stay on `opus`; `data-engineer` also stays `opus` (schema reasoning often lacks a full upstream spec). `.claude/model-routing.json` and the Cursor mirror `.cursor/model-routing.md` both updated.
- **Model routing — economy profile Haiku expansion.** In the `economy` profile, `pm-planner`, `channel-planner`, and `legal-analyst` move from `sonnet` to `haiku` — templated, low-reasoning output (milestone calendars, channel plans, clause drafts) produced against a complete brief. Economy `backend-engineer` and `frontend-engineer` remain `opus`.
- **Architect — megafile threshold rule.** The `architect` Work split step (Process step 6) now requires a megafile check: any file in the work split projected to exceed **400 lines** after the feature lands must be named with its projected count and a decomposition plan before it is assigned to an engineer. Mirror `.cursor/rules/architect.mdc` updated.
- **Validator — four named passes.** The `validator` Checks section is restructured into four sequential, named passes run in order, each completed fully before the next: **Pass 1 — Requirements & Spec Conformance** (requirements coverage, spec conformance, verification honesty, expert verdicts), **Pass 2 — Security**, **Pass 3 — Quiet Skips & Scope**, and **Pass 4 — UX Quality** (skill `apply-ux-quality`, user-visible UI only). No check category was dropped; the existing lenses are regrouped under the passes. Mirror `.cursor/rules/validator.mdc` updated.

### Added

- **Program field guide** — a shared, program-scoped knowledge base seeded by the researcher/architect at the start of a program run and appended to by agents as they discover non-obvious constraints, patterns, and failure modes. It is injected at the start of each agent's context by the program orchestrators. Runtime file lives at `.claude/program/field-guide.md` (100-line budget, trim-oldest by convention); the seed template ships at `.claude/program/schemas/field-guide.template.md`. Wired into `/build-program` and `/yolo-program` (Phase A init + Phase B injection), with Cursor command mirrors updated to match.
- **Project domain experts** — mintable project-local depth profiles under `.claude/experts/` (mechanism in the pack; roster stays in the consumer project). Pack roles `expert` and `expert-scout`; command `/mint-expert`; skill `curate-expert`; validator `scripts/skailr/check-experts.mjs`; kernel schemas/templates under `.claude/program/schemas/expert*`. Advise / co-author / soft-gate wiring in intake, `/map-repo` post-confirm auto-mint, and build consult-or-mint (`/yolo`, `/yolo-program`, `/ship-feature`, `/patch`, `/plan-program`). Guide: [docs/experts.md](docs/experts.md). This repo dogfoods `skailr-pack-expert` and `intair-seam-expert` (not shipped by `install.sh`).
- **`/map-repo`** brownfield bootstrap — durable orientation, draft ownership, assessment findings, ranked backlog, human confirm, optional Intair Phase 5. Artifacts under `.claude/repo/` (tracked). Guide: [docs/MAP_REPO.md](docs/MAP_REPO.md). Researcher **repo mode**; schemas `orientation`, `backlog`, `map-repo-progress`, `map-report`. Intake routes onboard/brownfield/map signals to `/map-repo`. YOLO / discover / patch / program-architect prefer `.claude/repo/` when present.

### Changed

- README credits [Smith | Advanced Systems](https://advsys.io) as the research and development lab skailr-agents came out of
- README attribution paragraph cites the product website [skailr.io](https://skailr.io) for more info
- README header links for License, Claude Code, Cursor, and Cursor Agent render as shields.io badges instead of plain text links; destinations unchanged
- Installers create `.claude/repo/`; CONTRIBUTING documents remirror `COMMANDS` + Cursor allowlists when adding commands
- Intake chooser, README command reference, and [docs/INTAKE.md](docs/INTAKE.md) / [docs/MAP_REPO.md](docs/MAP_REPO.md) / [docs/YOLO.md](docs/YOLO.md) point at experts and `/mint-expert` where commands list surfaces
- Release cut to `1.7.0`. `scripts/remirror.sh` now reads the manifest version from `package.json` (single source) instead of a hardcoded constant, so package/manifest version drift cannot recur

## [1.6.0] — 2026-07-29

### Added

- **Design, marketing, and finance domain teams** (`status: built`) — agents under `.claude/agents/{design,marketing,finance}/`, contract kinds `design | campaign | financial`, skill `reconcile-model`, multi-domain fixture [examples/launch-kit/](examples/launch-kit/)
- Registry: restored missing `### content` header; flipped design/marketing/finance to built
- **skailr ↔ Intair client seam (v1)**: guide at [docs/intair-seam.md](docs/intair-seam.md), skill `call-intair`, gate `scripts/skailr/check-intair-seam.mjs` (`npm run check:intair`). Documentation only: no live coupling, no auto-ingest, no webhooks, no skailr-side schema approval

### Changed

- `.gitignore` ignores local `src/` checkouts and `__pycache__/` so sibling product trees are not published with the pack
- Release cut to `1.6.0`: `package.json`, `manifest.json`, and the manifest version constant in `scripts/remirror.sh`
- `PUBLISH.md`: pre-release smoke runs `scripts/skailr/check-intair-seam.mjs`; release example retitled to v1.6.0; the "do not" list covers local `src/` checkouts

## [1.5.0] — 2026-07-28

### Added

- **Plain-chat intake** — `.claude/intake.md` + skill `route-intake`; remirror emits always-applied `.cursor/rules/intake.mdc` and root `CLAUDE.md`. Questions → researcher ask mode; small changes → `/patch`; one feature → `/yolo`; whole app → `/yolo-program`. See [docs/INTAKE.md](docs/INTAKE.md)
- `/patch` — YOLO-style ad-hoc fix with lineage sync (skill `sync-lineage`), docs reconcile, light verify; size-gates up to `/yolo` / `/yolo-program`
- Researcher **ask mode** — writes `.claude/tmp/ask.md` for plain-chat Q&A
- Schema `patch-report.template.md`

### Changed

- **Uniform agent layout** — all agents live under `.claude/agents/<subdir>/` (`engineering/`, `program/`, `portfolio/`, `content/`, `legal/`, `pm/`); no flat files at agents root. Installers, remirror, CI, and model-routing discovery follow subdirs only
- Installers copy `CLAUDE.md`, `.claude/intake.md`, and the `intake` Cursor rule; `patch` added to packaged commands
- README / YOLO chooser document intake and `/patch`
- README Path D documents portfolio commands with a business-role mapping (CEO/PMO strategy → planning → exec status)
- README Paths A–C2 + **Command reference** map every slash command to a business role; command `description:` frontmatter (and remirror) include the same cues; YOLO/INTAKE cross-links updated

## [1.4.0] — 2026-07-28

### Added

- Mid-slice **context handoff**: schema `handoff.template.md`, skill `write-handoff-and-yield`, and orchestrator re-dispatch so build workers (`backend` / `frontend` / `data`) can yield a fresh Task before context quality collapses
- `feature-status.mjs` reports `handoffs` when `.claude/tmp/handoff/<slice>.md` exists; resume skills and build/continue/yolo commands continue-from-handoff

### Changed

- Feature progress template documents the `## Handoffs` convention
- Engineer agents and feature/program orchestrator commands honor `YIELD:` with a 5-yield cap per slice

## [1.3.0] — 2026-07-28

### Added

- `/yolo` — one-shot workstream pipeline (skip story/spec human gates); see [docs/YOLO.md](docs/YOLO.md)
- `/yolo-program` — one-shot program pipeline (skip discover/plan freezes; auto-decide mid-build escalations); see [docs/YOLO.md](docs/YOLO.md)
- Feature phase cursor: `.claude/tmp/progress.md` + `scripts/skailr/feature-status.mjs` + skill `resume-from-feature-progress` (survive Claude Code usage-limit / session death)
- README quick start for Claude Code CLI (greenfield → feature or whole-app paths)
- **Model routing** — `.claude/model-routing.json` profiles (`economy` / `balanced` / `quality`), `scripts/skailr/apply-model-routing.mjs`, skill `route-models`, Cursor mirror `.cursor/model-routing.md`; see [docs/MODEL_ROUTING.md](docs/MODEL_ROUTING.md)

### Removed

- Control plane monorepo: `@skailr/core`, `@skailr/server`, `@skailr/cli`, `@skailr/web` (CEO inbox UI)
- `skailr` CLI / `skailr serve`, JSON store under `.skailr/`, and demo-seed import path
- Browser UI bootstrap / token injection and `Assets/ui.png`
- Standalone `RELEASE_NOTES_v1.1.0.md` and `RELEASE_NOTES_v1.2.0.md` (history lives in this changelog)

### Changed

- Repo is pack-only again: Claude Code / Cursor agent operating model + `scripts/skailr/*.mjs`
- Intair TypeScript stub lives at `docs/intair-client.stub.ts`
- Installers no longer append `.skailr/` or apps/packages dist ignore lines
- `/yolo` / `/yolo-program` / `/ship-feature` resume incomplete runs instead of auto-archiving; `/continue-feature` and `/continue-program` are mode-aware (YOLO vs gated)

## [1.2.0] — 2026-07-28

### Added

- Control plane monorepo: `@skailr/core`, `@skailr/server` (Hono + JSON event store), `@skailr/cli`, `@skailr/web` (CEO inbox UI)
- Mechanical enforcement scripts under `scripts/skailr/` + Claude hooks fragment + git pre-commit sample
- Skills and meta-skills under `.claude/skills/`
- `/continue-feature`, `/continue-program`, portfolio commands (`/discover-portfolio`, `/plan-portfolio`, `/status-portfolio`)
- Legal/compliance and PM/delivery domain teams (registry `built`)
- First-run **demo seed** of `examples/parallel-api` when no real `ledger.md` / empty store; `skailr sync import --demo`
- `RELEASE_NOTES_v1.2.0.md` and updated publish checklist

### Changed

- Build/plan commands require script gates; installers ship scripts, skills, and schemas
- Manifest / remirror cover new agents, commands, skills, and schemas (v1.2.0)
- Browser UI paths (`/`, `/assets/*`) are public; token injected into served HTML

## [1.1.0] — 2026-07-25

### Added

- Agent **channels** message board (`.claude/program/channels/`) with `PROTOCOL.md`, seeded `program.md` example, and `feature.md` template
- Orchestrator router loops in `/build-feature` and `/build-program`
- Workstream-tier `validator` agent
- Installers (`install.sh`, `install.ps1`), `manifest.json`, Cursor mirror under `.cursor/`
- Channel-aware instructions across agents; blockers / contract-change-requests subsumed by typed channel messages

### Changed

- Layout: authoritative Claude Code tree under `.claude/`; Cursor rules/commands generated from it
- Gitignore carve-outs so channel protocol templates stay tracked while program runtime state stays ignored

## [1.0.0] — 2026-07-25

### Added

- Initial two-tier multi-agent build system (program + workstream) for Claude Code and Cursor
