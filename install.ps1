# Install skailr-agents (.claude + .cursor trees) into a target project.
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

function Install-Claude {
    $dirs = @(
        "$Target\.claude\agents\content",
        "$Target\.claude\commands",
        "$Target\.claude\teams",
        "$Target\.claude\tmp",
        "$Target\.claude\program\channels"
    )
    foreach ($d in $dirs) {
        New-Item -ItemType Directory -Path $d -Force | Out-Null
    }

    Get-ChildItem "$ScriptDir\.claude\agents\*.md" | ForEach-Object {
        Copy-Item $_.FullName "$Target\.claude\agents\" -Force
        Write-Host "  + .claude/agents/$($_.Name)"
    }
    Get-ChildItem "$ScriptDir\.claude\agents\content\*.md" | ForEach-Object {
        Copy-Item $_.FullName "$Target\.claude\agents\content\" -Force
        Write-Host "  + .claude/agents/content/$($_.Name)"
    }
    Get-ChildItem "$ScriptDir\.claude\commands\*.md" | ForEach-Object {
        Copy-Item $_.FullName "$Target\.claude\commands\" -Force
        Write-Host "  + .claude/commands/$($_.Name)"
    }
    Copy-Item "$ScriptDir\.claude\teams\registry.md" "$Target\.claude\teams\registry.md" -Force
    Write-Host "  + .claude/teams/registry.md"

    foreach ($f in @("PROTOCOL.md", "program.md", "feature.md")) {
        Copy-Item "$ScriptDir\.claude\program\channels\$f" "$Target\.claude\program\channels\$f" -Force
        Write-Host "  + .claude/program/channels/$f"
    }

    foreach ($keep in @("$Target\.claude\tmp\.gitkeep", "$Target\.claude\program\.gitkeep")) {
        if (-not (Test-Path $keep)) { New-Item -ItemType File -Path $keep -Force | Out-Null }
    }
    Write-Host "  + .claude/tmp/ .claude/program/"
}

$PackagedRules = @(
    "architect", "backend-engineer", "content-editor", "content-lead", "content-strategist",
    "content-writer", "data-engineer", "e2e-verifier", "frontend-engineer", "integration-verifier",
    "program-architect", "program-documenter", "program-validator", "researcher", "story-writer",
    "validator", "registry"
)
$PackagedCommands = @("ship-feature", "build-feature", "discover", "plan-program", "build-program")

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

    $reg = "$Target\.claude\teams\registry.md"
    if (-not (Test-Path $reg)) {
        New-Item -ItemType Directory -Path "$Target\.claude\teams" -Force | Out-Null
        Copy-Item "$ScriptDir\.claude\teams\registry.md" $reg -Force
        Write-Host "  + .claude/teams/registry.md (needed by Cursor registry rule)"
    }
    New-Item -ItemType Directory -Path "$Target\.claude\tmp" -Force | Out-Null
    New-Item -ItemType Directory -Path "$Target\.claude\program" -Force | Out-Null
    foreach ($keep in @("$Target\.claude\tmp\.gitkeep", "$Target\.claude\program\.gitkeep")) {
        if (-not (Test-Path $keep)) { New-Item -ItemType File -Path $keep -Force | Out-Null }
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
        "!.claude/program/channels/feature.md"
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

switch ($Mode) {
    "both" { Install-Claude; Install-Cursor }
    "claude" { Install-Claude }
    "cursor" { Install-Cursor }
}

Append-Gitignore
Write-Host "Done."
