# DEVICE v2 Pairing & Online Status Fix

## Overview

Fixed DEVICE v2 pairing and online status issues to ensure reliable device-to-Core communication and proper dashboard status display.

## Issues Fixed

### 1. Heartbeat Status Updates
- **Problem**: Devices sending heartbeats weren't always marked as "online" in the dashboard
- **Fix**: Heartbeat endpoint now always sets `status: 'online'` when heartbeat is received (unless explicitly set to 'offline' or 'degraded')
- **Location**: `src/routes/deviceEngine.js` - POST `/api/device/heartbeat`

### 2. Enhanced DEVICE v2 Logging
- **Problem**: Difficult to debug DEVICE v2 heartbeat issues
- **Fix**: Added comprehensive logging for DEVICE v2 heartbeats including:
  - Device ID, engine version, platform
  - IP address, timestamp
  - Status changes (offline → online)
  - Tenant/store information
- **Location**: `src/routes/deviceEngine.js` - POST `/api/device/heartbeat`

### 3. Playlist Endpoint Response
- **Problem**: Playlist endpoint didn't clearly indicate when no playlist was assigned
- **Fix**: Added `hasPlaylist: false` flag to response when no active playlist binding exists
- **Location**: `src/routes/deviceEngine.js` - GET `/api/device/:deviceId/playlist/full`

### 4. SSE Event Payload
- **Problem**: Dashboard might not have all necessary fields to display device status
- **Fix**: Enhanced `device.status.changed` SSE event to include:
  - `lastSeenAt` (critical for "last seen X ago" display)
  - `name`, `model`, `location` (for device identification)
  - `platform`, `engineVersion` (for device type display)
- **Location**: `src/routes/deviceEngine.js` - POST `/api/device/heartbeat`

## DEVICE v2 Expected Flow

### 1. Pairing
```
Device App → POST /api/device/request-pairing
  → Returns: { ok: true, sessionId, code, expiresAt }
  
Device App → Polls GET /api/device/pair-status/:sessionId
  → Waits for status: "claimed"
  
Dashboard → User enters code → POST /api/device/claim-pairing
  → Returns: { ok: true, deviceId }
```

### 2. Heartbeat (Every 30 seconds)
```
Device App → POST /api/device/heartbeat
  Body: {
    deviceId: "...",
    engineVersion: "DEVICE v2",
    platform: "android_tv" | "android_tablet",
    status: "online"
  }
  
Core → Updates Device.lastSeenAt = now
Core → Updates Device.status = "online"
Core → Emits SSE event: device.status.changed
```

### 3. Playlist Fetching
```
Device App → GET /api/device/:deviceId/playlist/full

If no playlist:
  → Returns: { ok: true, deviceId, playlist: null, hasPlaylist: false }
  → Device shows: "No playlist assigned. Waiting for content..."

If playlist bound:
  → Returns: { ok: true, deviceId, playlist: { id, name, items: [...] } }
  → Device plays playlist items
```

## Offline Detection

The offline watcher (`src/worker/offlineWatcher.js`) checks devices every 30 seconds:

- **Threshold**: 3 minutes (180 seconds)
- **Logic**: If `lastSeenAt` is null OR `lastSeenAt < (now - 3 minutes)`, mark device as offline
- **Action**: Updates `Device.status = 'offline'` and emits SSE events

**Important**: The dashboard determines online/offline status based on `lastSeenAt`, not `status` field. The `status` field is updated by the offline watcher, but the dashboard computes status from `lastSeenAt` for real-time accuracy.

## Key Fields

### Device Model
- `id`: Device ID (used in all API calls)
- `lastSeenAt`: **Critical** - Updated on every heartbeat, used for offline detection
- `status`: 'online' | 'offline' | 'degraded' (updated by heartbeat and offline watcher)
- `tenantId`, `storeId`: Required for pairing
- `platform`: 'android_tv' | 'android_tablet' | etc.
- `appVersion`: Engine version (e.g., "DEVICE v2")

### DevicePlaylistBinding
- `deviceId`: Links to Device
- `playlistId`: Links to Playlist (type='SIGNAGE')
- `status`: 'pending' | 'ready' | 'failed'
- `lastPushedAt`: When playlist was assigned

## Testing

### Test Heartbeat
```bash
curl -X POST http://localhost:3001/api/device/heartbeat \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "<existing-device-id>",
    "engineVersion": "DEVICE v2",
    "platform": "android_tv",
    "status": "online"
  }'
```

**Expected**:
- Device.lastSeenAt updated to current time
- Device.status = "online"
- SSE event `device.status.changed` emitted
- Console log: `[Device Engine] DEVICE v2 heartbeat complete`

### Test Playlist Endpoint
```bash
curl http://localhost:3001/api/device/<device-id>/playlist/full
```

**If no playlist**:
```json
{
  "ok": true,
  "deviceId": "...",
  "playlist": null,
  "hasPlaylist": false
}
```

**If playlist bound**:
```json
{
  "ok": true,
  "deviceId": "...",
  "playlist": {
    "id": "...",
    "name": "...",
    "items": [...]
  }
}
```

## Dashboard Integration

The dashboard should:

1. **Listen for SSE events**: `device.status.changed` and `device:update`
2. **Compute online status**: Check if `lastSeenAt` is within last 3 minutes
3. **Display devices**: Show in "Online Devices" if `lastSeenAt >= (now - 3 minutes)`, else "Recently Offline"

## Notes

- Heartbeat must be sent every 30 seconds to stay online
- Network timeouts don't break pairing - device can resume heartbeats when connection recovers
- Playlist assignment creates a `DevicePlaylistBinding` with status='pending', which device confirms via `/api/device/confirm-playlist-ready`
- The offline watcher runs every 30 seconds and marks devices offline if no heartbeat in 3 minutes



