# Quick Test Script for Store Context API
# Replace YOUR_TOKEN with the token from Local Storage

$token = "YOUR_TOKEN_HERE"
$baseUrl = "http://localhost:3001"

$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}

Write-Host "Testing /api/store/context..." -ForegroundColor Cyan
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/store/context" -Method Get -Headers $headers
    $response | ConvertTo-Json -Depth 10
} catch {
    Write-Host "Error: $_" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response: $responseBody" -ForegroundColor Yellow
    }
}

Write-Host "`nTo test with a specific store ID, uncomment and set storeId:" -ForegroundColor Gray
Write-Host "# `$storeId = 'YOUR_STORE_ID'" -ForegroundColor Gray
Write-Host "# `$response = Invoke-RestMethod -Uri `"$baseUrl/api/store/`$storeId/context`" -Method Get -Headers `$headers" -ForegroundColor Gray

