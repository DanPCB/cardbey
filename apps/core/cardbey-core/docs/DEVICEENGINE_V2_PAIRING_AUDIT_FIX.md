# DeviceEngine V2 Pairing Audit & Fix

## Summary

Complete audit and fix of DeviceEngine V2 pairing flow. All legacy Screen pairing endpoints are frozen (410 Gone). Only DeviceEngine V2 pairing is supported.

## Changes Made

### Step 1: Backend - Verified request-pairing and complete-pairing ✅

**File: `apps/core/cardbey-core/src/engines/device/requestPairing.js`**
- ✅ Creates DeviceEngine V2 pair session (Device record with pairingCode)
- ✅ Stores sessionId (device.id), code, status (via pairingCode presence), tenantId='temp', storeId='temp', expiresAt
- ✅ Added structured logging: `[DeviceEngine V2] request-pairing`

**File: `apps/core/cardbey-core/src/engines/device/completePairing.js`**
- ✅ Only works against DeviceEngine V2 (Device table by pairingCode)
- ✅ No legacy fallback (removed)
- ✅ Finds PENDING session by code (device with pairingCode and tenantId='temp')
- ✅ Marks as CLAIMED (clears pairingCode, sets real tenantId/storeId)
- ✅ Creates/links Device row with type from request-pairing
- ✅ Returns: `{ ok: true, deviceId, status, type, storeId, data: { device: {...} } }`
- ✅ Added structured logging: `[DeviceEngine V2] complete-pairing`

**File: `apps/core/cardbey-core/src/routes/deviceEngine.js`**
- ✅ Added GET `/api/device/pair-status/:sessionId` endpoint
- ✅ Returns: `{ ok: true, status: "pending|claimed|expired", deviceId: "..." | null }`
- ✅ When status === "claimed", includes non-null deviceId
- ✅ Added logging for pair-status requests

### Step 2: Backend - Fixed SSE Routing ✅

**File: `apps/core/cardbey-core/src/realtime/simpleSse.js`**
- ✅ Added detailed logging for client connections:
  - Logs: `[SSE] Client connected` with key, totalClients, clientsWithKey
- ✅ Enhanced broadcast logging:
  - Shows totalClients, clientsWithKey, allKeys when broadcasting
  - Warns if no clients with matching key

**File: `apps/core/cardbey-core/src/engines/device/deviceEvents.js`**
- ✅ Fixed SSE event broadcasting:
  - Now broadcasts with actual event type (e.g., `device.pairing.claimed`)
  - Also broadcasts as `device_engine_event` for backward compatibility
  - Both use key='admin' (matches dashboard connection)

**File: `apps/core/cardbey-core/src/engines/device/completePairing.js`**
- ✅ Emits `device.pairing.claimed` event via `emitDeviceEvent()`
- ✅ Broadcasts `device:update` event for real-time dashboard updates
- ✅ All broadcasts use key='admin'

**File: `apps/dashboard/cardbey-marketing-dashboard/src/lib/sseClient.ts`**
- ✅ Added DeviceEngine V2 event types to addEventListener:
  - `device.pairing.requested`
  - `device.pairing.claimed`
  - `device.status.changed`
  - `device_engine_event`

### Step 3: Dashboard - Pair Device Modal ✅

**File: `apps/dashboard/cardbey-marketing-dashboard/src/features/devices/DevicesPageTable.tsx`**
- ✅ Already uses `completeDevicePairing()` from `deviceClient.ts`
- ✅ Calls `POST /api/device/complete-pairing` (correct endpoint)
- ✅ Enhanced error handling:
  - Displays backend error message
  - Handles DeviceEngine V2 error codes (invalid_code, expired, etc.)
- ✅ On success:
  - Closes modal
  - Refetches devices list
  - Invalidates query cache
- ✅ Added logging for pairing flow

**File: `apps/dashboard/cardbey-marketing-dashboard/src/api/deviceClient.ts`**
- ✅ Already calls `/api/device/complete-pairing` (correct)
- ✅ Returns `{ ok: boolean, data?: { device: any }, error?: string }`

### Step 4: Dashboard - SSE Event Handling ✅

**File: `apps/dashboard/cardbey-marketing-dashboard/src/features/devices/DevicesPageTable.tsx`**
- ✅ Enhanced SSE event logging:
  - Logs ALL device-related events (device.*, device_engine_event, device:paired, device:update, device:heartbeat)
  - Logs full event payload for debugging
- ✅ Handles `device.pairing.claimed` event:
  - Closes pairing popup
  - Refetches devices
  - Shows success toast
  - Invalidates query cache
- ✅ Uses `useDeviceEngineEvents` hook for typed event handling

## Endpoints

### DeviceEngine V2 (Active)

1. **POST /api/device/request-pairing**
   - Device requests pairing code
   - Returns: `{ ok: true, sessionId, code, expiresAt }`
   - Creates Device record with pairingCode, tenantId='temp', storeId='temp'

