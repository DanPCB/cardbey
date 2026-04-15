# PowerShell script to test device status endpoint
# Usage: .\test-device-status.ps1 -DeviceId "your-device-id-here"

param(
    [Parameter(Mandatory=$true)]
    [string]$DeviceId
)

$uri = "http://localhost:3001/api/device/$DeviceId/status"

Write-Host "Testing device status endpoint..." -ForegroundColor Cyan
Write-Host "URL: $uri" -ForegroundColor Gray
Write-Host ""

try {
    $response = Invoke-WebRequest -Uri $uri -Method GET -UseBasicParsing
    $json = $response.Content | ConvertFrom-Json
    
    Write-Host "Response:" -ForegroundColor Green
    $json | ConvertTo-Json -Depth 10 | Write-Host
    
    if ($json.ok) {
        Write-Host "`nDevice Status Summary:" -ForegroundColor Yellow
        Write-Host "  Device ID: $($json.data.device.id)"
        Write-Host "  Name: $($json.data.device.name)"
        Write-Host "  Status: $($json.data.device.status)"
        Write-Host "  Platform: $($json.data.device.platform)"
        Write-Host "  App Version: $($json.data.device.appVersion)"
        Write-Host ""
        Write-Host "Heartbeat Info:" -ForegroundColor Yellow
        Write-Host "  Last Seen: $($json.data.heartbeat.lastSeenAt)"
        Write-Host "  Minutes Ago: $($json.data.heartbeat.minutesAgo)"
        Write-Host "  Is Online: $($json.data.heartbeat.isOnline)"
        Write-Host ""
        Write-Host "Diagnostic:" -ForegroundColor Yellow
        Write-Host "  Issue: $($json.data.diagnostic.issue)"
        Write-Host "  Recommendation: $($json.data.diagnostic.recommendation)"
    }
} catch {
    Write-Host "Error: $_" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response Body: $responseBody" -ForegroundColor Red
    }
}


