# C-Net Pairing Engine - Implementation Summary

## Overview

The C-Net pairing engine has been fully implemented and finalized in `cardbey-core`. This is the canonical source of truth for pairing TVs/fixed devices to Cardbey.

## Key Changes

### 1. Database Schema (`prisma/schema.prisma`)

**Updated `PairingSession` model** with all required fields:
- `sessionId` (primary key, cuid)
- `code` (unique, 6-character uppercase)
- `status` (enum: "showing_code" | "bound" | "expired")
- `expiresAt` (DateTime)
- `deviceToken` (optional, token returned to device)
- `fingerprint` (string, required)
- `model` (string, required)
- `name` (string, required)
- `location` (string, optional)
- `screenId` (nullable foreign key to Screen)
- `claimedBy` (JSON string with userId/workspaceId)
- `origin` (optional, for backward compatibility)
- `createdAt`, `updatedAt`

**Indexes added:**
- Unique on `code`
- Index on `expiresAt`
- Index on `status`
- Index on `fingerprint`

**Relation added:**
- `Screen.pairingSessions` - One-to-many relationship

### 2. Database-Backed Session Store (`src/pair/dbSessionStore.js`)

Created a new database-backed session store that replaces the in-memory store:
- All sessions are persisted to the database
- Functions: `createPairSession`, `getPairSession`, `findByCode`, `updatePairSession`, `expireSessions`, `getAllActiveSessions`, `getActiveSessionCount`, `clearPairSessionsByScreenId`
- Automatic expiration handling
- Unique code allocation with collision detection

### 3. API Endpoints (`src/routes/screens.js`)

#### POST `/api/screens/pair/initiate` (Device-initiated)
- **Purpose**: TV/slideshow app calls this to get a pairing code
- **Request**: `{ fingerprint: string, model: string, name?: string, location?: string }`
- **Response**: `{ ok: true, sessionId: string, code: string, expiresAt: ISO string, ttlLeftMs: number, status: "showing_code" }`
- **Validation**: Requires `fingerprint` and `model`
- **Behavior**: Creates a new pairing session, does NOT automatically pair the screen

#### GET `/api/screens/pair/sessions/:sessionId/status` (TV Polling)
- **Purpose**: TV polls this to check if pairing is complete
- **Response cases**:
  - `showing_code`: `{ ok: true, status: "showing_code", ttlLeftMs: number }`
  - `bound`: `{ ok: true, status: "bound", screenId: string, token: string, ttlLeftMs: 0 }`
  - `expired`: `{ ok: true, status: "expired", ttlLeftMs: 0 }`
- **Error**: 404 if session not found

#### GET `/api/screens/pair/peek/:code` (Dashboard)
- **Purpose**: Dashboards call this to check if a code exists and get session details
- **Response**: 
  - If exists: `{ ok: true, exists: true, ttlLeftMs: number, session: {...} }`
  - If not found/expired: `{ ok: true, exists: false, ttlLeftMs: 0 }`
- **Behavior**: Read-only, does not bind or claim anything

#### POST `/api/screens/pair/complete` (Dashboard-initiated)
- **Purpose**: Dashboards call this when user enters a code and clicks Pair
- **Request**: `{ code: string, name?: string, location?: string }`
- **Response**: `{ ok: true, screenId: string, token: string, session: {...} }`
- **Behavior**:
  - Looks up session by code
  - Creates or links screen by fingerprint
  - Generates device token
  - Marks session as `bound`
  - Stores `claimedBy` (user/workspace from auth context)
  - Idempotent: returns existing result if already bound

### 4. Legacy Endpoints (Deprecated)

- **POST `/api/screens/pair/register`**: Marked as deprecated, kept for backward compatibility (Option 2 - Auto-accept flow)
- **POST `/api/screens/pair/claim`**: Already deprecated, kept for backward compatibility

## State Machine

1. **showing_code**: Session created, waiting for dashboard to complete
2. **bound**: Dashboard completed pairing, screen created/linked, token generated
3. **expired**: Session expired (time passed or manually expired)

## Migration Instructions

### Step 1: Run Database Migration

```bash
npx prisma migrate dev --name add_pairing_session_fields
```

This will:
- Update the `PairingSession` model with new fields
- Add indexes
- Add relation to `Screen` model
- **Note**: Existing data in `PairingSession` table will be preserved, but you may need to handle data migration if the schema changes are incompatible.

### Step 2: Verify Migration

```bash
npx prisma studio
# Or check the migration file in prisma/migrations/
```

### Step 3: Test the Implementation

See `docs/PAIRING_TEST_INSTRUCTIONS.md` for detailed testing instructions.

Quick test:
```bash
chmod +x scripts/test-pairing.sh
BASE_URL=http://localhost:3001 ./scripts/test-pairing.sh
```

## Canonical Flow

The new canonical pairing flow is:

1. **TV/Device**: `POST /api/screens/pair/initiate` → Gets `sessionId` and `code`
2. **TV/Device**: Polls `GET /api/screens/pair/sessions/:sessionId/status` → Waits for `status: "bound"`
3. **Dashboard**: `GET /api/screens/pair/peek/:code` → Checks if code exists and gets session details
4. **Dashboard**: `POST /api/screens/pair/complete` → Completes pairing, creates/links screen
5. **TV/Device**: Polling detects `status: "bound"` → Gets `screenId` and `token`, starts playing

## Files Modified/Created

### Modified:
- `prisma/schema.prisma` - Updated PairingSession model
- `src/routes/screens.js` - Updated all pairing endpoints

### Created:
- `src/pair/dbSessionStore.js` - Database-backed session store
- `scripts/test-pairing.sh` - Test script
- `docs/PAIRING_TEST_INSTRUCTIONS.md` - Testing documentation
- `docs/PAIRING_IMPLEMENTATION_SUMMARY.md` - This file

## Notes

- Sessions expire after 5 minutes (300 seconds) by default
- All sessions are persisted to the database (not in-memory)
- The `claimedBy` field stores JSON with `userId`/`workspaceId` (extracted from auth middleware if available)
- Legacy endpoints are marked as deprecated but still work for backward compatibility
- The pairing engine is now the single source of truth for pairing state

## Next Steps

1. Run the migration: `npx prisma migrate dev --name add_pairing_session_fields`
2. Test the endpoints using the provided test script
3. Update Android TV/tablet app to use the new endpoints
4. Update dashboards to use the new endpoints
5. Monitor for any issues with the database-backed store

