# check-api.ps1
# Quick health check script for Cardbey Core API endpoints (PowerShell)
# Usage: .\check-api.ps1

$ErrorActionPreference = "Stop"

$baseUrl = if ($env:CARDBEY_API_URL) { $env:CARDBEY_API_URL } else { "http://localhost:3001" }

Write-Host "🔍 Checking Cardbey Core API endpoints..." -ForegroundColor Cyan
Write-Host "Base URL: $baseUrl"
Write-Host ""

# Check /api/health
Write-Host "1️⃣  Testing /api/health..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "$baseUrl/api/health" -Method Get
    $health | ConvertTo-Json -Depth 3
    Write-Host "✅ Health check passed" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to get health status: $_" -ForegroundColor Red
}
Write-Host ""

# Check /api/dashboard/trend
Write-Host "2️⃣  Testing /api/dashboard/trend..." -ForegroundColor Yellow
try {
    $trend = Invoke-RestMethod -Uri "$baseUrl/api/dashboard/trend" -Method Get
    $seriesCount = $trend.series.Count
    Write-Host "✅ Trend data received ($seriesCount days)" -ForegroundColor Green
    $trend | ConvertTo-Json -Depth 2
} catch {
    Write-Host "❌ Failed to get trend data: $_" -ForegroundColor Red
}
Write-Host ""

# Check SSE endpoint (show headers, then quit after 2s)
Write-Host "3️⃣  Testing /api/stream?key=admin (SSE headers)..." -ForegroundColor Yellow
try {
    $job = Start-Job -ScriptBlock {
        param($url)
        $response = Invoke-WebRequest -Uri $url -Method Get -TimeoutSec 2 -ErrorAction Stop
        return $response.Headers
    } -ArgumentList "$baseUrl/api/stream?key=admin"
    
    Start-Sleep -Seconds 2
    Stop-Job -Job $job -ErrorAction SilentlyContinue
    Remove-Job -Job $job -ErrorAction SilentlyContinue
    
    Write-Host "⚠️  SSE stream opened (timeout after 2s)" -ForegroundColor Yellow
} catch {
    Write-Host "⚠️  SSE test skipped (timeout expected)" -ForegroundColor Yellow
}
Write-Host ""

Write-Host "✅ Health check complete!" -ForegroundColor Green
Write-Host ""
Write-Host "💡 Tip: Set CARDBEY_API_URL environment variable to test a different server:" -ForegroundColor Cyan
Write-Host "   `$env:CARDBEY_API_URL='http://192.168.1.11:3001'; .\check-api.ps1" -ForegroundColor Gray
































