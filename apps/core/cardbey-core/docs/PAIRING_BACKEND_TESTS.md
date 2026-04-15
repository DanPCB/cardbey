# Pairing Backend Tests

This document describes manual test procedures for the pairing v2 endpoints.

## Prerequisites

1. Start the server: `npm run dev`
2. Ensure database is running and migrations are applied
3. Have `curl` or PowerShell available for testing

## Test Flow: Complete Pairing Sequence

### 1. Initiate Pairing Session

**Request:**
```bash
curl -X POST http://localhost:3001/api/screens/pair/initiate \
  -H "Content-Type: application/json" \
  -d '{"requester": "dashboard", "ttlSec": 300}'
```

**Expected Response (200):**
```json
{
  "ok": true,
  "sessionId": "pair_1234567890_abc123",
  "code": "ABC123",
  "expiresAt": 1234567890000,
  "ttlLeftMs": 300000,
  "status": "showing_code"
}
```

**Check:**
- ✅ Response has `ok: true`
- ✅ `code` is 6 characters, uppercase
- ✅ `ttlLeftMs` is approximately 300000 (5 minutes)
- ✅ `status` is "showing_code"
- ✅ Check server logs for: `[Pairing] Session initiated: ...`

---

### 2. Peek at Code Status

**Request:**
```bash
curl http://localhost:3001/api/screens/pair/peek/ABC123
```

**Expected Response (200):**
```json
{
  "ok": true,
  "exists": true,
  "status": "showing_code",
  "ttlLeftMs": 299500
}
```

**Check:**
- ✅ Response has `ok: true` and `exists: true`
- ✅ `status` is "showing_code"
- ✅ `ttlLeftMs` decreases over time

**Test with invalid code:**
```bash
curl http://localhost:3001/api/screens/pair/peek/INVALID
```

**Expected Response (200):**
```json
{
  "ok": false,
  "status": "not_found"
}
```

---

### 3. Register Device

**Request:**
```bash
curl -X POST http://localhost:3001/api/screens/pair/register \
  -H "Content-Type: application/json" \
  -d '{
    "code": "ABC123",
    "fingerprint": "DEVICE-FP-001",
    "model": "Test Device",
    "name": "Test Screen",
    "location": "Test Location"
  }'
```

**Expected Response (200):**
```json
{
  "ok": true,
  "screenId": "cmhy7nr8f0001jvi0tmptm4ip",
  "token": "cmhy7nr8f0001jvi0tmptm4ip-abc123",
  "session": {
    "sessionId": "pair_1234567890_abc123",
    "status": "bound"
  }
}
```

**Check:**
- ✅ Response has `ok: true`
- ✅ `screenId` is a valid CUID
- ✅ `token` starts with `screenId-`
- ✅ `session.status` is "bound"
- ✅ Check server logs for: `[Pairing] Device registered: ...`
- ✅ Screen should be created in database with `paired: true`, `status: 'ONLINE'`

**Test with expired code:**
Wait 5+ minutes, then try to register with the same code.

**Expected Response (410):**
```json
{
  "ok": false,
  "error": "expired"
}
```

**Test with invalid code:**
```bash
curl -X POST http://localhost:3001/api/screens/pair/register \
  -H "Content-Type: application/json" \
  -d '{"code": "INVALID", "fingerprint": "DEVICE-FP-002", "model": "Test"}'
```

**Expected Response (400):**
```json
{
  "ok": false,
  "error": "invalid_code"
}
```

---

### 4. Complete Pairing

**Request:**
```bash
curl -X POST http://localhost:3001/api/screens/pair/complete \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "pair_1234567890_abc123"}'
```

**Expected Response (200):**
```json
{
  "ok": true,
  "screenId": "cmhy7nr8f0001jvi0tmptm4ip",
  "token": "cmhy7nr8f0001jvi0tmptm4ip-abc123"
}
```

**Check:**
- ✅ Response has `ok: true`
- ✅ `screenId` and `token` match the register response
- ✅ Check server logs for: `[Pairing] Session completed: ...`

**Test idempotency:**
Call the same endpoint again with the same `sessionId`.

**Expected:** Same response (idempotent)

**Test with invalid sessionId:**
```bash
curl -X POST http://localhost:3001/api/screens/pair/complete \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "invalid"}'
```

**Expected Response (400):**
```json
{
  "ok": false,
  "error": "invalid_session"
}
```

---

### 5. Heartbeat

**Request:**
```bash
curl -X POST http://localhost:3001/api/screens/:screenId/heartbeat \
  -H "Content-Type: application/json" \
  -d '{"token": "cmhy7nr8f0001jvi0tmptm4ip-abc123"}'
```

Replace `:screenId` with the actual screenId from step 3.

**Expected Response (200):**
```json
{
  "ok": true
}
```

**Check:**
- ✅ Response has `ok: true`
- ✅ Screen's `lastSeen` is updated in database
- ✅ Screen's `status` is "ONLINE"
- ✅ If screen was offline, SSE event `screen.online` should be emitted

**Test without token:**
```bash
curl -X POST http://localhost:3001/api/screens/:screenId/heartbeat \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Expected:** Should still work (token is optional)

**Test with invalid token:**
```bash
curl -X POST http://localhost:3001/api/screens/:screenId/heartbeat \
  -H "Content-Type: application/json" \
  -d '{"token": "invalid-token"}'
