# Test script for SSE endpoint
# Tests CORS preflight and SSE connection

$baseUrl = "http://192.168.1.7:3001"
$origin = "http://localhost:5174"

Write-Host "Testing SSE endpoint: $baseUrl/api/stream" -ForegroundColor Cyan
Write-Host ""

# Test 1: OPTIONS preflight
Write-Host "1️⃣  Testing OPTIONS preflight..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/api/stream" -Method OPTIONS `
        -Headers @{
            "Origin" = $origin
            "Access-Control-Request-Method" = "GET"
            "Access-Control-Request-Headers" = "Content-Type"
        } -UseBasicParsing
    
    Write-Host "✅ OPTIONS preflight successful" -ForegroundColor Green
    Write-Host "   Status: $($response.StatusCode)"
    Write-Host "   Access-Control-Allow-Origin: $($response.Headers['Access-Control-Allow-Origin'])"
    Write-Host "   Access-Control-Allow-Methods: $($response.Headers['Access-Control-Allow-Methods'])"
} catch {
    Write-Host "❌ OPTIONS preflight failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Test 2: GET request (should stay open and receive data)
Write-Host "2️⃣  Testing GET request (will timeout after 5 seconds)..." -ForegroundColor Yellow
Write-Host "   This should show headers and initial data, then timeout" -ForegroundColor Gray
try {
    $job = Start-Job -ScriptBlock {
        param($url, $origin)
        $request = [System.Net.HttpWebRequest]::Create($url)
        $request.Method = "GET"
        $request.Headers.Add("Origin", $origin)
        $request.Timeout = 5000
        try {
            $response = $request.GetResponse()
            $stream = $response.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($stream)
            
            # Read first few lines
            $lines = @()
            for ($i = 0; $i -lt 5; $i++) {
                $line = $reader.ReadLine()
                if ($line -eq $null) { break }
                $lines += $line
            }
            
            return @{
                StatusCode = [int]$response.StatusCode
                Headers = $response.Headers
                ContentType = $response.ContentType
                FirstLines = $lines
            }
        } catch {
            return @{
                Error = $_.Exception.Message
            }
        }
    } -ArgumentList "$baseUrl/api/stream", $origin
    
    $result = Wait-Job $job | Receive-Job
    Remove-Job $job
    
    if ($result.Error) {
        Write-Host "❌ GET request failed: $($result.Error)" -ForegroundColor Red
    } else {
        Write-Host "✅ GET request successful" -ForegroundColor Green
        Write-Host "   Status: $($result.StatusCode)"
        Write-Host "   Content-Type: $($result.ContentType)"
        Write-Host "   Access-Control-Allow-Origin: $($result.Headers['Access-Control-Allow-Origin'])"
        Write-Host "   First lines received:"
        $result.FirstLines | ForEach-Object { Write-Host "     $_" -ForegroundColor Gray }
    }
} catch {
    Write-Host "❌ GET request failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "✅ Test complete!" -ForegroundColor Cyan
Write-Host ""
Write-Host "For a full connection test, use curl:" -ForegroundColor Yellow
Write-Host "  curl -N -H 'Origin: $origin' $baseUrl/api/stream" -ForegroundColor Gray
Write-Host ""
Write-Host "This will keep the connection open and show all events/heartbeats." -ForegroundColor Gray

