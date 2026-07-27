# Fix Prisma Lock on Windows
# This script stops Node processes and cleans up Prisma client files

Write-Host "=== Fixing Prisma Lock ===" -ForegroundColor Cyan

# Step 1: Find and stop Node processes
Write-Host "`n[1/4] Stopping Node processes..." -ForegroundColor Yellow
$nodeProcesses = Get-Process | Where-Object {$_.ProcessName -eq "node" -or $_.ProcessName -eq "tsx"}
if ($nodeProcesses) {
    Write-Host "Found $($nodeProcesses.Count) Node/tsx process(es)" -ForegroundColor Yellow
    $nodeProcesses | ForEach-Object {
        Write-Host "  Stopping PID $($_.Id): $($_.ProcessName)" -ForegroundColor Gray
        Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 3
    Write-Host "  ✓ Stopped" -ForegroundColor Green
} else {
    Write-Host "  ✓ No Node processes found" -ForegroundColor Green
}

# Step 2: Clean up locked DLL files
Write-Host "`n[2/4] Cleaning up locked DLL files..." -ForegroundColor Yellow
$prismaClientPath = "node_modules\.prisma\client"
if (Test-Path $prismaClientPath) {
    $dllFiles = Get-ChildItem -Path $prismaClientPath -Filter "query_engine-windows.dll.node*" -ErrorAction SilentlyContinue
    if ($dllFiles) {
        foreach ($file in $dllFiles) {
            Write-Host "  Removing: $($file.Name)" -ForegroundColor Gray
            Remove-Item -Path $file.FullName -Force -ErrorAction SilentlyContinue
        }
        Write-Host "  ✓ Cleaned up" -ForegroundColor Green
    } else {
        Write-Host "  ✓ No DLL files to clean" -ForegroundColor Green
    }
} else {
    Write-Host "  ✓ Prisma client directory doesn't exist yet" -ForegroundColor Green
}

# Step 3: Wait a moment for file handles to release
Write-Host "`n[3/4] Waiting for file handles to release..." -ForegroundColor Yellow
Start-Sleep -Seconds 2
Write-Host "  ✓ Ready" -ForegroundColor Green

# Step 4: Regenerate Prisma client
Write-Host "`n[4/4] Regenerating Prisma client..." -ForegroundColor Yellow
try {
    npx prisma generate
    Write-Host "`n✓ Prisma client regenerated successfully!" -ForegroundColor Green
} catch {
    Write-Host "`n✗ Error: $_" -ForegroundColor Red
    Write-Host "`nTry running this script as Administrator, or:" -ForegroundColor Yellow
    Write-Host "  1. Close all VS Code/Cursor windows" -ForegroundColor Yellow
    Write-Host "  2. Restart your computer" -ForegroundColor Yellow
    Write-Host "  3. Run: npx prisma generate" -ForegroundColor Yellow
    exit 1
}

Write-Host "`n=== Done ===" -ForegroundColor Cyan
