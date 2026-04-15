# Testing Store Context API Endpoints

## PowerShell Commands

### 1. Get Store Context for Current User

```powershell
# Replace YOUR_TOKEN with actual bearer token
$token = "YOUR_TOKEN"
$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}
Invoke-RestMethod -Uri "http://localhost:3001/api/store/context" -Method Get -Headers $headers
```

### 2. Get Store Context for Specific Store ID

```powershell
# Replace YOUR_TOKEN and STORE_ID with actual values
$token = "YOUR_TOKEN"
$storeId = "STORE_ID"
$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}
Invoke-RestMethod -Uri "http://localhost:3001/api/store/$storeId/context" -Method Get -Headers $headers
```

### 3. Get Store Context with Business ID Query Param

```powershell
$token = "YOUR_TOKEN"
$businessId = "BUSINESS_ID"
$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}
Invoke-RestMethod -Uri "http://localhost:3001/api/store/context?businessId=$businessId" -Method Get -Headers $headers
```

## Using curl (if available)

If you have curl installed (not PowerShell's alias):

```bash
# Get store context for current user
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:3001/api/store/context

# Get store context for specific store
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:3001/api/store/STORE_ID/context

# Get store context with business ID
curl -H "Authorization: Bearer YOUR_TOKEN" "http://localhost:3001/api/store/context?businessId=BUSINESS_ID"
```

## Expected Response

```json
{
  "ok": true,
  "storeId": "cmj4avaku0000jvbohg39rsvw",
  "businessId": "cmj4avaku0000jvbohg39rsvw",
  "creationOrigin": "dashboard",
  "lifecycleStage": "configuring",
  "requiredNextStep": "continue_setup",
  "isOwner": true,
  "store": {
    "id": "cmj4avaku0000jvbohg39rsvw",
    "name": "My Store",
    "slug": "my-store",
    "isActive": false
  }
}
```

## Error Responses

### 401 Unauthorized
```json
{
  "error": "Authentication required"
}
```

### 404 Not Found
```json
{
  "ok": false,
  "error": "No store found"
}
```

### 403 Forbidden
```json
{
  "ok": false,
  "error": "Access denied"
}
```

## Getting Your Token

1. Open browser DevTools (F12)
2. Go to Application/Storage > Local Storage
3. Look for key: `cardbey_dev_bearer` or `cardbey_dev_admin_token`
4. Copy the token value

Or check Network tab when making authenticated requests to see the Authorization header.

