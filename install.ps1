# Install skailr-agents (.claude + .cursor trees + scripts/skills) into a target project.
# Usage: .\install.ps1 -TargetPath C:\path\to\project [-ClaudeOnly] [-CursorOnly]

param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$TargetPath,
    [switch]$ClaudeOnly,
    [switch]$CursorOnly
)

$ErrorActionPreference = "Stop"

if ($ClaudeOnly -and $CursorOnly) {
    Write-Error "Use only one of -ClaudeOnly or -CursorOnly"
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not (Test-Path $TargetPath)) {
    New-Item -ItemType Directory -Path $TargetPath -Force | Out-Null
}
$Target = (Resolve-Path $TargetPath).Path

$Mode = if ($ClaudeOnly) { "claude" } elseif ($CursorOnly) { "cursor" } else { "both" }
Write-Host "Installing skailr-agents → $Target (mode: $Mode)"

function Install-Scripts {
    New-Item -ItemType Directory -Path "$Target\scripts\skailr" -Force | Out-Null
    New-Item -ItemType Directory -Path "$Target\scripts\hooks" -Force | Out-Null
    Get-ChildItem "$ScriptDir\scripts\skailr\*.mjs" | ForEach-Object {
        Copy-Item $_.FullName "$Target\scripts\skailr\" -Force
        Write-Host "  + scripts/skailr/$($_.Name)"
    }
    $hook = Join-Path $ScriptDir "scripts\hooks\pre-commit.sample"
    if (Test-Path $hook) {
        Copy-Item $hook "$Target\scripts\hooks\" -Force
        Write-Host "  + scripts/hooks/pre-commit.sample"
    }
}

function Install-Claude {
    $dirs = @(
        "$Target\.claude\agents",
        "$Target\.claude\commands",
        "$Target\.claude\teams",
        "$Target\.claude\skills",
        "$Target\.claude\tmp",
        "$Target\.claude\repo",
        "$Target\.claude\program\channels",
        "$Target\.claude\program\schemas"
    )
    foreach ($d in $dirs) {
        New-Item -ItemType Directory -Path $d -Force | Out-Null
    }

    $agentsRoot = Join-Path $ScriptDir ".claude\agents"
    Get-ChildItem $agentsRoot -Directory | ForEach-Object {
        $team = $_.Name
        $dest = Join-Path $Target ".claude\agents\$team"
        New-Item -ItemType Directory -Path $dest -Force | Out-Null
        Get-ChildItem $_.FullName -Filter "*.md" | ForEach-Object {
            Copy-Item $_.FullName $dest -Force
            Write-Host "  + .claude/agents/$team/$($_.Name)"
        }
    }
    Get-ChildItem "$ScriptDir\.claude\commands\*.md" | ForEach-Object {
        Copy-Item $_.FullName "$Target\.claude\commands\" -Force
        Write-Host "  + .claude/commands/$($_.Name)"
    }
    Copy-Item "$ScriptDir\.claude\teams\registry.md" "$Target\.claude\teams\registry.md" -Force
    Write-Host "  + .claude/teams/registry.md"

    if (Test-Path "$ScriptDir\.claude\skills") {
        Copy-Item "$ScriptDir\.claude\skills\*" "$Target\.claude\skills\" -Recurse -Force
        Write-Host "  + .claude/skills/"
    }

    foreach ($f in @("PROTOCOL.md", "program.md", "feature.md")) {
        Copy-Item "$ScriptDir\.claude\program\channels\$f" "$Target\.claude\program\channels\$f" -Force
        Write-Host "  + .claude/program/channels/$f"
    }

    if (Test-Path "$ScriptDir\.claude\program\schemas") {
        Get-ChildItem "$ScriptDir\.claude\program\schemas\*" | ForEach-Object {
            Copy-Item $_.FullName "$Target\.claude\program\schemas\" -Force
            Write-Host "  + .claude/program/schemas/$($_.Name)"
        }
    }

    # Copy settings.skailr.json only if absent: it may carry a consumer's telemetry
    # enable/disable choice (optional `telemetry.enabled` key), which a blind overwrite
    # on upgrade would silently reset. Preserve consumer intent (AC-26).
    $settings = Join-Path $ScriptDir ".claude\settings.skailr.json"
    if (Test-Path $settings) {
        if (Test-Path "$Target\.claude\settings.skailr.json") {
            Write-Host "  = .claude/settings.skailr.json exists (preserved; consumer telemetry choice kept)"
        } else {
            Copy-Item $settings "$Target\.claude\settings.skailr.json" -Force
            Write-Host "  + .claude/settings.skailr.json"
        }
    }

    $routing = Join-Path $ScriptDir ".claude\model-routing.json"
    if (Test-Path $routing) {
        Copy-Item $routing "$Target\.claude\model-routing.json" -Force
        Write-Host "  + .claude/model-routing.json"
    }

    $intake = Join-Path $ScriptDir ".claude\intake.md"
    if (Test-Path $intake) {
        Copy-Item $intake "$Target\.claude\intake.md" -Force
        Write-Host "  + .claude/intake.md"
    }

    $claudeMd = Join-Path $ScriptDir "CLAUDE.md"
    if (Test-Path $claudeMd) {
        Copy-Item $claudeMd "$Target\CLAUDE.md" -Force
        Write-Host "  + CLAUDE.md"
    }

    foreach ($keep in @("$Target\.claude\tmp\.gitkeep", "$Target\.claude\program\.gitkeep", "$Target\.claude\repo\.gitkeep")) {
        if (-not (Test-Path $keep)) { New-Item -ItemType File -Path $keep -Force | Out-Null }
    }
    Write-Host "  + .claude/tmp/ .claude/program/ .claude/repo/"

    # Telemetry fallback dir: the emitter's isEnabled() checks for it when
    # settings.skailr.json carries no explicit telemetry.enabled. Left empty and
    # gitignored; no placeholder file — .skailr/ is ignored so an empty dir stays invisible.
    New-Item -ItemType Directory -Path "$Target\.skailr" -Force | Out-Null
    Write-Host "  + .skailr/"
}