2. **POST /api/device/complete-pairing**
   - Dashboard completes pairing
   - Body: `{ pairingCode, tenantId, storeId, name?, location? }`
   - Returns: `{ ok: true, deviceId, status, type, storeId, data: { device: {...} } }`
   - Marks device as CLAIMED (clears pairingCode, sets tenantId/storeId)

3. **GET /api/device/pair-status/:sessionId**
   - Tablet polls pairing status
   - Returns: `{ ok: true, status: "pending|claimed|expired", deviceId: "..." | null }`
   - When status === "claimed", includes deviceId

### Legacy Screen Pairing (FROZEN - 410 Gone)

- **POST /api/screens/pair/initiate** → Returns 410 Gone
- **POST /api/screens/pair/complete** → Returns 410 Gone

## SSE Events

### Event Types Broadcast

1. **device.pairing.requested**
   - Emitted when device requests pairing
   - Payload: `{ sessionId, code, engine: 'DEVICE_V2', deviceType, expiresAt }`

2. **device.pairing.claimed**
   - Emitted when dashboard completes pairing
   - Payload: `{ sessionId, deviceId, code, tenantId, storeId, name, status, engine: 'DEVICE_V2' }`

3. **device:update**
   - Emitted on device status changes
   - Payload: `{ deviceId, status, lastSeenAt, tenantId, storeId, name }`

4. **device:paired** (legacy, for backward compatibility)
   - Payload: `{ deviceId, name, platform, type, status, lastSeenAt }`

### SSE Key Matching

- **Backend broadcasts**: key='admin'
- **Dashboard connects**: key='admin' (from `tokens.apiKey || "admin"`)
- ✅ Keys match - events should be received

## Expected Flow

1. **Tablet**: Calls `POST /api/device/request-pairing`
   - Receives: `{ sessionId, code, expiresAt }`
   - Shows QR code and pairing code
   - Polls: `GET /api/device/pair-status/:sessionId` (status = "pending")

2. **Dashboard**: User enters code in Pair Device modal
   - Calls: `POST /api/device/complete-pairing`
   - Backend:
     - Marks DeviceEngine pair session as CLAIMED
     - Creates/links Device record
     - Emits `device.pairing.claimed` event
     - Broadcasts `device:update` event

3. **Tablet**: Polls `GET /api/device/pair-status/:sessionId`
   - Receives: `{ status: "claimed", deviceId: "..." }`
   - Leaves pairing screen, enters paired state

4. **Dashboard**: 
   - Receives SSE `device.pairing.claimed` event
   - OR refetches after complete-pairing success
   - Shows new device under "Online Devices" with Engine: DEVICE v2

## Logging

### Backend Logs

- `[DeviceEngine V2] request-pairing` - When device requests pairing
- `[DeviceEngine V2] complete-pairing` - When dashboard completes pairing
- `[DeviceEngine V2] pair-status` - When tablet polls status
- `[SSE] Client connected` - When dashboard connects to SSE
- `[SSE] Broadcast 'device.pairing.claimed'` - When event is broadcast
- `[SSE] No clients connected with key 'admin'` - Warning if dashboard not connected

### Dashboard Logs

- `[DevicesPage] Calling completeDevicePairing` - When pairing starts
- `[DevicesPage] Pairing successful` - When pairing succeeds
- `[DevicesPage] Device SSE event received` - When SSE events arrive
- `[DevicesPage] Pairing claimed event received` - When pairing.claimed arrives

## Testing Checklist

- [ ] Tablet can request pairing (POST /api/device/request-pairing)
- [ ] Tablet receives sessionId, code, expiresAt
- [ ] Tablet can poll status (GET /api/device/pair-status/:sessionId)
- [ ] Dashboard Pair Device modal calls POST /api/device/complete-pairing
- [ ] Backend marks session as CLAIMED
- [ ] Backend emits device.pairing.claimed event
- [ ] SSE event reaches dashboard (check console logs)
- [ ] Dashboard refetches devices after pairing
- [ ] New device appears in "Online Devices" section
- [ ] Tablet receives status="claimed" on next poll
- [ ] Tablet leaves pairing screen

## Known Issues Fixed

1. ✅ Removed legacy pairing fallback from DeviceEngine complete-pairing
2. ✅ Fixed SSE event broadcasting (now uses actual event type)
3. ✅ Added pair-status endpoint for tablet polling
4. ✅ Enhanced logging throughout pairing flow
5. ✅ Fixed response format to match dashboard expectations
6. ✅ Added SSE event listeners for DeviceEngine V2 events

## Next Steps

1. Test the complete flow end-to-end
2. Monitor backend logs for SSE connection issues
3. Verify dashboard receives SSE events (check browser console)
4. Ensure devices appear in "Online Devices" after pairing

