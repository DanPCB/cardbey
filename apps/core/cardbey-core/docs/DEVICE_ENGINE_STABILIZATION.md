# Device Engine Stabilization

## Summary

Stabilized Device Engine without orchestration/automation. Focused on pairing, playlist assignment, and repair/help request flow to prevent TV from getting stuck on waiting page.

## Changes Made

### 1. Device Engine Map

Added comprehensive endpoint map at top of `src/routes/deviceEngine.js`:

- **Pairing:** `request-pairing`, `complete-pairing`, `claim`, `pair-status`
- **Playlist fetch:** `GET /api/device/:deviceId/playlist/full` with normalized states
- **Heartbeat:** `POST /api/device/heartbeat` with repair status handling
- **Repair/help:** `trigger-repair`, `clear-repair`, `pair-alert`, `connection-alert`
- **Debug:** `GET /api/device/:id/debug` for diagnostics

### 2. Normalized Playlist Endpoint Response

**File:** `src/routes/deviceEngine.js` (lines ~1756-1850)

**Changed:** `GET /api/device/:deviceId/playlist/full` now returns explicit states:

```typescript
{
  ok: true,
  deviceId: string,
  state: "no_binding" | "pending_binding" | "ready",
  message: string,
  playlist?: PlaylistFull | null
}
```

**States:**
- `no_binding` - No playlist assigned (TV shows "No playlist assigned" but stays online)
- `pending_binding` - Playlist assignment pending (TV shows "Waiting for playlist..." but continues heartbeats)
- `ready` - Playlist ready for playback (normal playback)

**Benefits:**
- TV app can make explicit UI decisions based on state
- No more ambiguous `playlist: null` responses
- Clear messaging for each state

### 3. Repair Flow Fixes

**File:** `src/engines/device/triggerRepair.js`

**Changes:**
1. Sets device status to `repair_requested` when repair is triggered
2. Sets status to `repair_in_progress` during repair actions
3. Added comprehensive logging:
   - `[DEVICE_REPAIR] Request from dashboard: {...}`
   - `[DEVICE_REPAIR] Device status set to repair_requested`
   - `[DEVICE_REPAIR] Repair actions completed`
4. Returns repair status in response

**File:** `src/routes/deviceEngine.js` (heartbeat handler)

**Changes:**
1. Heartbeat now respects repair state:
   - If device is in `repair_requested` or `repair_in_progress`, keeps repair state
   - Only clears repair state if heartbeat explicitly sets `status: "online"`
2. Heartbeat response includes `repairStatus` field when in repair state
3. Added logging for repair state transitions

**New Endpoint:** `POST /api/device/:id/clear-repair`
- Allows dashboard to manually clear repair state
- Sets device status to `online`
- Broadcasts status change via SSE
- Useful if device is stuck in repair state

### 4. Debug Endpoint

**New Endpoint:** `GET /api/device/:id/debug`

**Response:**
```typescript
{
  ok: true,
  device: { id, name, status, type, platform, tenantId, storeId, lastSeenAt, ... },
  bindings: [{ id, playlistId, status, version, lastPushedAt, ... }],
  playlist: { id, name, type, itemCount, items: [...] } | null,
  lastHeartbeat: { timestamp, ageSeconds } | null,
  repairStatus: "repair_requested" | "repair_in_progress" | null,
  derivedState: "online_with_playlist" | "online_no_playlist" | "offline" | "repair_waiting",
  activeBindingId: string | null,
  activeBindingStatus: string | null
}
```

**Use Cases:**
- Diagnostics when device is stuck
- Understanding device state before making changes
- Debugging pairing/playlist issues
- Device Agent integration (future)

## Device States

### Derived States (from debug endpoint)

1. **`online_with_playlist`**
   - Device is online (heartbeat < 3 min ago)
   - Has active binding with status `ready`
   - Playlist exists and has items
   - **TV Action:** Normal playback

2. **`online_no_playlist`**
   - Device is online (heartbeat < 3 min ago)
   - No active binding OR binding status not `ready` OR playlist empty
   - **TV Action:** Show "No playlist assigned" but stay online