$PackagedRules = @(
    "architect", "backend-engineer", "content-editor", "content-lead", "content-strategist",
    "content-writer", "data-engineer", "e2e-verifier", "frontend-engineer", "integration-verifier",
    "program-architect", "program-documenter", "program-validator", "researcher", "story-writer",
    "validator", "registry", "intake", "portfolio-architect", "initiative-lead",
    "legal-lead", "legal-analyst", "compliance-reviewer", "legal-validator",
    "pm-lead", "pm-planner", "risk-analyst", "status-reporter",
    "design-lead", "design-strategist", "designer", "design-reviewer",
    "mkt-lead", "mkt-strategist", "channel-planner", "mkt-analyst",
    "fin-lead", "fin-modeler", "fin-analyst", "fin-auditor",
    "expert", "expert-scout"
)
$PackagedCommands = @(
    "ship-feature", "build-feature", "continue-feature", "yolo", "patch",
    "discover", "plan-program", "build-program", "continue-program", "yolo-program", "map-repo",
    "discover-portfolio", "plan-portfolio", "status-portfolio", "mint-expert"
)

function Install-Cursor {
    New-Item -ItemType Directory -Path "$Target\.cursor\rules" -Force | Out-Null
    New-Item -ItemType Directory -Path "$Target\.cursor\commands" -Force | Out-Null

    foreach ($name in $PackagedRules) {
        $src = Join-Path $ScriptDir ".cursor\rules\$name.mdc"
        if (Test-Path $src) {
            Copy-Item $src "$Target\.cursor\rules\$name.mdc" -Force
            Write-Host "  + .cursor/rules/$name.mdc"
        }
    }
    foreach ($name in $PackagedCommands) {
        $src = Join-Path $ScriptDir ".cursor\commands\$name.md"
        if (Test-Path $src) {
            Copy-Item $src "$Target\.cursor\commands\$name.md" -Force
            Write-Host "  + .cursor/commands/$name.md"
        }
    }
    $readme = Join-Path $ScriptDir ".cursor\README.md"
    if (Test-Path $readme) {
        Copy-Item $readme "$Target\.cursor\README.md" -Force
        Write-Host "  + .cursor/README.md"
    }

    $modelRouting = Join-Path $ScriptDir ".cursor\model-routing.md"
    if (Test-Path $modelRouting) {
        Copy-Item $modelRouting "$Target\.cursor\model-routing.md" -Force
        Write-Host "  + .cursor/model-routing.md"
    }

    $reg = "$Target\.claude\teams\registry.md"
    if (-not (Test-Path $reg)) {
        New-Item -ItemType Directory -Path "$Target\.claude\teams" -Force | Out-Null
        Copy-Item "$ScriptDir\.claude\teams\registry.md" $reg -Force
        Write-Host "  + .claude/teams/registry.md (needed by Cursor registry rule)"
    }
    $intakeTarget = "$Target\.claude\intake.md"
    if (-not (Test-Path $intakeTarget)) {
        $intakeSrc = Join-Path $ScriptDir ".claude\intake.md"
        if (Test-Path $intakeSrc) {
            Copy-Item $intakeSrc $intakeTarget -Force
            Write-Host "  + .claude/intake.md (needed by Cursor intake rule)"
        }
    }
    New-Item -ItemType Directory -Path "$Target\.claude\tmp" -Force | Out-Null
    New-Item -ItemType Directory -Path "$Target\.claude\program" -Force | Out-Null
    New-Item -ItemType Directory -Path "$Target\.claude\repo" -Force | Out-Null
    foreach ($keep in @("$Target\.claude\tmp\.gitkeep", "$Target\.claude\program\.gitkeep", "$Target\.claude\repo\.gitkeep")) {
        if (-not (Test-Path $keep)) { New-Item -ItemType File -Path $keep -Force | Out-Null }
    }
}

