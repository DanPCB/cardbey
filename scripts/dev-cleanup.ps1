# Cardbey local dev cleanup (Windows PowerShell)
# Stops stale Cardbey Core/Dashboard node processes without killing unrelated node apps.
#
# Usage:
#   pnpm dev:cleanup           # interactive confirm
#   pnpm dev:cleanup -Force    # no confirm
#   pnpm dev:cleanup -WhatIf   # list only

param(
    [switch]$Force,
    [switch]$WhatIf
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$coreDir = Join-Path $repoRoot 'apps\core\cardbey-core'
$dashDir = Join-Path $repoRoot 'apps\dashboard\cardbey-marketing-dashboard'

function Test-CardbeyDevProcess {
    param([string]$CommandLine)
    if (-not $CommandLine) { return $false }
    $c = $CommandLine.ToLowerInvariant()
    if ($c -notmatch 'cardbey') { return $false }

    $patterns = @(
        'cardbey-core',
        'cardbey-marketing-dashboard',
        'dev-api-entry.mjs',
        'with-role.mjs',
        'test-auth-local.mjs',
        'nodemon',
        'vite\.js',
        'vite/bin'
    )
    foreach ($p in $patterns) {
        if ($c -match $p.Replace('\', '\\')) { return $true }
    }
    return $false
}

Write-Host "Cardbey dev cleanup"
Write-Host "Repo: $repoRoot"
Write-Host ""

$targets = @()
Get-CimInstance Win32_Process -Filter "name='node.exe'" -ErrorAction SilentlyContinue | ForEach-Object {
    if (Test-CardbeyDevProcess $_.CommandLine) {
        $targets += [PSCustomObject]@{
            PID = $_.ProcessId
            CommandLine = $_.CommandLine
        }
    }
}

if ($targets.Count -eq 0) {
    Write-Host "No Cardbey dev node processes found."
    exit 0
}

Write-Host "Found $($targets.Count) Cardbey-related node process(es):"
foreach ($t in $targets) {
    $short = $t.CommandLine
    if ($short.Length -gt 140) { $short = $short.Substring(0, 140) + '...' }
    Write-Host "  PID $($t.PID): $short"
}

if ($WhatIf) {
    Write-Host ""
    Write-Host "WhatIf: no processes stopped."
    exit 0
}

if (-not $Force) {
    $answer = Read-Host "`nStop these processes? [y/N]"
    if ($answer -notmatch '^[yY]') {
        Write-Host "Cancelled."
        exit 0
    }
}

$stopped = 0
foreach ($t in $targets) {
    try {
        Stop-Process -Id $t.PID -Force -ErrorAction Stop
        Write-Host "Stopped PID $($t.PID)"
        $stopped++
    } catch {
        Write-Warning "Could not stop PID $($t.PID): $_"
    }
}

Write-Host ""
Write-Host "Stopped $stopped process(es)."
Write-Host "Next:"
Write-Host "  pnpm dev:prisma"
Write-Host "  pnpm dev:doctor --probe"
Write-Host "  pnpm dev:core    (terminal 1)"
Write-Host "  pnpm dev:dashboard (terminal 2)"