3. **`offline`**
   - Device status is `offline` OR no heartbeat in last 3 minutes
   - **TV Action:** Show offline state

4. **`repair_waiting`**
   - Device status is `repair_requested` or `repair_in_progress`
   - **TV Action:** Show waiting page until status clears

### Repair Status Flow

1. **Repair Requested:**
   - Dashboard calls `POST /api/device/trigger-repair`
   - Device status set to `repair_requested`
   - TV detects status change via heartbeat response
   - TV shows waiting page

2. **Repair In Progress:**
   - Repair actions execute
   - Device status set to `repair_in_progress`
   - TV continues showing waiting page

3. **Repair Complete:**
   - Option A: Device sends heartbeat with `status: "online"` → Status clears automatically
   - Option B: Dashboard calls `POST /api/device/:id/clear-repair` → Status cleared manually
   - TV detects status change → Exits waiting page → Resumes normal operation

## New/Changed Endpoints

### Changed Endpoints

1. **GET /api/device/:deviceId/playlist/full**
   - **Before:** `{ ok, deviceId, playlist: {...} | null, hasPlaylist: boolean }`
   - **After:** `{ ok, deviceId, state: "no_binding"|"pending_binding"|"ready", message, playlist?: {...} }`
   - **Impact:** TV app can make explicit UI decisions

2. **POST /api/device/heartbeat**
   - **Before:** Always set status to `online` on heartbeat
   - **After:** Respects repair state, only clears if heartbeat says `status: "online"`
   - **New Field:** `repairStatus` in response when in repair state
   - **Impact:** TV stays in waiting page during repair

### New Endpoints

1. **POST /api/device/:id/clear-repair** (auth required)
   - Manually clear repair state
   - Sets device status to `online`
   - Broadcasts status change

2. **GET /api/device/:id/debug** (auth required, read-only)
   - Get comprehensive device state snapshot
   - Useful for diagnostics and Device Agent integration

## Testing Guide

### Test 1: Pair a New TV

1. **TV:** Call `POST /api/device/request-pairing`
   - Should receive: `{ ok: true, sessionId, code, expiresAt }`
   - TV displays pairing code

2. **Dashboard:** Complete pairing via `POST /api/device/complete-pairing`
   - Device record updated: `tenantId`, `storeId` set, `pairingCode` cleared
   - Status set to `online`

3. **TV:** Poll `GET /api/device/pair-status/:sessionId`
   - Should see: `{ status: "claimed", deviceId: "..." }`
   - TV transitions to playlist fetch

### Test 2: Assign Playlist

1. **Dashboard:** Assign playlist to device
   - Creates `DevicePlaylistBinding` with status `pending`

2. **TV:** Call `GET /api/device/:deviceId/playlist/full`
   - If binding status `pending`: `{ state: "pending_binding", message: "Playlist assignment pending..." }`
   - TV shows "Waiting for playlist..." but continues heartbeats

3. **TV:** Confirm playlist ready via `POST /api/device/confirm-playlist-ready`
   - Binding status changes to `ready`

4. **TV:** Call `GET /api/device/:deviceId/playlist/full` again
   - Should see: `{ state: "ready", playlist: {...} }`
   - TV starts playback

### Test 3: Trigger Repair

1. **Dashboard:** Call `POST /api/device/trigger-repair` with `{ deviceId, repairType: "full_reset" }`
   - Device status set to `repair_requested`
   - Backend logs: `[DEVICE_REPAIR] Request from dashboard: {...}`

2. **TV:** Sends heartbeat `POST /api/device/heartbeat`
   - Response includes: `{ repairStatus: "repair_requested", ... }`
   - TV detects repair status → Shows waiting page

3. **TV:** Continues sending heartbeats
   - Status remains `repair_requested` (not auto-cleared)
   - TV stays on waiting page

4. **Option A - Auto Clear:** TV sends heartbeat with `{ status: "online" }`
   - Status clears to `online`
   - TV exits waiting page

