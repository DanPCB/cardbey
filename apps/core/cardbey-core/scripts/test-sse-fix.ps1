# Test SSE endpoint after CORS fix
# This script tests the /api/stream endpoint to verify it returns 200 OK with text/event-stream

Write-Host "Testing SSE endpoint: http://192.168.1.7:3001/api/stream?key=admin" -ForegroundColor Cyan
Write-Host ""

# Test OPTIONS preflight
Write-Host "1. Testing OPTIONS preflight..." -ForegroundColor Yellow
try {
    $optionsResponse = Invoke-WebRequest -Uri "http://192.168.1.7:3001/api/stream?key=admin" `
        -Method OPTIONS `
        -Headers @{
            "Origin" = "http://localhost:5174"
            "Access-Control-Request-Method" = "GET"
        } `
        -UseBasicParsing
    
    Write-Host "   Status: $($optionsResponse.StatusCode)" -ForegroundColor Green
    Write-Host "   Headers:" -ForegroundColor Gray
    $optionsResponse.Headers | Format-Table -AutoSize
} catch {
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Test GET request (SSE stream)
Write-Host "2. Testing GET request (SSE stream)..." -ForegroundColor Yellow
Write-Host "   (This will stream data - press Ctrl+C to stop)" -ForegroundColor Gray
Write-Host ""

try {
    # Use curl.exe explicitly (not PowerShell alias)
    $env:CURL_CMD = "curl.exe"
    if (Get-Command curl.exe -ErrorAction SilentlyContinue) {
        Write-Host "   Using curl.exe..." -ForegroundColor Gray
        & curl.exe -N "http://192.168.1.7:3001/api/stream?key=admin" `
            -H "Origin: http://localhost:5174" `
            -v
    } else {
        # Fallback: Use Invoke-WebRequest (but it won't stream properly)
        Write-Host "   curl.exe not found, using Invoke-WebRequest (limited streaming)..." -ForegroundColor Yellow
        $response = Invoke-WebRequest -Uri "http://192.168.1.7:3001/api/stream?key=admin" `
            -Headers @{
                "Origin" = "http://localhost:5174"
            } `
            -UseBasicParsing
        
        Write-Host "   Status: $($response.StatusCode)" -ForegroundColor Green
        Write-Host "   Content-Type: $($response.Headers['Content-Type'])" -ForegroundColor Green
        Write-Host "   First 500 chars of response:" -ForegroundColor Gray
        Write-Host $response.Content.Substring(0, [Math]::Min(500, $response.Content.Length))
    }
} catch {
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        Write-Host "   Status Code: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "Expected results:" -ForegroundColor Cyan
Write-Host "  - OPTIONS: Status 204" -ForegroundColor White
Write-Host "  - GET: Status 200 OK" -ForegroundColor White
Write-Host "  - GET: Content-Type: text/event-stream; charset=utf-8" -ForegroundColor White
Write-Host "  - GET: Should see ':ok' and heartbeat messages" -ForegroundColor White

