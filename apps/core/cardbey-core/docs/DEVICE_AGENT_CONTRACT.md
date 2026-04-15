# Device Agent Contract - Canonical Implementation

This document describes the canonical Device Agent Contract that all TV/Tablet/C-Net players should follow.

## Overview

The Device Agent Contract is a standardized API for device communication, built on top of the Device Engine endpoints. It provides:

- **Device-initiated pairing** (no auth required)
- **Dashboard-initiated pairing completion** (no auth required)
- **Heartbeat with command polling** (no auth required)
- **Playlist synchronization** (via heartbeat response)
- **Command queue system** (reload, next, prev, pause, resume, repair, setBrightness)

## Core Endpoints

### Device-Initiated (No Auth Required)

- `POST /api/device/request-pairing` - Request pairing code
- `POST /api/device/heartbeat` - Send heartbeat, receive commands + playlist
- `POST /api/device/confirm-playlist-ready` - Confirm playlist loaded

### Dashboard-Initiated (No Auth Required)

- `POST /api/device/complete-pairing` - Complete pairing with code

### Server-Side Only (Requires Auth)

- `POST /api/device/push-playlist` - Push playlist to device
- `POST /api/device/trigger-repair` - Trigger repair actions
- `POST /api/device/:deviceId/commands` - Queue command for device
- `GET /api/device/list` - List devices for tenant/store

## Pairing Flow

### Step 1: Device Requests Pairing

**Request:** `POST /api/device/request-pairing`

```json
{
  "deviceModel": "FireTV-4K-Max",
  "platform": "android_tv",
  "appVersion": "1.0.0",
  "capabilities": {
    "supportsVideo": true,
    "supportsImage": true,
    "supportsWeb": true,
    "orientation": "landscape"
  },
  "initialState": {
    "locale": "en-AU",
    "timezone": "Australia/Melbourne"
  }
}
```

**Response:**

```json
{
  "deviceId": "dev_5f1c8e65b3",
  "pairingCode": "7K9QF2",
  "expiresAt": "2025-11-29T11:45:00.000Z"
}
```

**Device Behavior:**
- Store `deviceId` persistently (localStorage / SharedPreferences)
- Display `pairingCode` full-screen: "Enter this code in your Cardbey dashboard"
- Poll `POST /api/device/heartbeat` every 30-60s until `paired: true`

### Step 2: Dashboard Completes Pairing

**Request:** `POST /api/device/complete-pairing`

```json
{
  "pairingCode": "7K9QF2",
  "tenantId": "cmiiu06in0000jvugbxqkfhar",
  "storeId": "cmiiu1jop0002jvug7s9u51qt",
  "name": "Front Window TV",
  "location": "123 Main St - Front Window"
}
```

**Response:**

```json
{
  "deviceId": "dev_5f1c8e65b3",
  "status": "online",
  "type": "screen",
  "storeId": "cmiiu1jop0002jvug7s9u51qt"
}
```

**Device Behavior:**
- Continue polling `POST /api/device/heartbeat`
- When `paired: true` in response, switch from "Waiting for pairing" to "Ready / Waiting for playlist"

## Heartbeat Contract

### Request: `POST /api/device/heartbeat`

Every 30-60s (recommended: 30s).

```json
{
  "deviceId": "dev_5f1c8e65b3",
  "status": "playing",
  "playbackState": {
    "playlistId": "pl_123",
    "playlistVersion": 3,
    "currentItemId": "pl_item_7",
    "currentIndex": 2,
    "progressSeconds": 12,
    "isPlaying": true
  },
  "metrics": {
    "batteryLevel": null,
    "storageFreeMb": 2048,
    "wifiStrength": -60,
    "temperatureC": 40
  },
  "errorCode": null,
  "errorMessage": null,
  "platform": "android_tv",
  "appVersion": "1.0.0",
  "ip": "192.168.1.50",
  "executedCommands": [
    {
      "id": "cmd_abc123",
      "status": "done"
    }
  ]
}
```

### Response

