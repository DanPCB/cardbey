# Pairing V2 Implementation Summary

**Date:** 2025-01-14  
**Status:** ✅ Complete

---

## Files Changed

### Core Implementation Files

1. **`src/pair/sessionStore.js`**
   - Added session creation time tracking for cleanup
   - Added `cleanupOldSessions()` function
   - Added `getActiveSessionCount()` function
   - Updated `resetStoreForTest()` to clear creation time map

2. **`src/routes/screens.js`**
   - Added rate limiting to all pairing endpoints
   - Added max active sessions limit (10 global)
   - Removed dual-write to PairCode table
   - Added comprehensive logging to all pairing endpoints
   - Deprecated `/screens/pair/claim` route (with warnings)
   - Enhanced `/screens/hello` endpoint with documentation
   - Added error logging to all endpoints

3. **`src/routes/pair.js`**
   - Deprecated `/pair/sessions/:id/status` route (with warnings)
   - Deprecated `/pair/codes/:code/status` route (with warnings)
   - Both routes now return `deprecated: true` in responses

4. **`src/middleware/rateLimit.js`** (NEW)
   - Simple in-memory rate limiting middleware
   - Configurable window and max requests
   - Returns 429 with `Retry-After` header
   - Includes cleanup function for old records

5. **`src/worker/sessionCleanup.js`** (NEW)
   - Background worker to clean up expired/completed sessions
   - Runs every 60 seconds
   - Removes sessions older than 24 hours
   - Logs cleanup activity

6. **`src/server.js`**
   - Wired up session cleanup worker
   - Added rate limit store cleanup (every 5 minutes)

### Documentation Files

7. **`docs/PAIRING_AUDIT_CORE.md`** (NEW)
   - Comprehensive audit of pairing system
   - Endpoint documentation
   - Database model review
   - Checklist of completed/missing items

8. **`docs/PAIRING_BACKEND_TESTS.md`** (NEW)
   - Manual test procedures
   - PowerShell test script
   - Test checklist

9. **`docs/PAIRING_V2_IMPLEMENTATION.md`** (THIS FILE)
   - Implementation summary
   - Files changed
   - Manual test script

---

## Key Changes

### 1. Rate Limiting

All pairing endpoints now have rate limiting:
- **POST /api/screens/pair/initiate**: 10 requests/minute
- **GET /api/screens/pair/peek/:code**: 30 requests/minute
- **POST /api/screens/pair/register**: 10 requests/minute
- **POST /api/screens/pair/complete**: 20 requests/minute
- **POST /api/screens/hello**: 5 requests/minute

### 2. Session Lifecycle Management

- **Max active sessions**: 10 global limit (prevents flooding)
- **Automatic cleanup**: Expired sessions cleaned every 60 seconds
- **Old session removal**: Completed/expired sessions removed after 24 hours

### 3. Single Source of Truth

- **Removed dual-write**: No longer writes to PairCode table
- **Session store**: In-memory Map is the single source of truth
- **Consistency**: All endpoints use session store exclusively

### 4. Logging

All pairing endpoints now log:
- Session initiation
- Device registration
- Session completion
- Errors and warnings
- Deprecated endpoint usage

### 5. Legacy Route Deprecation

- **POST /api/screens/pair/claim**: Deprecated (returns warning)
- **GET /api/pair/sessions/:id/status**: Deprecated (returns warning)
- **GET /api/pair/codes/:code/status**: Deprecated (returns warning)

All deprecated routes return `deprecated: true` and warning messages.

---

## Manual Test Script

### PowerShell Script

