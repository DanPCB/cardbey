# Testing SSE Endpoint in PowerShell

## Quick Start

Since PowerShell aliases `curl` to `Invoke-WebRequest` (which has different syntax), use one of these methods:

### Option 1: Use the PowerShell Test Script (Recommended)

```powershell
# Navigate to the cardbey-core directory first
cd C:\Users\desig\Desktop\cardbey-core

# Run the test script
.\scripts\test-sse-curl.ps1
```

### Option 2: Use PowerShell Native Commands

#### Test OPTIONS Preflight:
```powershell
$response = Invoke-WebRequest -Uri "http://192.168.1.7:3001/api/stream" -Method OPTIONS `
    -Headers @{
        "Origin" = "http://localhost:5174"
        "Access-Control-Request-Method" = "GET"
        "Access-Control-Request-Headers" = "Content-Type"
    } -UseBasicParsing

$response.StatusCode
$response.Headers['Access-Control-Allow-Origin']
$response.Headers['Access-Control-Allow-Methods']
```

#### Test GET Request (with timeout):
```powershell
$request = [System.Net.HttpWebRequest]::Create("http://192.168.1.7:3001/api/stream")
$request.Method = "GET"
$request.Headers.Add("Origin", "http://localhost:5174")
$request.Timeout = 5000

$response = $request.GetResponse()
$stream = $response.GetResponseStream()
$reader = New-Object System.IO.StreamReader($stream)

# Read first few lines
for ($i = 0; $i -lt 5; $i++) {
    $line = $reader.ReadLine()
    if ($line) { Write-Host $line }
}

$response.StatusCode
$response.ContentType
$response.Headers['Access-Control-Allow-Origin']
```

### Option 3: Use curl.exe (if installed)

If you have `curl.exe` installed (not the PowerShell alias), use it explicitly:

```powershell
# Test OPTIONS preflight
curl.exe -X OPTIONS http://192.168.1.7:3001/api/stream `
    -H "Origin: http://localhost:5174" `
    -H "Access-Control-Request-Method: GET" `
    -H "Access-Control-Request-Headers: Content-Type" `
    -v

# Test GET request (stays open, shows all events)
curl.exe -N http://192.168.1.7:3001/api/stream `
    -H "Origin: http://localhost:5174"
```

### Option 4: Use WSL/Bash (if available)

If you have WSL installed, you can use bash:

```bash
# In WSL or Git Bash
curl -X OPTIONS http://192.168.1.7:3001/api/stream \
  -H "Origin: http://localhost:5174" \
  -H "Access-Control-Request-Method: GET" \
  -v

curl -N http://192.168.1.7:3001/api/stream \
  -H "Origin: http://localhost:5174"
```

## Expected Results

### OPTIONS Preflight:
- **Status**: `204 No Content`
- **Headers**:
  - `Access-Control-Allow-Origin: http://localhost:5174`
  - `Access-Control-Allow-Methods: GET, OPTIONS`
  - `Access-Control-Allow-Headers: Content-Type, Cache-Control, Last-Event-ID, ...`
  - `Access-Control-Max-Age: 86400`

### GET Request:
- **Status**: `200 OK`
- **Headers**:
  - `Content-Type: text/event-stream; charset=utf-8`
  - `Cache-Control: no-cache, no-transform`
  - `Connection: keep-alive`
  - `Access-Control-Allow-Origin: http://localhost:5174`
- **Data**: Should receive:
  - `:connected` comment
  - `event: ready` with JSON data
  - `: ping <timestamp>` every 15 seconds (heartbeat)

## Browser Testing (Easiest)

The easiest way to test is in the browser:

1. **Start the server**: `npm start` in `cardbey-core`
2. **Open dashboard**: `http://localhost:5174`
3. **Open DevTools** → Network tab
4. **Filter by "WS" or "EventStream"** or look for `/api/stream`
5. **Verify**:
   - Connection shows as `(pending)` and stays open
   - No CORS errors in console
   - Response headers include proper CORS headers
   - Events are received in real-time

## Troubleshooting

### "curl: command not found" or PowerShell alias issues
- Use `curl.exe` explicitly if curl is installed
- Or use the PowerShell test script: `.\scripts\test-sse-curl.ps1`
- Or use PowerShell native `Invoke-WebRequest`

### Connection timeout
- This is normal for SSE - connections stay open indefinitely
- Use browser DevTools to monitor the connection instead
- Or use `curl.exe -N` to keep the connection open

### CORS errors
- Check server logs for `[SSE]` messages
- Verify the origin in request headers matches allowed origins
- Ensure server is running and accessible

