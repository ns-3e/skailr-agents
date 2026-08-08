# Update check

**An installed pack has no way to tell you it is out of date — there is no update command, and `npx skailr-agents` only ever installs what you asked for, so a project can sit three minor versions behind for months without a single signal.** Skailr now checks the public npm registry at most once every 24 hours and prints **one line** when a newer `skailr-agents` exists — **on by default, check-and-notify only, and structurally incapable of blocking or failing your run.** It never upgrades anything: upgrading stays a manual installer re-run that you decide to make.

This is the pack's **first and only runtime network call**. Everything it sends is described below in full.

## Verify it / turn it off (30 seconds)

The check is **on by default**: the pack ships `.claude/settings.skailr.json` with `"autoUpdate": { "enabled": true }`, and a third `Stop` hook entry that runs `scripts/skailr/check-update.mjs` after each turn.

```bash
cat .skailr/installed-version.json         # the version the installer stamped
cat .skailr/update-check.json              # last attempt time + last seen registry version
node scripts/skailr/check-update.mjs --json  # one JSON line: what it would do right now
node scripts/skailr/update-smoke.mjs       # executable proof: 82 hermetic cases, no network
```

To opt out, flip the shipped key in `.claude/settings.skailr.json` — the same shape and the same precedent as [telemetry](TELEMETRY.md):

```jsonc
{ "autoUpdate": { "enabled": false }, "telemetry": { /* unchanged */ }, "hooks": { /* unchanged */ } }
```

**This explicit key is the only supported opt-out.** With `enabled: false` the script returns **before** it reads any state file, before it writes anything, and before any network call is attempted — there is no "check quietly anyway" path. The gate is re-read from disk on every single invocation, so the opt-out takes effect on the very next turn; nothing is cached in memory or on disk.

