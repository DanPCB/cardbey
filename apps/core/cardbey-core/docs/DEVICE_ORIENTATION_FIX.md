# Device Orientation Fix - Device Engine V2

## Problem
The "Orientation" setting on the Devices page (Dashboard → TV card → Orientation: Horizontal / Vertical) successfully rotates the PREVIEW in the dashboard, but DOES NOT change the orientation of the real Device Engine V2 (Android TV / tablet client).

## Root Cause
1. **Device model didn't have orientation field** - Only Screen model had it
2. **Device V2 endpoints didn't include orientation** - Playlist and heartbeat responses were missing orientation
3. **Device update endpoint didn't persist orientation** - Orientation updates weren't being saved to Device model

## Solution

### 1. Added Orientation to Device Model (`prisma/schema.prisma`)

```prisma
model Device {
  // ... existing fields ...
  orientation  String?  @default("horizontal") // "horizontal" | "vertical" - Display orientation for Device V2
  // ... rest of fields ...
}
```

**Migration:** `20251203234730_add_device_orientation`

### 2. Updated Device Update Endpoint (`src/routes/deviceEngine.js`)

**Endpoint:** `POST /api/device/update`

**Changes:**
- Now accepts `orientation` in request body
- Validates orientation value (`"horizontal"` or `"vertical"`)
- Saves orientation directly to Device model
- Logs orientation updates:
  ```javascript
  console.log('[Device] Updating orientation', {
    deviceId: deviceId,
    orientation: orientation,
  });
  ```

**Request:**
```json
{
  "deviceId": "device123",
  "orientation": "vertical"
}
```

**Response:**
```json
{
  "ok": true,
  "device": {
    "id": "device123",
    "orientation": "vertical",
    // ... other fields
  }
}
```

### 3. Updated Playlist Endpoint (`GET /api/device/:deviceId/playlist/full`)

**Changes:**
- Fetches `orientation` from Device model
- Includes `orientation` in response
- Falls back to Screen orientation if Device orientation not set (backward compatibility)
- Added logging:
  ```javascript
  console.log('[Device Playlist] Sending playlist to device', {
    deviceId: device.id,
    orientation: orientation,
    itemCount: items.length,
  });
  ```

**Response:**
```json
{
  "ok": true,
  "deviceId": "device123",
  "screenId": "screen456",
  "orientation": "vertical",
  "state": "ready",
  "playlist": {
    "id": "playlist789",
    "name": "My Playlist",
    "version": 1,
    "items": [...]
  }
}
```

### 4. Updated Heartbeat Endpoint (`POST /api/device/heartbeat`)

**Changes:**
- Fetches `orientation` from Device when querying device
- Includes `orientation` in heartbeat response
- Sets default orientation (`"horizontal"`) for new devices

**Response:**
```json
{
  "ok": true,
  "deviceId": "device123",
  "status": "online",
  "pairingStatus": "PAIRED_PLAYLIST_ASSIGNED",
  "displayName": "TV Display",
  "orientation": "vertical",
  "tenantId": "...",
  "storeId": "..."
}
```

### 5. Updated Device Status Endpoint (`GET /api/devices/:deviceId/status`)

**Changes:**
- Includes `orientation` in device status response

**Response:**
```json
{
  "ok": true,
  "device": {
    "id": "device123",
    "orientation": "vertical",
    // ... other fields
  }
}
```

### 6. Updated Screen Update Endpoint (`PATCH /api/screens/:id`)

**Changes:**
- Added logging for orientation updates:
  ```javascript
  logger.info('[Device] Updating orientation', {
    deviceId: id, // Screen ID (legacy screens)
    orientation: orientation,
  });
  ```

## API Endpoints Summary

### Update Device Orientation
```http
POST /api/device/update
Content-Type: application/json
Authorization: Bearer <token>

{
  "deviceId": "device123",
  "orientation": "vertical"
}
```

### Get Device Playlist (includes orientation)
```http
GET /api/device/:deviceId/playlist/full
```

**Response includes:**
- `orientation`: `"horizontal"` | `"vertical"` (defaults to `"horizontal"`)

### Get Device Status (includes orientation)
```http
POST /api/device/heartbeat
Content-Type: application/json

{
  "deviceId": "device123",
  "status": "online"
}
```

**Response includes:**
- `orientation`: `"horizontal"` | `"vertical"`

## Logging

All orientation updates and responses are logged:

1. **Orientation Update:**
   ```
   [Device] Updating orientation { deviceId: '...', orientation: 'vertical' }
   ```

2. **Playlist Response:**
   ```
   [Device Playlist] Sending playlist to device { deviceId: '...', orientation: 'vertical', itemCount: 5 }
   ```

3. **Status Response:**
   ```
   [Device Status] Sending orientation { deviceId: '...', screenId: '...', orientation: 'vertical' }
   ```

## Migration

To apply the migration:
```bash
npx prisma migrate dev
```

Or in production:
```bash
npx prisma migrate deploy
```

## Testing

### Test Orientation Update
1. Change orientation in Dashboard (Devices → TV card → Orientation dropdown)
2. Check backend logs for:
   ```
   [Device] Updating orientation { deviceId: '...', orientation: 'vertical' }
   ```
3. Verify device receives orientation in playlist/status response
4. Check device overlay shows correct orientation

### Test Playlist Endpoint
```bash
curl http://localhost:3001/api/device/:deviceId/playlist/full
```

**Expected response:**
```json
{
  "ok": true,
  "deviceId": "...",
  "orientation": "vertical",
  ...
}
```

### Test Heartbeat Endpoint
```bash
curl -X POST http://localhost:3001/api/device/heartbeat \
  -H "Content-Type: application/json" \
  -d '{"deviceId": "...", "status": "online"}'
```

**Expected response:**
```json
{
  "ok": true,
  "deviceId": "...",
  "orientation": "vertical",
  ...
}
```

## Next Steps (Frontend)

The backend now:
- ✅ Persists orientation to Device model
- ✅ Includes orientation in all Device V2 API responses
- ✅ Logs orientation updates and responses

**Frontend (Android TV/Tablet) needs to:**
1. Read `orientation` from API response (playlist/status)
2. Apply CSS rotation to `<video>` element:
   ```css
   video {
     transform: rotate(90deg); /* if orientation === 'vertical' */
   }
   ```
3. Add debug overlay showing current orientation value

## Backward Compatibility

- Existing devices default to `"horizontal"` orientation
- Screen model orientation is kept for legacy screens
- Playlist endpoint falls back to Screen orientation if Device orientation not set