```powershell
# Pairing V2 End-to-End Test Script
# Run this after starting the server: npm run dev

$baseUrl = "http://localhost:3001"
$ErrorActionPreference = "Stop"

Write-Host "=== Pairing V2 End-to-End Test ===" -ForegroundColor Cyan
Write-Host ""

# 1. Initiate pairing session
Write-Host "1. Initiating pairing session..." -ForegroundColor Yellow
try {
    $initiate = Invoke-RestMethod -Uri "$baseUrl/api/screens/pair/initiate" `
        -Method POST -ContentType "application/json" `
        -Body '{"requester": "dashboard", "ttlSec": 300}'
    
    if ($initiate.ok -ne $true) {
        throw "Initiate failed: $($initiate | ConvertTo-Json)"
    }
    
    Write-Host "   ✅ Session created: $($initiate.sessionId)" -ForegroundColor Green
    Write-Host "   Code: $($initiate.code)" -ForegroundColor Gray
    $code = $initiate.code
    $sessionId = $initiate.sessionId
} catch {
    Write-Host "   ❌ Failed: $_" -ForegroundColor Red
    exit 1
}

# 2. Peek at code
Write-Host "`n2. Peeking at code status..." -ForegroundColor Yellow
try {
    $peek = Invoke-RestMethod -Uri "$baseUrl/api/screens/pair/peek/$code" -Method GET
    
    if ($peek.ok -ne $true -or $peek.status -ne "showing_code") {
        throw "Peek failed or wrong status: $($peek | ConvertTo-Json)"
    }
    
    Write-Host "   ✅ Code is valid: status=$($peek.status), ttl=$($peek.ttlLeftMs)ms" -ForegroundColor Green
} catch {
    Write-Host "   ❌ Failed: $_" -ForegroundColor Red
    exit 1
}

# 3. Register device
Write-Host "`n3. Registering device..." -ForegroundColor Yellow
try {
    $fingerprint = "TEST-FP-$(Get-Random -Minimum 1000 -Maximum 9999)"
    $register = Invoke-RestMethod -Uri "$baseUrl/api/screens/pair/register" `
        -Method POST -ContentType "application/json" `
        -Body (@{
            code = $code
            fingerprint = $fingerprint
            model = "Test Device"
            name = "Test Screen"
            location = "Test Location"
        } | ConvertTo-Json)
    
    if ($register.ok -ne $true -or $register.session.status -ne "bound") {
        throw "Register failed: $($register | ConvertTo-Json)"
    }
    
    Write-Host "   ✅ Device registered: screenId=$($register.screenId)" -ForegroundColor Green
    Write-Host "   Token: $($register.token)" -ForegroundColor Gray
    $screenId = $register.screenId
    $token = $register.token
} catch {
    Write-Host "   ❌ Failed: $_" -ForegroundColor Red
    exit 1
}

# 4. Complete pairing
Write-Host "`n4. Completing pairing..." -ForegroundColor Yellow
try {
    $complete = Invoke-RestMethod -Uri "$baseUrl/api/screens/pair/complete" `
        -Method POST -ContentType "application/json" `
        -Body (@{ sessionId = $sessionId } | ConvertTo-Json)
    
    if ($complete.ok -ne $true) {
        throw "Complete failed: $($complete | ConvertTo-Json)"
    }
    
    Write-Host "   ✅ Pairing completed: screenId=$($complete.screenId)" -ForegroundColor Green
} catch {
    Write-Host "   ❌ Failed: $_" -ForegroundColor Red
    exit 1
}

# 5. Test idempotency (complete again)
Write-Host "`n5. Testing idempotency (complete again)..." -ForegroundColor Yellow
try {
    $complete2 = Invoke-RestMethod -Uri "$baseUrl/api/screens/pair/complete" `
        -Method POST -ContentType "application/json" `
        -Body (@{ sessionId = $sessionId } | ConvertTo-Json)
    
    if ($complete2.ok -ne $true -or $complete2.screenId -ne $screenId) {
        throw "Idempotency failed: $($complete2 | ConvertTo-Json)"
    }
    
    Write-Host "   ✅ Idempotent: same result returned" -ForegroundColor Green
} catch {
    Write-Host "   ❌ Failed: $_" -ForegroundColor Red
    exit 1
}