`install.sh`/`install.ps1` copy `settings.skailr.json` **only if absent**, so your choice survives upgrades — and the upgrade migrations that fill this key into older installs never overwrite an explicit `true` *or* `false` ([Upgrading from ≤ 1.12.1](#upgrading-from--1121)).

## What leaves your machine

Exactly one unauthenticated GET, and only when a check is actually due:

```http
GET https://registry.npmjs.org/skailr-agents/latest
accept: application/json
```

- **No authentication** — no `Authorization` header, no cookie, no npm token, no `.npmrc` read. The endpoint is the public registry document for a public package.
- **No identifying information** — no custom `User-Agent` (undici's Node-version-default `user-agent: node` is sent, unmodified), no query string, no request body, no repo name, path, git remote, machine id, or username. The header set is undici's default for a given Node version, so it is identical across machines on the same Node version.
- **No telemetry event** — the check emits no span and writes nothing under `.skailr/telemetry/`. It is not part of the telemetry pipeline and does not consult `telemetry.enabled`.
- **Nothing is uploaded.** Your installed version is never transmitted; it is read locally and compared locally against the registry's answer.
- **Only `version` is consumed** from the response. Every other field is ignored.

What the registry can infer is what any unauthenticated `npm view` reveals: that some IP fetched a public package document. That is the entire privacy surface.

Response handling is bounded so a hostile or broken registry cannot hang or flood the hook: 2500 ms `AbortSignal.timeout`, non-200 discarded, bodies over 1 MB discarded — counted as the bytes arrive and the connection dropped the moment the ceiling is passed, so a chunked body with no `content-length` is never buffered in full — `version` strings over 128 chars or failing a strict semver regex discarded. Every one of those paths is silent and exits 0.

## Cadence

| | |
| --- | --- |
| **Trigger** | `Stop` hook — after a turn ends, alongside the existing channel and expert checks |
| **Throttle** | at most one check per **24 h**, keyed on the last **attempt**, not the last success |
| **State** | `.skailr/update-check.json` (`lastCheckAt`, `lastLatest`) |
| **On the ~99% of turns that are not due** | two small file reads, no network, no writes, no output |

The stamp is written **before** the request goes out. A timeout, an offline laptop, a registry outage, or a killed process therefore still consumes the 24 h window — a broken network can never turn the check into a per-turn retry storm. `lastLatest` records the last version successfully parsed, for inspection only; it is never used to suppress a notice.

The 24 h claim is a read-then-write on `update-check.json` with no lock, so if two or more Claude Code sessions in the **same repo** happen to end within the same instant, each may read "due" before any has written the stamp and print its own copy of the notice. The state file itself stays valid and the 24 h window is still consumed exactly once (writes are atomic temp-file + rename) — only the "at most one notice" framing is affected, and only for genuinely simultaneous sessions.

If a due check finds a newer version, the notice prints **every** due check until you upgrade. There is no "already told you" suppression flag and no snooze — the only way to stop the line is to upgrade or to opt out.

## The notice

It appears on **stdout of the Stop hook**, as one line, and nothing else is ever printed:

```text
skailr-agents: update available — installed 1.13.0, latest 1.14.0. Re-run the installer to upgrade: npx skailr-agents@latest .
```

It states the version you have, the version that exists, and the command you would run. **That command is for you to run, not for the pack to run.** No auto-apply exists anywhere in the code path — there is no flag, no prompt, and no deferred job that upgrades on your behalf. Upgrading is always a deliberate, manual re-run of an install channel (`npx skailr-agents@latest .`, `/skailr-agents:install`, or `./install.sh /path/to/project`), on your schedule, reviewable as a normal diff.

Everything else is silent: not due, opted out, no marker, offline, malformed response, or already up to date all print nothing at all on stdout. The hook entry is `node scripts/skailr/check-update.mjs 2>/dev/null || true` — stderr is swallowed and a nonzero exit is impossible anyway, since the script exits 0 on every path including usage errors.

## Where the state lives

```text
<repo>/.skailr/installed-version.json    # written by the installers only
<repo>/.skailr/update-check.json         # written by the check only
```

```jsonc
// installed-version.json
{ "schema": "skailr.installed-version/v1", "version": "1.13.0", "installedAt": "2026-08-05T12:00:00.000Z" }
// update-check.json
{ "schema": "skailr.update-check/v1", "lastCheckAt": "2026-08-05T12:00:00.000Z", "lastLatest": "1.13.0" }
```

- `installed-version.json` is stamped by `check-update.mjs --record-install`, which **both installers** call on every claude-mode install and upgrade (cursor-only installs skip it). It records the pack's own `package.json` version at install time — the only source of "what you have". If it is missing or unparseable, the check stops immediately with no network call and no state write: an unknown installed version is never guessed at.
- Two separate files with two separate writers, so a runtime check can never corrupt the installer-owned marker. Both are written atomically (temp file + rename) — a killed process leaves the previous valid file, never a torn one.
- Both live under `.skailr/`, which both installers already add to the installed project's `.gitignore`. **Writes never leave `<repo>/.skailr/`** — no home-directory cache, no npm cache, nothing under `.claude/`, and nothing under `.claude/experts/`, which this path never reads, enumerates, or opens.

### Upgrading from ≤ 1.12.1

> **1.14.0 note:** the `autoupdate-stop-hook` migration below was removed in 1.14.0. Hooks
> (including `check-update.mjs`'s Stop entry) now live in `.claude/settings.json` — the only
> settings filename Claude Code actually auto-loads — which every install/upgrade always
> copies from the pack, so the hook reaches your project unconditionally and no migration is
> needed. This section is kept as an accurate historical record of what upgrading through
> 1.13.0 did.

`install.sh` still never overwrites an existing `.claude/settings.skailr.json` — so, exactly as with telemetry in 1.12.0, two additive install migrations carry the new default into your existing file on your next upgrade, and print the lines they changed:

| Migration | What it does |
| --- | --- |
| `autoupdate-enabled-default` | fills `"autoUpdate": { "enabled": true }` if the key is absent or holds a non-boolean |
| `autoupdate-stop-hook` | appends the `check-update.mjs` entry to your existing `hooks.Stop` block |

Both obey the same **additive-only** rule as `telemetry-enabled-default`:

| Your existing `.claude/settings.skailr.json` | What happens |
| --- | --- |
| no `autoUpdate` key, or `"autoUpdate": {}` | fills `enabled: true` |
| `"autoUpdate": { "enabled": false }` | **left alone** — an explicit opt-out is never overwritten, on this or any future upgrade |
| `"autoUpdate": { "enabled": "yes" }` / `1` / `null` — non-boolean | replaced with `true` (a non-boolean was never a working setting) |
| `"autoUpdate": "on"` / `7` / `[]` — the key is not an object | **skipped with a warning**; fix it by hand |
| a `Stop` hook entry already mentioning `check-update.mjs` | no second entry appended — re-running an install is a byte-for-byte no-op |
| your own third-party `Stop` hook entries | preserved verbatim, in order; the new entry is appended after them |
| `hooks` or `hooks.Stop` absent or deleted | **not resurrected** — you get the `autoUpdate` key but no notice, which is a de-facto opt-out |
| file is not valid JSON | skipped with a warning; the file is never opened for write |

Both migrations always exit 0 and can never fail an upgrade; `--cursor-only` installs skip them entirely. `doctor.mjs` holds the wiring together with two checks — `autoupdate settings default` (the shipped template really does default to `true`) and `autoupdate wiring` (the script exists, the template's hook entry is present with the swallow suffix, and both installers declare both migration ids) — plus the pre-existing three-way migration-id parity row.

## Scope boundary

Deliberately **not** in this release, noted here so the gap is visible rather than silently absent:

- **No auto-upgrade, ever** — not as a flag, not as a prompt, not opt-in. Check-and-notify is the whole feature; applying an upgrade is a decision, not a background task.
- **No release notes, changelog fetch, or severity classification** in the notice. It reports two version numbers and where to go; read [CHANGELOG.md](../CHANGELOG.md) to decide whether to upgrade.
- **No configurable interval, registry, or notice format.** The 24 h throttle and the public npm registry are fixed; the only setting is on/off. (`SKAILR_UPDATE_REGISTRY` exists solely so the hermetic smoke suite can run with all egress blocked — it is a test seam, not a supported configuration.)
- **No Cursor-native notice.** The check is wired to the Claude Code `Stop` hook; a `--cursor-only` install gets no marker and no notice.
- **No proxy/offline-mirror configuration.** Behind a proxy that blocks `registry.npmjs.org`, every check silently fails, consumes its 24 h window, and prints nothing — the intended degradation, not an error to report.

## Testing it yourself

`node scripts/skailr/update-smoke.mjs` is hermetic (local `node:http` stub, no egress) and covers the timeout, the hostile-response matrix, and both install migrations. One case is **opt-in and non-hermetic**, because the bug it guards — a hook that outlived its 2.5 s timeout when the registry's SYN was black-holed — cannot be reproduced against a local socket:

```sh
SKAILR_SMOKE_BLACKHOLE=10.255.255.1:81 node scripts/skailr/update-smoke.mjs   # asserts the hook still ends in ~2.5s
```

Unset (CI and the default run), that case reports `--  … (skipped)` and nothing leaves the machine.
