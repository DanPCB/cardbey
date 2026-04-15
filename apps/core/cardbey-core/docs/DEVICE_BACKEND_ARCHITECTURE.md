# Device Backend Architecture

## Overview

This document describes the backend orchestration layer for device management, which mirrors the Android DeviceAgent functionality. The backend provides device registration, pairing, playlist management, real-time communication via WebSocket, and remote control capabilities.

## Architecture Components

### 1. Device Model & Persistence

**Location**: `prisma/schema.prisma`

The `Device` model includes:
- `id` - Device ID (CUID)
- `tenantId` - Tenant ID
- `storeId` - Store ID
- `pairingCode` - Unique pairing code (nullable, cleared after pairing)
- `status` - Device status: "online" | "offline" | "degraded"
- `name` - Device name (optional)
- `model` - Device model (optional)
- `location` - Device location label (optional)
- `appVersion` - App version (optional)
- `lastSeenAt` - Last seen timestamp
- `createdAt`, `updatedAt` - Timestamps

**Related Models**:
- `DeviceCapability` - Device capabilities (video, image, audio, etc.)
- `DeviceStateSnapshot` - Periodic device state snapshots
- `DevicePlaylistBinding` - Playlist assignments to devices

### 2. DeviceService Layer

**Location**: `src/services/deviceService.js`

Service layer that abstracts database operations and provides high-level device management functions.

#### Methods

**`registerOrPairDevice(input)`**
- Registers a new device or completes pairing with existing device
- Generates pairing codes
- Returns device config with `streamBaseUrl` and `apiBaseUrl`

**`recordHeartbeat(input)`**
- Updates device `lastSeenAt` and `status`
- Creates `DeviceStateSnapshot` if info provided

**`attachPlaylistToDevice(input)`**
- Creates or updates `DevicePlaylistBinding`
- Links playlist to device

**`getPlaylistForDevice(deviceId)`**
- Fetches playlist data for device
- Formats playlist items for device consumption

**`recordCommand(deviceId, command)`**
- Records remote commands for auditing (TODO: implement DeviceCommand table)

**`findById(deviceId)`**
- Finds device by ID with latest binding and snapshot

**`findByPairingCode(pairingCode)`**
- Finds device by pairing code

**`markOnline(deviceId, data?)`**
- Marks device as online

**`markOffline(deviceId)`**
- Marks device as offline

**`updateCurrentPlaylist(deviceId, playlistId)`**
- Updates current playlist for device

### 3. DeviceWebSocketHub

**Location**: `src/realtime/deviceWebSocketHub.js`

Manages WebSocket connections per device for real-time bidirectional communication.

#### Features

- **Connection Management**: Tracks connections per `deviceId`
- **Message Routing**: Sends messages to specific devices
- **Broadcast**: Sends messages to multiple devices
- **Connection Status**: Tracks which devices are connected

#### WebSocket Endpoint

```
ws://{streamBaseUrl}/api/devices/{deviceId}/realtime
```

#### Message Types

**From Server to Device**:

1. **Playlist Update**
```json
{
  "type": "playlist_update",
  "playlistId": "playlist-123",
  "timestamp": 1234567890
}
```

2. **Command**
```json
{
  "type": "command",
  "command": "reload_playlist",
  "payload": {},
  "timestamp": 1234567890
}
```

Commands:
- `reload_playlist` - Reload current playlist
- `restart` - Restart device app
- `custom` - Custom command with payload

**From Device to Server**:

1. **Ping**
```json
{
  "type": "ping"
}
```

Server responds with:
```json
{
  "type": "pong",
  "timestamp": 1234567890
}
```

#### Usage

```javascript
import { getDeviceWebSocketHub } from './realtime/deviceWebSocketHub.js';

const hub = getDeviceWebSocketHub();

// Send playlist update
hub.sendToDevice(deviceId, {
  type: 'playlist_update',
  playlistId: 'playlist-123',
  timestamp: Date.now(),
});

// Send command
hub.sendToDevice(deviceId, {
  type: 'command',
  command: 'reload_playlist',
  timestamp: Date.now(),
});

// Broadcast to multiple devices
hub.broadcastToDevices([deviceId1, deviceId2], {
  type: 'command',
  command: 'restart',
  timestamp: Date.now(),
});
```

### 4. REST API Endpoints

**Location**: `src/routes/deviceAgentRoutes.js`

#### Device Registration & Pairing

**POST `/api/devices/register`**
- Register new device or complete pairing
- Request body:
  ```json
  {
    "pairingCode": "ABCD12",  // optional
    "platform": "android_tv",  // optional
    "tenantId": "tenant-123",  // optional
    "storeId": "store-123",  // optional
    "metadata": {
      "appVersion": "1.0.0",
      "model": "JVC-123"
    }
  }
  ```
- Response:
  ```json
  {
    "ok": true,
    "deviceId": "device-123",
    "status": "paired",
    "pairingCode": "ABCD12",  // only if unpaired
    "config": {
      "streamBaseUrl": "ws://localhost:3001",
      "apiBaseUrl": "http://localhost:3001"
    }
  }
  ```

#### Heartbeat

**POST `/api/devices/:deviceId/heartbeat`**
- Record device heartbeat
- Request body:
  ```json
  {
    "status": "online",  // optional
    "info": {
      "playlistVersion": "playlist-123:1234567890",
      "storageFreeMb": 1024,
      "wifiStrength": 75,
      "errorCodes": ["ERR001", "ERR002"]
    }
  }
  ```