```

**Expected Response (401):**
```json
{
  "ok": false,
  "error": "invalid_token"
}
```

---

### 6. Hello Endpoint

**Request:**
```bash
curl -X POST http://localhost:3001/api/screens/hello \
  -H "Content-Type: application/json" \
  -d '{
    "fingerprint": "DEVICE-FP-002",
    "model": "Test Device 2",
    "name": "Test Screen 2"
  }'
```

**Expected Response (200):**
```json
{
  "ok": true
}
```

**Check:**
- ✅ Response has `ok: true`
- ✅ Screen is created/updated in database with `paired: false`, `status: 'OFFLINE'`
- ✅ Check server logs for: `[Pairing] New device announced: ...` or `[Pairing] Restored soft-deleted screen: ...`
- ✅ SSE event `screen:new` should be emitted

---

## Rate Limiting Tests

### Test Rate Limit on Initiate

**Request:** Make 11 rapid requests (limit is 10 per minute)
```bash
for i in {1..11}; do
  curl -X POST http://localhost:3001/api/screens/pair/initiate \
    -H "Content-Type: application/json" \
    -d '{"requester": "dashboard"}'
  echo ""
done
```

**Expected:**
- First 10 requests: 200 OK
- 11th request: 429 with `error: "rate_limit_exceeded"` and `Retry-After` header

---

### Test Max Active Sessions

**Request:** Create 11 sessions rapidly (limit is 10)
```bash
# Create 11 sessions
for i in {1..11}; do
  curl -X POST http://localhost:3001/api/screens/pair/initiate \
    -H "Content-Type: application/json" \
    -d '{"requester": "dashboard", "ttlSec": 60}'
  echo ""
done
```

**Expected:**
- First 10 sessions: 200 OK
- 11th session: 429 with `error: "too_many_active_sessions"`

---

## PowerShell Test Script

```powershell
# Set base URL
$baseUrl = "http://localhost:3001"

# 1. Initiate
Write-Host "1. Initiating pairing session..."
$initiate = Invoke-RestMethod -Uri "$baseUrl/api/screens/pair/initiate" `
  -Method POST -ContentType "application/json" `
  -Body '{"requester": "dashboard", "ttlSec": 300}'
Write-Host "Session ID: $($initiate.sessionId)"
Write-Host "Code: $($initiate.code)"
$code = $initiate.code
$sessionId = $initiate.sessionId

# 2. Peek
Write-Host "`n2. Peeking at code..."
$peek = Invoke-RestMethod -Uri "$baseUrl/api/screens/pair/peek/$code" -Method GET
Write-Host "Status: $($peek.status), TTL: $($peek.ttlLeftMs)ms"

# 3. Register
Write-Host "`n3. Registering device..."
$register = Invoke-RestMethod -Uri "$baseUrl/api/screens/pair/register" `
  -Method POST -ContentType "application/json" `
  -Body (@{
    code = $code
    fingerprint = "TEST-FP-$(Get-Random)"
    model = "Test Device"
    name = "Test Screen"
  } | ConvertTo-Json)
Write-Host "Screen ID: $($register.screenId)"
Write-Host "Token: $($register.token)"
$screenId = $register.screenId
$token = $register.token

# 4. Complete
Write-Host "`n4. Completing pairing..."
$complete = Invoke-RestMethod -Uri "$baseUrl/api/screens/pair/complete" `
  -Method POST -ContentType "application/json" `
  -Body (@{ sessionId = $sessionId } | ConvertTo-Json)
Write-Host "Completed: Screen ID: $($complete.screenId)"

# 5. Heartbeat
Write-Host "`n5. Sending heartbeat..."
$heartbeat = Invoke-RestMethod -Uri "$baseUrl/api/screens/$screenId/heartbeat" `
  -Method POST -ContentType "application/json" `
  -Body (@{ token = $token } | ConvertTo-Json)
Write-Host "Heartbeat OK: $($heartbeat.ok)"

Write-Host "`n✅ All tests passed!"
```

---

## Automated Test Checklist

- [ ] Initiate creates session with valid code
- [ ] Peek returns correct status for valid code
- [ ] Peek returns `not_found` for invalid code (200 status)
- [ ] Register creates screen and binds session
- [ ] Register rejects expired codes (410)
- [ ] Register rejects invalid codes (400)
- [ ] Complete is idempotent
- [ ] Complete rejects invalid session (400)
- [ ] Complete rejects expired session (410)
- [ ] Heartbeat updates lastSeen and status
- [ ] Heartbeat validates token (401 if invalid)
- [ ] Hello creates/updates screen
- [ ] Rate limiting works on initiate (429 after 10 requests)
- [ ] Max active sessions limit works (429 after 10 sessions)
- [ ] SSE events are emitted correctly
- [ ] Legacy endpoints return deprecated warnings

---

## Notes

- All endpoints return JSON with `ok: true/false`
- Error responses include `error` field with error code
- Rate limits are per-IP (in-memory, resets on server restart)
- Sessions are in-memory (lost on server restart)
- Expired sessions are cleaned up automatically every minute
- Old completed sessions are removed after 24 hours

