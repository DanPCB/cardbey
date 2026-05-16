# PowerShell-native test script for SSE endpoint
# Tests CORS preflight and SSE connection using Invoke-WebRequest

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
    Write-Host "   Access-Control-Allow-Headers: $($response.Headers['Access-Control-Allow-Headers'])"
    Write-Host "   Access-Control-Max-Age: $($response.Headers['Access-Control-Max-Age'])"
} catch {
    Write-Host "❌ OPTIONS preflight failed: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        Write-Host "   Status: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Yellow
    }
}

Write-Host ""

# Test 2: GET request (will timeout after 3 seconds to show initial response)
Write-Host "2️⃣  Testing GET request (will timeout after 3 seconds)..." -ForegroundColor Yellow
Write-Host "   This should show headers and initial data" -ForegroundColor Gray
try {
    $job = Start-Job -ScriptBlock {
        param($url, $origin)
        try {
            $request = [System.Net.HttpWebRequest]::Create($url)
            $request.Method = "GET"
            $request.Headers.Add("Origin", $origin)
            $request.Timeout = 3000
            $request.ReadWriteTimeout = 3000
            
            $response = $request.GetResponse()
            $stream = $response.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($stream)
            
            # Read first few lines (with timeout)
            $lines = @()
            $startTime = Get-Date
            while ($lines.Count -lt 10) {
                if ($reader.EndOfStream) { break }
                if (((Get-Date) - $startTime).TotalSeconds -gt 2.5) { break }
                
                $line = $reader.ReadLine()
                if ($line -ne $null) {
                    $lines += $line
                }
                Start-Sleep -Milliseconds 100
            }
            
            return @{
                StatusCode = [int]$response.StatusCode
                Headers = @{
                    'Content-Type' = $response.ContentType
                    'Access-Control-Allow-Origin' = $response.Headers['Access-Control-Allow-Origin']
                    'Cache-Control' = $response.Headers['Cache-Control']
                    'Connection' = $response.Headers['Connection']
                }
                FirstLines = $lines
            }
        } catch {
            return @{
                Error = $_.Exception.Message
                ErrorType = $_.Exception.GetType().Name
            }
        }
    } -ArgumentList "$baseUrl/api/stream", $origin
    
    $result = Wait-Job $job -Timeout 5 | Receive-Job
    Remove-Job $job -Force
    
    if ($result.Error) {
        if ($result.ErrorType -eq 'WebException' -and $result.Error -like '*timeout*') {
            Write-Host "⚠️  GET request timed out (expected for long-lived connection)" -ForegroundColor Yellow
            Write-Host "   This is normal - SSE connections stay open indefinitely" -ForegroundColor Gray
        } else {
            Write-Host "❌ GET request failed: $($result.Error)" -ForegroundColor Red
        }
    } else {
        Write-Host "✅ GET request successful" -ForegroundColor Green
        Write-Host "   Status: $($result.StatusCode)"
        Write-Host "   Content-Type: $($result.Headers['Content-Type'])"
        Write-Host "   Access-Control-Allow-Origin: $($result.Headers['Access-Control-Allow-Origin'])"
        Write-Host "   Cache-Control: $($result.Headers['Cache-Control'])"
        Write-Host "   Connection: $($result.Headers['Connection'])"
        Write-Host "   First lines received:"
        $result.FirstLines | ForEach-Object { 
            if ($_ -ne '') {
                Write-Host "     $_" -ForegroundColor Gray 
            }
        }
    }
} catch {
    Write-Host "❌ GET request failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "✅ Test complete!" -ForegroundColor Cyan
Write-Host ""
Write-Host "For a full connection test with curl.exe (if installed):" -ForegroundColor Yellow
Write-Host "  curl.exe -N -H 'Origin: $origin' $baseUrl/api/stream" -ForegroundColor Gray
Write-Host ""
Write-Host "Or use the browser DevTools Network tab to monitor the connection." -ForegroundColor Gray