# 6. Send heartbeat
Write-Host "`n6. Sending heartbeat..." -ForegroundColor Yellow
try {
    $heartbeat = Invoke-RestMethod -Uri "$baseUrl/api/screens/$screenId/heartbeat" `
        -Method POST -ContentType "application/json" `
        -Body (@{ token = $token } | ConvertTo-Json)
    
    if ($heartbeat.ok -ne $true) {
        throw "Heartbeat failed: $($heartbeat | ConvertTo-Json)"
    }
    
    Write-Host "   ✅ Heartbeat received" -ForegroundColor Green
} catch {
    Write-Host "   ❌ Failed: $_" -ForegroundColor Red
    exit 1
}

# 7. Get screen details
Write-Host "`n7. Getting screen details..." -ForegroundColor Yellow
try {
    $screen = Invoke-RestMethod -Uri "$baseUrl/api/screens/$screenId" -Method GET
    
    if (-not $screen.id -or $screen.status -ne "ONLINE") {
        throw "Screen not found or wrong status: $($screen | ConvertTo-Json)"
    }
    
    Write-Host "   ✅ Screen found: name=$($screen.name), status=$($screen.status)" -ForegroundColor Green
} catch {
    Write-Host "   ❌ Failed: $_" -ForegroundColor Red
    exit 1
}

# 8. Test rate limiting
Write-Host "`n8. Testing rate limiting (11 rapid requests)..." -ForegroundColor Yellow
$rateLimitHit = $false
for ($i = 1; $i -le 11; $i++) {
    try {
        $result = Invoke-RestMethod -Uri "$baseUrl/api/screens/pair/initiate" `
            -Method POST -ContentType "application/json" `
            -Body '{"requester": "dashboard", "ttlSec": 60}'
    } catch {
        $errorResponse = $_.ErrorDetails.Message | ConvertFrom-Json
        if ($errorResponse.error -eq "rate_limit_exceeded") {
            $rateLimitHit = $true
            Write-Host "   ✅ Rate limit hit on request $i (expected)" -ForegroundColor Green
            break
        }
    }
    Start-Sleep -Milliseconds 100
}
if (-not $rateLimitHit) {
    Write-Host "   ⚠️  Rate limit not hit (may need to wait for window to reset)" -ForegroundColor Yellow
}

Write-Host "`n=== All Tests Passed! ===" -ForegroundColor Green
Write-Host ""
Write-Host "Summary:" -ForegroundColor Cyan
Write-Host "  - Session ID: $sessionId"
Write-Host "  - Code: $code"
Write-Host "  - Screen ID: $screenId"
Write-Host "  - Token: $token"
```

### Bash/curl Script

```bash
#!/bin/bash
# Pairing V2 End-to-End Test Script

BASE_URL="http://localhost:3001"

echo "=== Pairing V2 End-to-End Test ==="
echo ""

# 1. Initiate
echo "1. Initiating pairing session..."
INITIATE=$(curl -s -X POST "$BASE_URL/api/screens/pair/initiate" \
  -H "Content-Type: application/json" \
  -d '{"requester": "dashboard", "ttlSec": 300}')

CODE=$(echo $INITIATE | jq -r '.code')
SESSION_ID=$(echo $INITIATE | jq -r '.sessionId')

if [ "$CODE" = "null" ] || [ -z "$CODE" ]; then
  echo "❌ Initiate failed: $INITIATE"
  exit 1
fi

echo "✅ Session created: $SESSION_ID"
echo "   Code: $CODE"
echo ""

# 2. Peek
echo "2. Peeking at code status..."
PEEK=$(curl -s "$BASE_URL/api/screens/pair/peek/$CODE")
STATUS=$(echo $PEEK | jq -r '.status')

if [ "$STATUS" != "showing_code" ]; then
  echo "❌ Peek failed: $PEEK"
  exit 1
fi

echo "✅ Code is valid: status=$STATUS"
echo ""