```json
{
  "ok": true,
  "paired": true,
  "status": "playing",
  "commands": [
    {
      "id": "cmd_abc123",
      "type": "reload",
      "payload": {
        "reason": "playlist_updated"
      }
    }
  ],
  "playlistLock": {
    "locked": true,
    "playlistId": "pl_critical_campaign"
  },
  "playlist": {
    "id": "pl_critical_campaign",
    "version": 4,
    "name": "Black Friday Sale",
    "items": [
      {
        "id": "item_1",
        "type": "image",
        "url": "https://cdn.cardbey.com/tenant123/pl_crit/img1.jpg",
        "durationSeconds": 8,
        "transition": "fade",
        "meta": {
          "fitMode": "cover",
          "backgroundColor": "#000000"
        }
      },
      {
        "id": "item_2",
        "type": "video",
        "url": "https://cdn.cardbey.com/tenant123/pl_crit/video1.mp4",
        "meta": {
          "loop": true,
          "mute": false
        }
      }
    ]
  },
  "nextHeartbeatInSeconds": 30
}
```

### Device Behavior

1. **If `paired: false`**: Continue showing "Waiting for pairing" screen
2. **If `paired: true` and `playlistLock.locked === true`**: Always play the locked playlist, ignore any local/default playlist
3. **If `playlist` is present and `playlist.version > localVersion`**:
   - Replace local playlist
   - Start/restart playback
   - Call `POST /api/device/confirm-playlist-ready` with `status: "ready"`
4. **If `commands` array is present**: Execute each command, then report execution in next heartbeat's `executedCommands` array

## Command Types

```typescript
type DeviceCommandType =
  | "reload"        // Reload playlist
  | "next"         // Skip to next item
  | "prev"         // Skip to previous item
  | "pause"        // Pause playback
  | "resume"       // Resume playback
  | "repair"       // Trigger repair actions
  | "setBrightness"; // Set brightness (payload: { level: 0-100 })
```

### Command Execution

1. Device receives commands in heartbeat response
2. Device executes commands in order
3. Device reports execution in next heartbeat:
   ```json
   {
     "executedCommands": [
       { "id": "cmd_abc123", "status": "done" },
       { "id": "cmd_def456", "status": "failed" }
     ]
   }
   ```
4. Server removes executed commands from queue

## Playlist Confirmation

### Request: `POST /api/device/confirm-playlist-ready`

```json
{
  "deviceId": "dev_5f1c8e65b3",
  "playlistId": "pl_critical_campaign",
  "playlistVersion": 4,
  "status": "ready"
}
```

**Response:**

```json
{
  "ok": true
}
```

Used by backend to track playlist sync success rate and power metrics.

## Queue Command (Server-Side)

### Request: `POST /api/device/:deviceId/commands`

**Requires:** Authentication

```json
{
  "type": "reload",
  "payload": {
    "reason": "playlist_updated"
  }
}
```

**Response:**

```json
{
  "ok": true,
  "command": {
    "id": "cmd_abc123",
    "type": "reload",
    "payload": {
      "reason": "playlist_updated"
    }
  }
}
```

## Implementation Status

✅ **Completed:**
- Request pairing endpoint (device-initiated, no auth)
- Complete pairing endpoint (dashboard-initiated, no auth)
- Heartbeat endpoint with full contract (commands, playlist, playlistLock)
- Confirm playlist ready endpoint
- Command queue system (in-memory)
- Playlist lock mechanism
- Executed commands tracking

🔄 **Future Enhancements:**
- Persist command queue to database (currently in-memory)
- Enhanced playlist lock logic (tags, metadata)
- Command retry mechanism
- Command execution timeout tracking

## Migration from Legacy Endpoints

**Legacy endpoints to retire:**
- `/api/screens/*` (use `/api/device/*` instead)
- `/api/cnet/*` (use `/api/device/*` instead)
- Legacy `/api/devices` with `lastSeen` (use `/api/device/heartbeat` with `lastSeenAt`)

**Migration path:**
1. Update device players to use new endpoints
2. Update dashboard to use new pairing flow
3. Deprecate legacy endpoints with 410 responses
4. Remove legacy endpoints after migration period