# Ordered list of migration ids implemented by scripts/skailr/migrate.mjs. All logic lives
# in the runner; this array is only the ordered call list. It is asserted identical to the
# runner's exports and to install.sh's SKAILR_MIGRATIONS by scripts/skailr/doctor.mjs, so
# ids must stay lowercase-hyphen (/^[a-z][a-z0-9-]*$/) and the literal must contain no
# parentheses beyond its own delimiters — doctor's extractor drops anything else.
$SkailrMigrations = @(
    "telemetry-enabled-default",
    "autoupdate-enabled-default"
)

# Additive-only upgrade migrations. Runs AFTER the copy phase (so it sees final on-disk
# state) and BEFORE the gitignore/finish steps. Never fatal: the runner reports and exits 0
# for unparseable/unwritable files, and the try/catch covers even a usage error, because
# $ErrorActionPreference = "Stop" must not abort an install here.
function Invoke-Migrations {
    if ($Mode -eq "cursor") { return }   # .claude/ is not managed in cursor-only mode
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Write-Host "  ! migrations skipped (node not on PATH; install continues)"
        return
    }
    if ([string]::IsNullOrEmpty($MigratePreExisting)) {
        Write-Host "  = migrations skipped (fresh install; shipped defaults already current)"
        return
    }
    foreach ($id in $SkailrMigrations) {
        # Invoked from $ScriptDir (the pack), never from $Target: the target's copy of the
        # runner may be an older version that predates this migration.
        try {
            & node (Join-Path $ScriptDir "scripts\skailr\migrate.mjs") `
                --target $Target --only $id --pre-existing $MigratePreExisting
        } catch {
            Write-Host "  ! migrations skipped ($_)"
        }
    }
}

# Refresh $Target\.skailr\installed-version.json on EVERY claude-mode install/upgrade — it is
# the "installed" side of the update check and must track the pack, unlike autoUpdate.enabled
# (user-editable, copy-once-if-absent). Runs unconditionally, not gated on $MigratePreExisting:
# a fresh install needs the marker too. Never fatal — the runner always exits 0 and the
# try/catch covers even a usage error, because $ErrorActionPreference = "Stop" must not abort
# an install here.
function Invoke-RecordInstall {
    if ($Mode -eq "cursor") { return }   # .claude/ is not managed in cursor-only mode
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Write-Host "  ! installed-version marker skipped (node not on PATH; install continues)"
        return
    }
    # Invoked from $ScriptDir (the pack), never from $Target: the version stamped must be the
    # pack's own package.json version, and the target's copy may predate this script entirely.
    try {
        & node (Join-Path $ScriptDir "scripts\skailr\check-update.mjs") `
            --record-install --target $Target
    } catch {
        Write-Host "  ! installed-version marker skipped ($_)"
    }
}

function Append-Gitignore {
    $gi = Join-Path $Target ".gitignore"
    if (-not (Test-Path $gi)) { New-Item -ItemType File -Path $gi -Force | Out-Null }
    $lines = @(
        ".DS_Store",
        ".claude/tmp/*",
        "!.claude/tmp/.gitkeep",
        ".claude/program/*",
        "!.claude/program/.gitkeep",
        "!.claude/program/channels/",
        ".claude/program/channels/*",
        "!.claude/program/channels/PROTOCOL.md",
        "!.claude/program/channels/program.md",
        "!.claude/program/channels/feature.md",
        "!.claude/program/schemas/",
        ".skailr/",
        "node_modules/"
    )
    $existing = @(Get-Content $gi -ErrorAction SilentlyContinue)
    if ($existing -contains ".claude/program/") {
        $existing = $existing | Where-Object { $_ -ne ".claude/program/" }
        Set-Content -Path $gi -Value $existing
        Write-Host "  ~ .gitignore removed obsolete .claude/program/"
    }
    $existing = @(Get-Content $gi -ErrorAction SilentlyContinue)
    foreach ($line in $lines) {
        if ($existing -contains $line) {
            Write-Host "  = .gitignore already has $line"
        } else {
            Add-Content -Path $gi -Value $line
            Write-Host "  + .gitignore ← $line"
        }
    }
}

# Snapshot which migration targets existed BEFORE the copy phase. A file the copy phase
# creates in this same run already carries current shipped defaults, so migrating it would
# be a redundant double-write; only genuinely pre-existing consumer files are candidates.
$MigratePreExisting = if (Test-Path "$Target\.claude\settings.skailr.json") { ".claude/settings.skailr.json" } else { "" }

switch ($Mode) {
    "both" { Install-Claude; Install-Cursor; Install-Scripts }
    "claude" { Install-Claude; Install-Scripts }
    "cursor" { Install-Cursor }
}

Invoke-Migrations
Invoke-RecordInstall
Append-Gitignore
Write-Host "Done."
