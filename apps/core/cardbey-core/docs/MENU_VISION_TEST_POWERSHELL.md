# Menu Vision Engine - PowerShell Test Commands

## Prerequisites
- Backend running on `http://192.168.1.3:3001`
- `OPENAI_API_KEY` set in backend `.env`
- Optional: Set `DEBUG_VISION=true` in backend `.env` for verbose logging

## Test 1: Upload menu photo and extract (full flow)

### Step 1: Get your auth token
First, you need to authenticate and get a token. You can:
- Use the token from your browser's localStorage after logging into the dashboard
- Or authenticate via API first

### Step 2: Test orchestrator endpoint

Replace `YOUR_TOKEN`, `YOUR_TENANT_ID`, `YOUR_STORE_ID`, and `YOUR_IMAGE.jpg` with actual values:

```powershell
$headers = @{
    "Content-Type" = "application/json"
    "Authorization" = "Bearer YOUR_TOKEN"
}

$body = @{
    tenantId = "YOUR_TENANT_ID"
    storeId = "YOUR_STORE_ID"
    imageUrl = "http://192.168.1.3:3001/uploads/media/YOUR_IMAGE.jpg"
} | ConvertTo-Json

$response = Invoke-WebRequest -Uri "http://192.168.1.3:3001/api/orchestrator/menu-from-photo" `
    -Method POST `
    -Headers $headers `
    -Body $body

# Display response
$response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 10
```

**Expected**: 200 OK with menu items extracted
**Check backend logs for**: `[OpenAI Vision Engine] Detected private URL, converting to base64`

## Test 2: Verify private URL detection (localhost)

```powershell
$headers = @{
    "Content-Type" = "application/json"
    "Authorization" = "Bearer YOUR_TOKEN"
}

$body = @{
    tenantId = "YOUR_TENANT_ID"
    storeId = "YOUR_STORE_ID"
    imageUrl = "http://localhost:3001/uploads/media/test.jpg"
} | ConvertTo-Json

$response = Invoke-WebRequest -Uri "http://192.168.1.3:3001/api/orchestrator/menu-from-photo" `
    -Method POST `
    -Headers $headers `
    -Body $body

$response.Content
```

## Test 3: Using curl.exe (if available)

If you have `curl.exe` installed (comes with Windows 10+), you can use Unix-style syntax:

```powershell
curl.exe -X POST http://192.168.1.3:3001/api/orchestrator/menu-from-photo `
  -H "Content-Type: application/json" `
  -H "Authorization: Bearer YOUR_TOKEN" `
  -d '{\"tenantId\":\"YOUR_TENANT_ID\",\"storeId\":\"YOUR_STORE_ID\",\"imageUrl\":\"http://192.168.1.3:3001/uploads/media/YOUR_IMAGE.jpg\"}'
```

## Test 4: Quick test script

Save this as `test-menu-vision.ps1`:

```powershell
param(
    [string]$Token = "",
    [string]$TenantId = "",
    [string]$StoreId = "",
    [string]$ImageUrl = ""
)

if (-not $Token -or -not $TenantId -or -not $StoreId -or -not $ImageUrl) {
    Write-Host "Usage: .\test-menu-vision.ps1 -Token 'YOUR_TOKEN' -TenantId 'TENANT_ID' -StoreId 'STORE_ID' -ImageUrl 'http://192.168.1.3:3001/uploads/media/image.jpg'"
    exit 1
}

$headers = @{
    "Content-Type" = "application/json"
    "Authorization" = "Bearer $Token"
}

$body = @{
    tenantId = $TenantId
    storeId = $StoreId
    imageUrl = $ImageUrl
} | ConvertTo-Json

try {
    Write-Host "Testing menu-from-photo with image: $ImageUrl"
    $response = Invoke-WebRequest -Uri "http://192.168.1.3:3001/api/orchestrator/menu-from-photo" `
        -Method POST `
        -Headers $headers `
        -Body $body
    
    Write-Host "Status: $($response.StatusCode)" -ForegroundColor Green
    $json = $response.Content | ConvertFrom-Json
    Write-Host "Response:" -ForegroundColor Cyan
    $json | ConvertTo-Json -Depth 10
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response body: $responseBody" -ForegroundColor Yellow
    }
}
```

Run it:
```powershell
.\test-menu-vision.ps1 -Token "YOUR_TOKEN" -TenantId "YOUR_TENANT_ID" -StoreId "YOUR_STORE_ID" -ImageUrl "http://192.168.1.3:3001/uploads/media/YOUR_IMAGE.jpg"
```

## Alternative: Test via Dashboard UI

The easiest way to test is through the dashboard UI:

1. Go to Menu page: `http://localhost:5174/menu` (or your dashboard URL)
2. Click "Upload Menu Photo"
3. Select a menu image (JPG or PNG)
4. Click "Extract Items"
5. **Expected**: Menu items extracted successfully
6. **Check browser console**: No errors about "Failed to download image"
7. **Check backend logs**: Should see base64 conversion for private URLs

## Getting your token from browser

1. Open browser DevTools (F12)
2. Go to Application/Storage tab → Local Storage
3. Find key `token` or `bearerToken`
4. Copy the value

## Getting tenant/store IDs

1. Check browser console logs when loading menu page
2. Or check backend logs when making requests
3. Or query `/api/auth/me` endpoint to get user's business/store info

