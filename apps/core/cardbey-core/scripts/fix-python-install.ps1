# Fix Python Installation Issues on Windows
# Run this script as Administrator

Write-Host "=== Python Installation Troubleshooter ===" -ForegroundColor Cyan
Write-Host ""

# Check if running as admin
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "⚠️  This script should be run as Administrator" -ForegroundColor Yellow
    Write-Host "Right-click PowerShell and select 'Run as Administrator'" -ForegroundColor Yellow
    Write-Host ""
}

# 1. Check Windows Installer service
Write-Host "1. Checking Windows Installer service..." -ForegroundColor Yellow
$msiService = Get-Service -Name "msiserver" -ErrorAction SilentlyContinue
if ($msiService) {
    if ($msiService.Status -ne "Running") {
        Write-Host "   Starting Windows Installer service..." -ForegroundColor Yellow
        Start-Service -Name "msiserver" -ErrorAction SilentlyContinue
    }
    Write-Host "   ✅ Windows Installer: $($msiService.Status)" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  Windows Installer service not found" -ForegroundColor Yellow
}

# 2. Check execution policy
Write-Host ""
Write-Host "2. Checking PowerShell execution policy..." -ForegroundColor Yellow
$execPolicy = Get-ExecutionPolicy
Write-Host "   Current policy: $execPolicy" -ForegroundColor Gray
if ($execPolicy -eq "Restricted") {
    Write-Host "   ⚠️  Execution policy is Restricted" -ForegroundColor Yellow
    Write-Host "   Run: Set-ExecutionPolicy RemoteSigned -Scope CurrentUser" -ForegroundColor Cyan
}

# 3. Check for antivirus interference
Write-Host ""
Write-Host "3. Antivirus check..." -ForegroundColor Yellow
Write-Host "   ⚠️  Windows Defender or antivirus may block Python installer" -ForegroundColor Yellow
Write-Host "   Temporarily disable real-time protection during installation" -ForegroundColor Cyan

# 4. Check disk space
Write-Host ""
Write-Host "4. Checking disk space..." -ForegroundColor Yellow
$drive = (Get-Location).Drive.Name
$disk = Get-PSDrive -Name $drive
$freeGB = [math]::Round($disk.Free / 1GB, 2)
Write-Host "   Free space on $drive`: $freeGB GB" -ForegroundColor Gray
if ($freeGB -lt 5) {
    Write-Host "   ⚠️  Low disk space! Python needs at least 2-3 GB" -ForegroundColor Yellow
}

# 5. Check for existing Python installations
Write-Host ""
Write-Host "5. Checking for existing Python installations..." -ForegroundColor Yellow
$pythonPaths = @(
    "$env:LOCALAPPDATA\Programs\Python",
    "$env:ProgramFiles\Python*",
    "$env:ProgramFiles(x86)\Python*"
)

$foundPython = $false
foreach ($path in $pythonPaths) {
    if (Test-Path $path) {
        $foundPython = $true
        Write-Host "   Found: $path" -ForegroundColor Green
    }
}

if (-not $foundPython) {
    Write-Host "   No existing Python installation found" -ForegroundColor Gray
}

# 6. Recommendations
Write-Host ""
Write-Host "=== Recommendations ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Option 1: Use Windows Store Python (Recommended)" -ForegroundColor Green
Write-Host "  1. Open Microsoft Store" -ForegroundColor White
Write-Host "  2. Search for 'Python 3.12'" -ForegroundColor White
Write-Host "  3. Click Install" -ForegroundColor White
Write-Host "  4. No admin rights needed!" -ForegroundColor Green
Write-Host ""
Write-Host "Option 2: Use Portable Python" -ForegroundColor Green
Write-Host "  1. Download from: https://www.python.org/downloads/windows/" -ForegroundColor White
Write-Host "  2. Choose 'Windows embeddable package'" -ForegroundColor White
Write-Host "  3. Extract to a folder (no installation needed)" -ForegroundColor White
Write-Host ""
Write-Host "Option 3: Fix Current Installer" -ForegroundColor Green
Write-Host "  1. Disable Windows Defender temporarily" -ForegroundColor White
Write-Host "  2. Run installer as Administrator" -ForegroundColor White
Write-Host "  3. Check Windows Event Viewer for detailed errors" -ForegroundColor White
Write-Host ""
Write-Host "Option 4: Use Alternative Download Method" -ForegroundColor Green
Write-Host "  Run: .\scripts\download-sam3.ps1" -ForegroundColor White
Write-Host "  This script can download SAM-3 without Python" -ForegroundColor Gray

Write-Host ""
Write-Host "=== Troubleshooting Complete ===" -ForegroundColor Cyan


