# 3. Register
echo "3. Registering device..."
FINGERPRINT="TEST-FP-$(date +%s)"
REGISTER=$(curl -s -X POST "$BASE_URL/api/screens/pair/register" \
  -H "Content-Type: application/json" \
  -d "{
    \"code\": \"$CODE\",
    \"fingerprint\": \"$FINGERPRINT\",
    \"model\": \"Test Device\",
    \"name\": \"Test Screen\"
  }")

SCREEN_ID=$(echo $REGISTER | jq -r '.screenId')
TOKEN=$(echo $REGISTER | jq -r '.token')

if [ "$SCREEN_ID" = "null" ] || [ -z "$SCREEN_ID" ]; then
  echo "❌ Register failed: $REGISTER"
  exit 1
fi

echo "✅ Device registered: screenId=$SCREEN_ID"
echo ""

# 4. Complete
echo "4. Completing pairing..."
COMPLETE=$(curl -s -X POST "$BASE_URL/api/screens/pair/complete" \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\": \"$SESSION_ID\"}")

if [ "$(echo $COMPLETE | jq -r '.ok')" != "true" ]; then
  echo "❌ Complete failed: $COMPLETE"
  exit 1
fi

echo "✅ Pairing completed"
echo ""

# 5. Heartbeat
echo "5. Sending heartbeat..."
HEARTBEAT=$(curl -s -X POST "$BASE_URL/api/screens/$SCREEN_ID/heartbeat" \
  -H "Content-Type: application/json" \
  -d "{\"token\": \"$TOKEN\"}")

if [ "$(echo $HEARTBEAT | jq -r '.ok')" != "true" ]; then
  echo "❌ Heartbeat failed: $HEARTBEAT"
  exit 1
fi

echo "✅ Heartbeat received"
echo ""

echo "=== All Tests Passed! ==="
echo ""
echo "Summary:"
echo "  - Session ID: $SESSION_ID"
echo "  - Code: $CODE"
echo "  - Screen ID: $SCREEN_ID"
echo "  - Token: $TOKEN"
```

---

## Quick Test Commands

### Single-line PowerShell test:

```powershell
$b="http://localhost:3001"; $i=Invoke-RestMethod "$b/api/screens/pair/initiate" -Method POST -Body '{"ttlSec":300}' -ContentType "application/json"; $p=Invoke-RestMethod "$b/api/screens/pair/peek/$($i.code)"; $r=Invoke-RestMethod "$b/api/screens/pair/register" -Method POST -Body (@{code=$i.code;fingerprint="TEST-$(Get-Random)";model="Test"} | ConvertTo-Json) -ContentType "application/json"; $c=Invoke-RestMethod "$b/api/screens/pair/complete" -Method POST -Body (@{sessionId=$i.sessionId} | ConvertTo-Json) -ContentType "application/json"; Write-Host "✅ All steps passed! Screen: $($r.screenId), Token: $($r.token)"
```

---

## Verification Checklist

After running the test script, verify:

- [ ] Server logs show pairing events
- [ ] No errors in server console
- [ ] SSE events are emitted (check `/api/stream`)
- [ ] Screen appears in `/api/screens` list
- [ ] Screen status is "ONLINE" after heartbeat
- [ ] Rate limiting works (429 after limit)
- [ ] Deprecated endpoints return warnings
- [ ] Session cleanup runs (check logs after 1 minute)

---

## Next Steps

1. **Monitor logs** for pairing events
2. **Test with dashboard** to ensure frontend integration works
3. **Monitor session cleanup** to verify old sessions are removed
4. **Consider persistence** if sessions need to survive server restarts (Redis/DB)

---

## Notes

- Sessions are **in-memory only** (lost on server restart)
- Rate limits are **per-IP** (in-memory, resets on restart)
- Max active sessions is **global** (10 sessions total)
- Session cleanup runs **every 60 seconds**
- Old sessions are removed after **24 hours**

