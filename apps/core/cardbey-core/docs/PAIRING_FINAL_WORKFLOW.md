# Pairing Function - Final Clean Workflow

## Overview

After 6-7 days of iterations, the pairing function has been cleaned up and consolidated into **ONE simple, logical workflow**. All redundant endpoints have been removed or deprecated.

## The Single Canonical Workflow

```
┌─────────┐                    ┌──────────┐                    ┌──────────┐
│ Device  │                    │  Backend │                    │Dashboard │
│ (Tablet)│                    │   Core   │                    │   Web    │
└────┬────┘                    └────┬─────┘                    └────┬─────┘
     │                              │                               │
     │ 1. POST /pair/initiate       │                               │
     │    {fingerprint, model}      │                               │
     ├─────────────────────────────>│                               │
     │                              │                               │
     │                              │ Create PairingSession         │
     │                              │ Generate 6-char code          │
     │                              │ Broadcast 'pairing_started'   │
     │                              │                               │
     │ 2. Response:                 │                               │
     │    {sessionId, code, ...}    │                               │
     │<─────────────────────────────┤                               │
     │                              │                               │
     │ Display code on screen       │                               │
     │ "YZF8BS - Enter on dashboard"│                               │
     │                              │                               │
     │ 3. Poll status (every 2s)    │                               │
     │    GET /sessions/:id/status  │                               │
     ├─────────────────────────────>│                               │
     │                              │                               │
     │    Response:                 │                               │
     │    {status: "showing_code"}  │                               │
     │<─────────────────────────────┤                               │
     │                              │                               │
     │ (Keep polling...)            │                               │
     │                              │                               │
     │                              │ 4. User enters code           │
     │                              │    GET /peek/:code            │
     │                              │<──────────────────────────────┤
     │                              │                               │
     │                              │ 5. Verify code exists         │
     │                              │    Response: {exists: true}   │
     │                              │──────────────────────────────>│
     │                              │                               │
     │                              │ 6. Complete pairing           │
     │                              │    POST /complete             │
     │                              │    {code, name?, location?}   │
     │                              │<──────────────────────────────┤
     │                              │                               │
     │                              │ Create/Update Screen          │
     │                              │ Generate token                │
     │                              │ Update session: bound         │
     │                              │ Broadcast 'pairing_completed' │
     │                              │                               │
     │                              │ 7. Response:                  │
     │                              │    {screenId, token, ...}     │
     │                              │──────────────────────────────>│
     │                              │                               │
     │ 8. Poll detects "bound"      │                               │
     │    GET /sessions/:id/status  │                               │
     ├─────────────────────────────>│                               │
     │                              │                               │
     │    Response:                 │                               │
     │    {status: "bound",         │                               │
     │     screenId, token}         │                               │
     │<─────────────────────────────┤                               │
     │                              │                               │
     │ Store screenId + token       │                               │
     │ Start playing content        │                               │
     │                              │                               │
```

## Active Endpoints (Keep These)

### 1. `POST /api/screens/pair/initiate` - Device Creates Session
**Purpose:** Device requests a pairing code

**Request:**
```json
{
  "fingerprint": "ABC123...",
  "model": "Tablet Model",
  "name": "Optional Name",
  "location": "Optional Location"
}
```

**Response:**
```json
{
  "ok": true,
  "sessionId": "cmi3sr1f70000jvo09npaiwif",
  "code": "YZF8BS",
  "expiresAt": "2025-11-17T23:59:59.000Z",
  "ttlLeftMs": 300000,
  "status": "showing_code"
}
```

### 2. `GET /api/screens/pair/sessions/:sessionId/status` - Device Polls Status
**Purpose:** Device checks if pairing is complete

**Response (showing_code):**
```json
{
  "ok": true,
  "status": "showing_code",
  "ttlLeftMs": 45000
}
```

**Response (bound):**
```json
{
  "ok": true,
  "status": "bound",
  "screenId": "cmi3rfy1d0000jvs8xo0dhwdh",
  "token": "cmi3rfy1d0000jvs8xo0dhwdh-xyz123",
  "ttlLeftMs": 0
}
```

### 3. `GET /api/screens/pair/peek/:code` - Dashboard Checks Code
**Purpose:** Dashboard verifies a code exists before completing

**Response:**
```json
{
  "ok": true,
  "exists": true,
  "ttlLeftMs": 45000,
  "session": {
    "sessionId": "cmi3sr1f70000jvo09npaiwif",
    "code": "YZF8BS",
    "status": "showing_code",
    "fingerprint": "ABC123...",
    "model": "Tablet Model",
    "name": "Device Name",
    "location": null
  }
}
```

