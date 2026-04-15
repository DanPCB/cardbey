# Pairing System Audit - cardbey-core

**Date:** 2025-01-14  
**Scope:** Screen pairing endpoints, session management, and related infrastructure

---

## Endpoint Audit

### 1. POST /api/screens/pair/initiate

**Location:** `src/routes/screens.js:336-380`

**Request:**
- Body: `{ requester?: string, ttlSec?: number }`
- Defaults: `requester = "dashboard"`, `ttlSec = 300` (5 minutes)

**Success Response (200):**
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

**Error Responses:**
- None explicitly handled (relies on error middleware)

**SSE Events:**
- ✅ Emits `pair.code_created` with: `{ code, expiresAt, ttlLeftMs, sessionId }`

**Implementation Details:**
- Creates session via `createPairSession({ ttlSec })` from `src/pair/sessionStore.js`
- Also syncs to `PairCode` table in database (with try/catch - failures are logged but don't fail the request)
- Session stored in-memory Map (not persisted to DB)

**TODOs/Comments:**
- None

---

### 2. GET /api/screens/pair/peek/:code

**Location:** `src/routes/screens.js:386-415`

**Request:**
- Params: `code` (string, URL path parameter)

**Success Response (200):**
```json
{
  "ok": true,
  "exists": true,
  "status": "showing_code" | "claimed" | "bound" | "expired",
  "ttlLeftMs": 300000
}
```

**Error Responses:**
- `400`: `{ ok: false, error: "code_required" }` (if code is empty)
- `200`: `{ ok: false, status: "not_found" }` (if code doesn't exist - intentionally 200 to avoid CORS/404 noise)

**SSE Events:**
- None

**Implementation Details:**
- Calls `expireSessions()` before checking
- Uses `findByCode(rawCode)` from session store
- Returns 200 even for not found (to avoid CORS issues)

**TODOs/Comments:**
- None

---

### 3. POST /api/screens/pair/register

**Location:** `src/routes/screens.js:446-573`

**Request:**
- Body: `{ code: string, fingerprint: string, model: string, name?: string, location?: string }`

**Success Response (200):**
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

**Error Responses:**
- `400`: `{ ok: false, error: "code_required" }` (if code missing)
- `400`: `{ ok: false, error: "fingerprint_required" }` (if fingerprint missing)
- `400`: `{ ok: false, error: "invalid_code" }` (if code not found)
- `410`: `{ ok: false, error: "expired" }` (if session expired)

**SSE Events:**
- ✅ Emits `pair.bound` with: `{ screenId, sessionId }`
- ✅ Emits `device.hello` with: `{ fingerprint, model, name }` (only if `isNewDevice === true`)

**Implementation Details:**
- Calls `expireSessions()` before checking
- Finds or creates Screen (restores soft-deleted screens if fingerprint matches)
- Generates token: `${screen.id}-${random(6)}`
- Updates session to `status: 'bound'` with `screenId` and `token`
- Deletes `PairCode` record from database (with catch - failures are ignored)
- Sets screen `status: 'ONLINE'`, `paired: true`, `statusText: 'paired'`

**TODOs/Comments:**
- None

---

### 4. POST /api/screens/pair/complete

**Location:** `src/routes/screens.js:631-697`

**Request:**
- Body: `{ sessionId: string }`

**Success Response (200):**
```json
{
  "ok": true,
  "screenId": "cmhy7nr8f0001jvi0tmptm4ip",
  "token": "cmhy7nr8f0001jvi0tmptm4ip-abc123"
}
```

**Error Responses:**
- `400`: `{ ok: false, error: "sessionId_required" }` (if sessionId missing)
- `400`: `{ ok: false, error: "invalid_session" }` (if session not found)
- `400`: `{ ok: false, error: "session_not_ready", status: "..." }` (if not bound yet)
- `410`: `{ ok: false, error: "expired" }` (if session expired)

**SSE Events:**
- None

**Implementation Details:**
- Calls `expireSessions()` before checking
- Idempotent: returns existing result if already completed
- Only allows completion if `status === 'bound'` and has `screenId` and `token`
- Sets `Cache-Control: no-store` header

**TODOs/Comments:**
- None

---

### 5. POST /api/screens/hello

**Location:** `src/routes/screens.js:283-330`

**Request:**
- Body: `{ fingerprint: string, model?: string, name?: string, location?: string }`

**Success Response (200):**
```json
{
  "ok": true
}
```

**Error Responses:**
- `400`: `{ ok: false, error: "fingerprint_required" }` (if fingerprint missing)

**SSE Events:**
- ✅ Emits `screen:new` with: `{ fingerprint, model, createdAt }`

**Implementation Details:**
- Creates or updates Screen record
- Restores soft-deleted screens if fingerprint matches
- Sets `status: 'OFFLINE'`, `paired: false`, `statusText: 'new'`
- This appears to be a legacy endpoint (separate from pairing flow)

**TODOs/Comments:**
- ⚠️ This endpoint seems disconnected from the pairing flow - it creates screens but doesn't pair them

---

### 6. POST /api/screens/:id/heartbeat

**Location:** `src/routes/screens.js:217-266`

**Request:**
- Params: `id` (screen ID)
- Body: `{ token?: string }` (optional)

**Success Response (200):**
```json
{
  "ok": true
}
```

**Error Responses:**
- `404`: `{ ok: false, error: "screen_not_found" }` (if screen not found or soft-deleted)
- `401`: `{ ok: false, error: "invalid_token" }` (if token provided but invalid)

**SSE Events:**
- ✅ Emits `screen.online` with: `{ id, name }` (only if status changed from offline → online)

**Implementation Details:**
- Uses `getScreenOr404()` helper (excludes soft-deleted)
- Validates token against pair sessions if provided (checks for `status === 'bound' || 'completed'`)
- Updates `lastSeen = new Date()` and `status = 'ONLINE'`
- Comment notes: "Devices should call this every 60s"

**TODOs/Comments:**
- None

---

## Database Models

### Screen Model (`prisma/schema.prisma:310-331`)

**Fields:**
- ✅ `id` - String @id @default(cuid())
- ✅ `fingerprint` - String @unique
- ✅ `name` - String?
- ✅ `location` - String?
- ✅ `paired` - Boolean @default(false)
- ✅ `status` - String @default("OFFLINE") (uses "ONLINE"/"OFFLINE")
- ✅ `statusText` - String?
- ✅ `lastSeen` - DateTime? (note: field name is `lastSeen`, not `lastSeenAt`)
- ✅ `deletedAt` - DateTime? (soft delete)
- ✅ `assignedPlaylistId` - String?
- ✅ `currentAsset` - String?
- ✅ `currentPlaylistId` - String?

**Relations:**
- ✅ `assignedPlaylist` - Playlist? (via `assignedPlaylistId`)
- ✅ `pairCodes` - PairCode[]

**Indexes:**
- ✅ `@@index([deletedAt])`

**Notes:**
- ⚠️ Field name mismatch: code uses `lastSeen` but some docs reference `lastSeenAt` - implementation uses `lastSeen` correctly

---

### PairCode Model (`prisma/schema.prisma:433-444`)

**Fields:**
- ✅ `code` - String @id
- ✅ `fingerprint` - String?
- ✅ `screenId` - String?
- ✅ `expiresAt` - DateTime
- ✅ `createdAt` - DateTime @default(now())
- ✅ `updatedAt` - DateTime @updatedAt

**Relations:**
- ✅ `screen` - Screen? (via `screenId`)

**Indexes:**
- ✅ `@@index([fingerprint])`

**Notes:**
- ⚠️ This model appears to be a legacy/dual-write system - pairing v2 uses in-memory session store, but `initiate` also writes to `PairCode` table
- ⚠️ `register` deletes the `PairCode` record, but session store is the source of truth

---

### PairingSession Model (`prisma/schema.prisma:421-431`)

**Fields:**
- ✅ `code` - String @id
- ✅ `status` - String @default("pending")
- ✅ `origin` - String?
- ✅ `issuedAt` - DateTime
- ✅ `expiresAt` - DateTime
- ✅ `screenId` - String?
- ✅ `deviceTempId` - String?
- ✅ `lastSeenAt` - DateTime @default(now())
- ✅ `updatedAt` - DateTime @updatedAt

**Notes:**
- ⛔ **This model is NOT used by the current pairing v2 implementation**
- The pairing system uses in-memory `Map<string, PairSession>` in `src/pair/sessionStore.js`
- This appears to be legacy/unused code

---

## Session Store Implementation

**Location:** `src/pair/sessionStore.js`

**Storage:**
- In-memory `Map<string, PairSession>` (not persisted to database)
- Sessions lost on server restart

**Session Structure:**
```typescript
{
  sessionId: string;
  code: string;
  expiresAt: number; // Unix timestamp in milliseconds
  status: 'showing_code' | 'claimed' | 'bound' | 'expired' | 'completed';
  screenId?: string;
  token?: string;
}
```

**Key Functions:**
- ✅ `createPairSession({ ttlSec })` - Creates new session
- ✅ `getPairSession(sessionId)` - Gets session by ID (auto-expires if needed)
- ✅ `findByCode(code)` - Finds session by code (auto-expires if needed)
- ✅ `updatePairSession(sessionId, status, updates)` - Updates session
- ✅ `completePairSession(sessionId)` - Marks as completed (idempotent)
- ✅ `expireSessions(now)` - Expires all expired sessions
- ✅ `getAllActiveSessions()` - Gets all non-expired, non-completed sessions
- ✅ `clearPairSessionsByScreenId(screenId)` - Revokes tokens for a screen

**TTL Enforcement:**
- ✅ Sessions auto-expire when accessed via `getPairSession()` or `findByCode()`
- ✅ `expireSessions()` called manually in routes (peek, register, complete)
- ⚠️ No automatic background cleanup - relies on route calls

---

## Workers & Schedulers

### Offline Watcher (`src/worker/offlineWatcher.js`)

**Purpose:** Marks screens as offline if they haven't sent a heartbeat in 3 minutes

**Implementation:**
- ✅ Runs every 30 seconds
- ✅ Checks screens with `status='ONLINE'` and `lastSeen < now - 3 minutes`
- ✅ Marks as `status='OFFLINE'`
- ✅ Emits SSE `screen.offline` event
- ✅ Started in `src/server.js` (only for API server, not worker)

**Configuration:**
- `OFFLINE_THRESHOLD_MS = 3 * 60 * 1000` (3 minutes)
- `CHECK_INTERVAL_MS = 30 * 1000` (30 seconds)

**Status:** ✅ Working

---

### Screen Status Checker (`src/worker/screenStatusChecker.js`)

**Purpose:** Pings screens to check if they're online (HTTP health checks)

**Implementation:**
- ✅ Runs every 20 seconds (configurable)
- ✅ Pings screens via HTTP GET to `/health` endpoint
- ✅ Uses `httpGet()` utility with timeout and error classification
- ✅ Marks screens offline on failure
- ✅ Concurrency limiting (max 10 simultaneous)
- ✅ Backoff for failed screens (once per minute after 5+ failures)

**Status:** ✅ Working (but separate from pairing flow)

---

### Pairing Session Cleanup

**Status:** ⛔ **MISSING**

- No background worker to clean up expired sessions from memory
- Relies on route calls to `expireSessions()`
- Expired sessions remain in memory until accessed
- No automatic cleanup of old/completed sessions

---

## Legacy/Inconsistent Code

### 1. POST /api/screens/pair/claim

**Location:** `src/routes/screens.js:577-624`

**Status:** ⚠️ **LEGACY ROUTE**

- Marked as "kept for backward compatibility"
- Uses v2 session store but maintains old response format
- Doesn't fully support fingerprint-based claiming
- Should be deprecated/removed

---

### 2. PairCode Table Dual-Write

**Status:** ⚠️ **INCONSISTENT**

- `initiate` writes to both in-memory store AND `PairCode` table
- `register` deletes from `PairCode` table but session store is source of truth
- This creates potential inconsistency
- `PairCode` table appears unused by v2 flow

---

### 3. PairingSession Model

**Status:** ⛔ **UNUSED**

- Database model exists but is never used
- All pairing uses in-memory session store
- Should be removed or documented as legacy

---

### 4. POST /api/screens/hello

**Status:** ⚠️ **DISCONNECTED**

- Creates/updates screens but doesn't pair them
- Separate from pairing flow
- Purpose unclear - may be legacy

---

## Core Checklist

### ✅ Items that are clearly done and match the intended flow

1. ✅ **POST /api/screens/pair/initiate** - Creates pairing sessions correctly
2. ✅ **GET /api/screens/pair/peek/:code** - Checks session status with proper expiry handling
3. ✅ **POST /api/screens/pair/register** - Device registration works, creates screens, generates tokens
4. ✅ **POST /api/screens/pair/complete** - Idempotent completion works correctly
5. ✅ **POST /api/screens/:id/heartbeat** - Heartbeat updates status and lastSeen correctly
6. ✅ **Session store** - In-memory store with proper TTL handling
7. ✅ **SSE events** - All required events are emitted (`pair.code_created`, `pair.bound`, `device.hello`, `screen.online`)
8. ✅ **Offline watcher** - Automatically marks screens offline after 3 minutes
9. ✅ **Screen model** - All required fields present (status, lastSeen, deletedAt)
10. ✅ **Soft delete** - Screens are soft-deleted correctly, tokens revoked
11. ✅ **Token validation** - Heartbeat validates tokens against pair sessions
12. ✅ **Idempotency** - Complete endpoint is idempotent

---

### ⚠️ Items that exist but look inconsistent / legacy

1. ⚠️ **POST /api/screens/pair/claim** - Legacy route, should be deprecated
2. ⚠️ **PairCode table dual-write** - Writes to both in-memory store and DB table, but only store is used
3. ⚠️ **PairingSession model** - Database model exists but is never used
4. ⚠️ **POST /api/screens/hello** - Disconnected from pairing flow, purpose unclear
5. ⚠️ **Field name inconsistency** - Code uses `lastSeen` but some docs reference `lastSeenAt` (implementation is correct)
6. ⚠️ **No automatic session cleanup** - Expired sessions remain in memory until accessed

---

### ⛔ Items that are missing and should be implemented

1. ⛔ **Automatic session cleanup worker** - Background job to remove expired/completed sessions from memory
2. ⛔ **Rate limiting** - No rate limiting on pairing endpoints (could be abused)
3. ⛔ **Session persistence** - Sessions lost on server restart (should persist to DB or Redis)
4. ⛔ **One source of truth** - Dual-write to PairCode table creates inconsistency risk
5. ⛔ **Session cleanup on server shutdown** - No graceful cleanup of sessions
6. ⛔ **Max active sessions limit** - No limit on number of concurrent pairing sessions
7. ⛔ **Code collision detection** - Only tries 25 times to find unique code (could fail)
8. ⛔ **Token storage** - Tokens only in memory, lost on restart (devices would need to re-pair)
9. ⛔ **Audit logging** - No logging of pairing events for debugging/audit
10. ⛔ **Multi-tenant support** - No tenant/org filtering in pairing (commented out in code)

---

## Recommendations

### High Priority

1. **Remove dual-write to PairCode table** - Use session store as single source of truth
2. **Add automatic session cleanup** - Background worker to remove expired sessions
3. **Add rate limiting** - Protect pairing endpoints from abuse
4. **Persist sessions to database** - Use PairingSession model or Redis for persistence

### Medium Priority

5. **Deprecate legacy routes** - Remove `/pair/claim` and document migration path
6. **Remove unused PairingSession model** - Or implement it as the source of truth
7. **Add session limits** - Max concurrent pairing sessions per user/tenant
8. **Improve code collision handling** - Better algorithm or use UUIDs

### Low Priority

9. **Audit logging** - Log pairing events for debugging
10. **Document /hello endpoint** - Clarify purpose or remove if unused
11. **Multi-tenant support** - Add tenant filtering if needed

---

## Summary

The pairing system is **functionally complete** for the basic flow (initiate → register → complete), but has several **reliability and consistency issues**:

- ✅ Core flow works correctly
- ⚠️ Legacy code and dual-write systems create confusion
- ⛔ Missing persistence and cleanup mechanisms
- ⛔ No rate limiting or abuse protection

**Overall Status:** ⚠️ **Functional but needs hardening for production**

