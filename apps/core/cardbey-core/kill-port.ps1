# Kill processes using port 3001
Write-Host "Checking for processes using port 3001..." -ForegroundColor Yellow

# Method 1: Use netstat to find PIDs
$netstatOutput = netstat -ano | findstr ":3001"
if ($netstatOutput) {
    Write-Host "Found connections on port 3001:" -ForegroundColor Red
    $pids = @()
    foreach ($line in $netstatOutput) {
        if ($line -match '\s+(\d+)\s*$') {
            $pid = $matches[1]
            if ($pid -and $pid -ne '0') {
                $pids += $pid
            }
        }
    }
    $uniquePids = $pids | Select-Object -Unique
    foreach ($pid in $uniquePids) {
        $process = Get-Process -Id $pid -ErrorAction SilentlyContinue
        if ($process) {
            Write-Host "  PID: $pid - $($process.ProcessName)" -ForegroundColor Red
            Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
            Write-Host "  ✓ Killed process $pid" -ForegroundColor Green
        }
    }
}

# Method 2: Use Get-NetTCPConnection
$connections = Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue
if ($connections) {
    Write-Host "`nFound additional connections via Get-NetTCPConnection:" -ForegroundColor Red
    foreach ($conn in $connections) {
        $process = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
        if ($process) {
            Write-Host "  PID: $($process.Id) - $($process.ProcessName)" -ForegroundColor Red
            Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
            Write-Host "  ✓ Killed process $($process.Id)" -ForegroundColor Green
        }
    }
}

# Also kill any node/tsx/nodemon processes
Write-Host "`nChecking for Node.js processes..." -ForegroundColor Yellow
$nodeProcesses = Get-Process | Where-Object {$_.ProcessName -match "node|tsx|nodemon"} -ErrorAction SilentlyContinue

if ($nodeProcesses) {
    Write-Host "Found Node.js processes:" -ForegroundColor Red
    foreach ($proc in $nodeProcesses) {
        Write-Host "  PID: $($proc.Id) - $($proc.ProcessName)" -ForegroundColor Red
        Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
        Write-Host "  ✓ Killed process $($proc.Id)" -ForegroundColor Green
    }
} else {
    Write-Host "No Node.js processes found" -ForegroundColor Green
}

# Wait a moment for ports to be released
Write-Host "`nWaiting 2 seconds for ports to be released..." -ForegroundColor Yellow
Start-Sleep -Seconds 2

# Verify port is free
$finalCheck = netstat -ano | findstr ":3001"
if ($finalCheck) {
    Write-Host "⚠️  Warning: Port 3001 may still be in use:" -ForegroundColor Yellow
    Write-Host $finalCheck
} else {
    Write-Host "✓ Port 3001 is now free!" -ForegroundColor Green
}

Write-Host "`n✓ You can now restart your server." -ForegroundColor Green
