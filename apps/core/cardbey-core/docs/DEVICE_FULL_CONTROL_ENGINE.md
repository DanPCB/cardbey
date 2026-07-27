# Device Full Control Engine (P2) - Implementation Summary

## Overview

The Device Full Control Engine provides complete remote control capabilities for devices, including command queuing, execution tracking, and screenshot capture.

## Database Schema Updates

### Device Model
Added screenshot fields:
- `lastScreenshotBase64` (String?) - Base64 encoded screenshot (dev only, will migrate to S3 URL)
- `lastScreenshotAt` (DateTime?) - When screenshot was taken

### DeviceCommand Model
Already exists with support for all command types:
- `type`: 'play' | 'pause' | 'next' | 'previous' | 'reloadPlaylist' | 'setPlaylistIndex' | 'setVolume' | 'setBrightness' | 'screenshot'
- `status`: 'pending' | 'sent' | 'executed' | 'failed'
- `payload`: JSON object with command-specific data

## API Endpoints

### 1. POST /api/device/command (Dashboard-initiated, requires auth)
Queue a command for a device.

**Request:**
```json
{
  "deviceId": "cmik9wfdh0019jvsoeeaey0r0",
  "type": "play",
  "payload": {} // Optional, command-specific
}
```

**Command Types:**
- `play` - Start playback
- `pause` - Pause playback
- `next` - Skip to next item
- `previous` - Skip to previous item
- `reloadPlaylist` - Reload current playlist
- `setPlaylistIndex` - Jump to specific index (payload: `{ index: number }`)
- `setVolume` - Set volume (payload: `{ volume: number }` where 0-1)
- `setBrightness` - Set brightness (payload: `{ brightness: number }` where 0-1)
- `screenshot` - Request screenshot from device

**Response:**
```json
{
  "ok": true,
  "id": "cmd_abc123"
}
```

### 2. POST /api/device/heartbeat (Device-initiated, no auth)
Extended to handle command execution acknowledgements and return pending commands.

**Request:**
```json
{
  "deviceId": "cmik9wfdh0019jvsoeeaey0r0",
  "status": "playing",
  "executedCommandIds": ["cmd_abc123", "cmd_def456"], // Array of executed command IDs
  // ... other heartbeat fields
}
```

**Response:**
```json
{
  "ok": true,
  "paired": true,
  "status": "playing",
  "commands": [
    {
      "id": "cmd_xyz789",
      "type": "pause",
      "payload": {},
      "createdAt": "2025-01-15T10:30:00.000Z"
    }
  ],
  "playlist": { ... },
  "nextHeartbeatInSeconds": 30
}
```

### 3. POST /api/device/screenshot (Device-initiated, no auth)
Upload screenshot from device.

**Request:**
```json
{
  "deviceId": "cmik9wfdh0019jvsoeeaey0r0",
  "imageBase64": "data:image/png;base64,iVBORw0KGgo..."
}
```

**Response:**
```json
{
  "ok": true
}
```

### 4. GET /api/device/list (Dashboard, requires auth)
Extended to return screenshot fields.

**Response includes:**
```json
{
  "ok": true,
  "data": {
    "devices": [
      {
        "id": "...",
        "lastScreenshotBase64": "data:image/png;base64,...",
        "lastScreenshotAt": "2025-01-15T10:30:00.000Z",
        // ... other device fields
      }
    ]
  }
}
```

## Command Flow

1. **Dashboard queues command:**
   - POST `/api/device/command` with `deviceId`, `type`, `payload`
   - Command is created with status `pending`

2. **Device polls for commands:**
   - POST `/api/device/heartbeat` with `deviceId`
   - Backend returns pending commands in response
   - Commands are marked as `sent` when delivered

3. **Device executes command:**
   - Device processes command locally
   - Next heartbeat includes `executedCommandIds: ["cmd_abc123"]`
   - Backend marks commands as `executed`

4. **Screenshot flow:**
   - Dashboard sends `screenshot` command
   - Device captures screenshot and uploads via POST `/api/device/screenshot`
   - Screenshot is stored in `Device.lastScreenshotBase64`
   - Dashboard can display screenshot via `/api/device/list`

## Implementation Files

- `src/engines/device/commands.js` - Command queue management
- `src/routes/deviceEngine.js` - API endpoints
- `prisma/schema.prisma` - Database schema (DeviceCommand model, Device screenshot fields)

## Migration Required

After updating the schema, run:
```bash
npx prisma migrate dev --name add_device_screenshot_fields
npx prisma generate
```

## Command Payload Examples

```javascript
// Set playlist index
{ type: "setPlaylistIndex", payload: { index: 5 } }

// Set volume (0.0 to 1.0)
{ type: "setVolume", payload: { volume: 0.75 } }

// Set brightness (0.0 to 1.0)
{ type: "setBrightness", payload: { brightness: 0.8 } }

// Simple commands (no payload needed)
{ type: "play" }
{ type: "pause" }
{ type: "next" }
{ type: "previous" }
{ type: "reloadPlaylist" }
{ type: "screenshot" }
```

## Status

✅ **Completed:**
- DeviceCommand model (already exists)
- Command queue functions (`enqueueDeviceCommand`, `getPendingCommandsForDevice`, `markCommandsAsExecuted`)
- Extended heartbeat to accept `executedCommandIds` and return commands
- `/api/device/command` endpoint with all command types
- `/api/device/screenshot` endpoint
- Extended `/api/device/list` to return screenshot fields
- Schema updated with screenshot fields

🔄 **Next Steps:**
1. Run Prisma migration to add screenshot fields
2. Update dashboard UI to use command endpoints
3. Update player to execute commands and send acknowledgements
4. Implement screenshot capture in player
5. (Future) Migrate screenshots to S3 instead of base64

