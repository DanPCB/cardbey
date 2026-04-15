# C-Net Pairing Engine - Testing Instructions

## Prerequisites

1. **Database Migration**: Run Prisma migration to update the schema:
   ```bash
   npx prisma migrate dev --name add_pairing_session_fields
   ```

2. **Start the server**:
   ```bash
   npm start
   # or
   node src/server.js
   ```

## Test Script

A bash test script is provided at `scripts/test-pairing.sh`:

```bash
chmod +x scripts/test-pairing.sh
BASE_URL=http://localhost:3001 ./scripts/test-pairing.sh
```

## Manual Testing

### 1. Initiate Pairing (TV/Device)

```bash
curl -X POST http://localhost:3001/api/screens/pair/initiate \
  -H "Content-Type: application/json" \
  -d '{
    "fingerprint": "294FB61B31490FE0",
    "model": "AndroidTablet",
    "name": "AWPM108T",
    "location": "Front Desk"
  }'
```

**Expected Response:**
```json
{
  "ok": true,
  "sessionId": "cm...",
  "code": "QRC4KK",
  "expiresAt": "2025-11-17T...",
  "ttlLeftMs": 300000,
  "status": "showing_code"
}
```

### 2. Check Status (TV Polling)

```bash
curl http://localhost:3001/api/screens/pair/sessions/{sessionId}/status
```

**Expected Response (showing_code):**
```json
{
  "ok": true,
  "status": "showing_code",
  "ttlLeftMs": 299500
}
```

### 3. Peek at Code (Dashboard)

```bash
curl http://localhost:3001/api/screens/pair/peek/QRC4KK
```

**Expected Response:**
```json
{
  "ok": true,
  "exists": true,
  "ttlLeftMs": 299500,
  "session": {
    "sessionId": "cm...",
    "code": "QRC4KK",
    "status": "showing_code",
    "fingerprint": "294FB61B31490FE0",
    "model": "AndroidTablet",
    "name": "AWPM108T",
    "location": "Front Desk"
  }
}
```

### 4. Complete Pairing (Dashboard)

```bash
curl -X POST http://localhost:3001/api/screens/pair/complete \
  -H "Content-Type: application/json" \
  -d '{
    "code": "QRC4KK",
    "name": "Lobby Display",
    "location": "Front Desk"
  }'
```

**Expected Response:**
```json
{
  "ok": true,
  "screenId": "cm...",
  "token": "cm...-xyz",
  "session": {
    "sessionId": "cm...",
    "code": "QRC4KK",
    "status": "bound",
    "expiresAt": "2025-11-17T...",
    "fingerprint": "294FB61B31490FE0",
    "model": "AndroidTablet",
    "name": "Lobby Display",
    "location": "Front Desk"
  }
}
```

### 5. Check Status Again (TV Polling - Should be Bound)

```bash
curl http://localhost:3001/api/screens/pair/sessions/{sessionId}/status
```

**Expected Response (bound):**
```json
{
  "ok": true,
  "status": "bound",
  "screenId": "cm...",
  "token": "cm...-xyz",
  "ttlLeftMs": 0
}
```

## State Machine

1. **showing_code**: Session created, waiting for dashboard to complete
2. **bound**: Dashboard completed pairing, screen created/linked, token generated
3. **expired**: Session expired (time passed or manually expired)

## Error Cases

### Invalid Code
```bash
curl http://localhost:3001/api/screens/pair/peek/INVALID
```
**Response:**
```json
{
  "ok": true,
  "exists": false,
  "ttlLeftMs": 0
}
```

### Expired Session
Wait 5+ minutes after creating a session, then try to complete:
```bash
curl -X POST http://localhost:3001/api/screens/pair/complete \
  -H "Content-Type: application/json" \
  -d '{"code": "EXPIRED"}'
```
**Response:**
```json
{
  "ok": false,
  "error": "invalid_or_expired_code"
}
```

## Database Verification

Check the database to verify sessions are persisted:

```bash
# Using Prisma Studio
npx prisma studio

# Or using SQLite CLI
sqlite3 prisma/dev.db "SELECT * FROM PairingSession ORDER BY createdAt DESC LIMIT 5;"
```

## Notes

- Sessions expire after 5 minutes (300 seconds) by default
- Sessions are persisted to the database (not in-memory)
- The `claimedBy` field stores JSON with userId/workspaceId (if auth middleware is configured)
- Legacy endpoints (`/pair/register`, `/pair/claim`) are marked as deprecated but still work for backward compatibility