- Response:
  ```json
  {
    "ok": true,
    "message": "Heartbeat recorded"
  }
  ```

#### Playlist Fetch

**GET `/api/devices/:deviceId/playlist`**
- Get playlist for device
- Response:
  ```json
  {
    "ok": true,
    "playlist": {
      "id": "playlist-123",
      "name": "Menu Board",
      "version": "playlist-123:1234567890",
      "items": [
        {
          "id": "item-1",
          "type": "image",
          "url": "https://...",
          "duration": 8,
          "order": 0
        }
      ]
    }
  }
  ```

#### Remote Control (Dashboard/Admin)

**POST `/api/devices/:deviceId/commands`** (requires auth)
- Send remote command to device
- Request body:
  ```json
  {
    "type": "reload_playlist",  // or "restart" or "custom"
    "payload": {}  // optional
  }
  ```
- Response:
  ```json
  {
    "ok": true,
    "sent": true,
    "message": "Command sent to device"
  }
  ```

**POST `/api/devices/:deviceId/playlist/update`** (requires auth)
- Attach playlist to device and notify via WebSocket
- Request body:
  ```json
  {
    "playlistId": "playlist-123"
  }
  ```
- Response:
  ```json
  {
    "ok": true,
    "sent": true,
    "message": "Playlist updated and notification sent"
  }
  ```

**GET `/api/devices/:deviceId/status`** (requires auth)
- Get device status
- Response:
  ```json
  {
    "ok": true,
    "device": {
      "id": "device-123",
      "status": "online",
      "isConnected": true,
      "lastSeenAt": "2024-01-01T00:00:00Z",
      "playlist": {
        "playlistId": "playlist-123",
        "version": "playlist-123:1234567890",
        "status": "ready"
      },
      "snapshot": {
        "playlistVersion": "playlist-123:1234567890",
        "storageFreeMb": 1024,
        "wifiStrength": 75
      }
    }
  }
  ```

## Integration Points

### Existing Playlist System

The DeviceService integrates with the existing `Playlist` model:
- `DeviceService.getPlaylistForDevice()` fetches from `Playlist` table
- Supports both `MEDIA` and `SIGNAGE` playlist types
- Formats playlist items for device consumption

### Orchestrator Integration

When playlists are updated or published:
1. Call `DeviceService.attachPlaylistToDevice({ deviceId, playlistId })`
2. Call `DeviceWebSocketHub.sendToDevice(deviceId, { type: 'playlist_update' })`

### Device Engine Integration

The DeviceService can be used by existing Device Engine tools:
- `device.push-playlist` can use `DeviceService.attachPlaylistToDevice()`
- `device.heartbeat` can use `DeviceService.recordHeartbeat()`

## Configuration

### Environment Variables

- `STREAM_BASE_URL` - WebSocket base URL (default: derived from `PUBLIC_API_BASE`)
- `PUBLIC_API_BASE` - API base URL (default: `localhost:3001`)
- `HTTPS_ENABLED` - Enable HTTPS/WSS (default: false)
- `NODE_ENV` - Environment (affects protocol: `ws` vs `wss`)

### Stream Base URL

The `streamBaseUrl` returned to devices is constructed as:
- Development: `ws://localhost:3001`
- Production (HTTPS enabled): `wss://{host}`
- Production (HTTP): `ws://{host}`

## Android DeviceAgent Integration

The Android DeviceAgent should:

1. **Register/Pair**: Call `POST /api/devices/register` with pairing code
2. **Get Playlist**: Call `GET /api/devices/:deviceId/playlist`
3. **Connect WebSocket**: Connect to `{streamBaseUrl}/api/devices/{deviceId}/realtime`
4. **Send Heartbeat**: Call `POST /api/devices/:deviceId/heartbeat` periodically
5. **Handle Messages**: Listen for `playlist_update` and `command` messages

## Dashboard/Admin Usage

The dashboard can:

1. **Attach Playlists**: Call `POST /api/devices/:deviceId/playlist/update`
2. **Send Commands**: Call `POST /api/devices/:deviceId/commands`
3. **Monitor Status**: Call `GET /api/devices/:deviceId/status`
4. **List Devices**: Use existing `GET /api/device/list` endpoint

## TODO / Future Enhancements

1. **Authentication/Authorization**: Add proper auth for remote control APIs
2. **DeviceCommand Table**: Store commands in database for auditing
3. **Analytics Integration**: Hook into analytics/log event pipeline
4. **Extended Commands**: Add `showMessage`, `debugOverlay`, `captureScreenshot`
5. **Device Groups**: Support broadcasting to device groups
6. **Command Queue**: Queue commands for offline devices
7. **Health Monitoring**: Automatic offline detection and alerts

## Error Handling

All endpoints return JSON responses:
- Success: `{ ok: true, ... }`
- Error: `{ ok: false, error: "message" }`

WebSocket errors are logged and connections are cleaned up automatically.

## Logging

All operations are logged with:
- `[DeviceService]` prefix for service operations
- `[DeviceAgent]` prefix for API endpoints
- `[DeviceWebSocketHub]` prefix for WebSocket operations

Logs include relevant context (deviceId, operation type, etc.) for debugging.