### 4. `POST /api/screens/pair/complete` - Dashboard Completes Pairing
**Purpose:** Dashboard completes pairing and creates/links screen

**Request:**
```json
{
  "code": "YZF8BS",
  "name": "Front Desk Display",
  "location": "Main Lobby"
}
```

**Response:**
```json
{
  "ok": true,
  "screenId": "cmi3rfy1d0000jvs8xo0dhwdh",
  "token": "cmi3rfy1d0000jvs8xo0dhwdh-xyz123",
  "session": {
    "sessionId": "cmi3sr1f70000jvo09npaiwif",
    "code": "YZF8BS",
    "status": "bound",
    "expiresAt": "2025-11-17T23:59:59.000Z",
    "fingerprint": "ABC123...",
    "model": "Tablet Model",
    "name": "Front Desk Display",
    "location": "Main Lobby"
  }
}
```

### 5. `GET /api/screens/pair/active` - List Active Sessions
**Purpose:** Dashboard lists all pending pairing sessions

**Response:**
```json
{
  "ok": true,
  "sessions": [
    {
      "code": "YZF8BS",
      "ttlLeftMs": 45000,
      "status": "showing_code"
    }
  ]
}
```

## Deprecated Endpoints (Return Errors)

### `POST /api/screens/pair/start` - Returns 410
**Status:** Deprecated - Dashboards should NOT generate codes
**Replacement:** Device calls `/initiate`, dashboard uses `/peek` and `/complete`

### `POST /api/screens/pair/register` - Returns 410
**Status:** Deprecated - Pairing must be completed from dashboard
**Replacement:** Use `/complete` from dashboard

### `POST /api/screens/pair/claim` - Removed
**Status:** Removed - Was broken and redundant
**Replacement:** Use `/complete` from dashboard

## Removed/Commented Out

- `/api/pair/*` routes (old router, commented out in server.js)
- Old in-memory sessionStore (replaced with dbSessionStore)
- Duplicate pairing logic in `/hello` endpoint

## Key Principles

1. **Single Source of Truth:** All pairing sessions stored in database (`PairingSession` model)
2. **Device-Initiated:** Devices create sessions, dashboards complete them
3. **No Redundancy:** Only ONE way to do each step
4. **Clear State Machine:** `showing_code` → `bound` → `expired`
5. **Idempotent:** Multiple calls to `/complete` with same code are safe

## Database Schema

```prisma
model PairingSession {
  sessionId    String   @id @default(cuid())
  code         String   @unique
  status       String   @default("showing_code") // "showing_code" | "bound" | "expired"
  expiresAt    DateTime
  deviceToken  String?
  fingerprint  String
  model        String
  name         String
  location     String?
  screenId     String?
  screen       Screen?  @relation(...)
  claimedBy    String?
  origin       String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}
```

## Testing

Test the complete flow:

```powershell
# 1. Device initiates
$init = Invoke-RestMethod -Uri "http://192.168.1.7:3001/api/screens/pair/initiate" `
  -Method POST -ContentType "application/json" `
  -Body '{"fingerprint":"TEST123","model":"Test Tablet"}'

$code = $init.code
$sessionId = $init.sessionId
Write-Host "Code: $code"

# 2. Device polls (simulated)
$status = Invoke-RestMethod -Uri "http://192.168.1.7:3001/api/screens/pair/sessions/$sessionId/status"
Write-Host "Status: $($status.status)"

# 3. Dashboard peeks
$peek = Invoke-RestMethod -Uri "http://192.168.1.7:3001/api/screens/pair/peek/$code"
Write-Host "Exists: $($peek.exists)"

# 4. Dashboard completes
$complete = Invoke-RestMethod -Uri "http://192.168.1.7:3001/api/screens/pair/complete" `
  -Method POST -ContentType "application/json" `
  -Body "{`"code`":`"$code`",`"name`":`"Test Display`"}"

Write-Host "Screen ID: $($complete.screenId)"
Write-Host "Token: $($complete.token)"

# 5. Device polls again (should be bound)
$final = Invoke-RestMethod -Uri "http://192.168.1.7:3001/api/screens/pair/sessions/$sessionId/status"
Write-Host "Final Status: $($final.status)"
```

## Summary

✅ **Clean:** One workflow, no redundancy
✅ **Simple:** 5 endpoints, clear purpose for each
✅ **Working:** Tested and verified
✅ **Maintainable:** Single source of truth, clear state machine
✅ **Complete:** Handles all edge cases (expiry, idempotency, soft-delete)

The pairing function is now **production-ready** and **closed for further changes** unless critical bugs are found.