5. **Option B - Manual Clear:** Dashboard calls `POST /api/device/:id/clear-repair`
   - Status set to `online`
   - TV detects change on next heartbeat → Exits waiting page

### Test 4: Clear Repair & See TV Resume

1. **Check Debug:** `GET /api/device/:id/debug`
   - Should show: `{ derivedState: "repair_waiting", repairStatus: "repair_requested" }`

2. **Clear Repair:** `POST /api/device/:id/clear-repair`
   - Response: `{ ok: true, previousStatus: "repair_requested", newStatus: "online" }`

3. **TV:** Next heartbeat receives `{ status: "online", repairStatus: null }`
   - TV exits waiting page
   - TV resumes normal operation (playlist fetch/playback)

4. **Verify:** `GET /api/device/:id/debug`
   - Should show: `{ derivedState: "online_with_playlist" | "online_no_playlist", repairStatus: null }`

## Logging

### Repair Flow Logs

```
[DEVICE_REPAIR] Request from dashboard: { deviceId, repairType, currentStatus, hasActiveBinding, bindingId }
[DEVICE_REPAIR] Device status set to repair_requested
[DEVICE_REPAIR] Repair actions completed: { deviceId, repairId, actions, currentStatus }
[HEARTBEAT] Device still in repair state: { deviceId, status }
[HEARTBEAT] Device cleared repair state via heartbeat: { deviceId, previousStatus }
[DEVICE_REPAIR] Clear repair request: { deviceId, user }
[DEVICE_REPAIR] Repair state cleared: { deviceId, previousStatus, newStatus }
```

### Playlist State Logs

```
[Device Engine] Device bindings check: { deviceId, activeBindingFound, activeBindingStatus, totalBindings }
[Device Engine] Playlist/full response: { deviceId, playlistId, state, itemCount, bindingStatus }
```

### Debug Logs

```
[DEVICE_DEBUG] Debug request: { deviceId, user }
[DEVICE_DEBUG] Debug snapshot generated: { deviceId, derivedState, repairStatus, hasPlaylist, bindingCount }
```

## Files Modified

1. **src/routes/deviceEngine.js**
   - Added device engine map comment
   - Normalized playlist endpoint response with explicit states
   - Updated heartbeat to respect repair state
   - Added `clear-repair` endpoint
   - Added `debug` endpoint

2. **src/engines/device/triggerRepair.js**
   - Sets device status to `repair_requested` on repair trigger
   - Sets status to `repair_in_progress` during repair actions
   - Added comprehensive logging
   - Returns repair status in response

## No Orchestration Changes

As requested:
- ✅ No Orchestrator tables created
- ✅ No new background workers
- ✅ No automation/queues
- ✅ Only REST endpoint stabilization
- ✅ Only logging improvements

## Next Steps (Frontend)

The frontend (TV app) should:

1. **Handle Playlist States:**
   - `state === "no_binding"` → Show "No playlist assigned" (but stay online)
   - `state === "pending_binding"` → Show "Waiting for playlist..." (continue heartbeats)
   - `state === "ready"` → Normal playback

2. **Handle Repair Status:**
   - Check `repairStatus` in heartbeat response
   - If `repairStatus === "repair_requested" || "repair_in_progress"` → Show waiting page
   - Continue sending heartbeats while in repair state
   - Exit waiting page when `repairStatus === null` or `status === "online"`

3. **Use Debug Endpoint:**
   - Call `GET /api/device/:id/debug` for diagnostics
   - Use `derivedState` to understand device state
   - Use `repairStatus` to check if in repair

## Exit Conditions for Waiting Page

The TV should exit the waiting page when:

1. **Heartbeat response shows:**
   - `status === "online"` AND `repairStatus === null` (or missing)

2. **Playlist response shows:**
   - `state === "ready"` (if waiting for playlist)

3. **Explicit clear:**
   - Dashboard calls `POST /api/device/:id/clear-repair`
   - Next heartbeat will show `status === "online"`

The TV should NOT exit waiting page if:
- `repairStatus === "repair_requested"` or `"repair_in_progress"`
- `state === "pending_binding"` (if waiting for playlist)

