# Screen Orientation Implementation

## Overview
Added orientation support to the Screen model and exposed it in Device V2 API responses.

## Changes Made

### 1. Database Schema (`prisma/schema.prisma`)
- Added `orientation` field to `Screen` model:
  ```prisma
  orientation String @default("horizontal") // "horizontal" | "vertical"
  ```
- Default value: `"horizontal"`
- Migration created: `20251203120403_add_screen_orientation`

### 2. Screen Update Endpoint (`src/routes/screens.js`)
- Updated `PATCH /api/screens/:id` to accept `orientation` field
- Validation: Only accepts `"horizontal"` or `"vertical"`
- Broadcasts orientation in `screen.updated` SSE event

**Request:**
```json
{
  "name": "Screen Name",
  "location": "Location",
  "orientation": "vertical"
}
```

### 3. Device V2 Playlist Endpoint (`src/routes/deviceEngine.js`)
- Updated `GET /api/device/:deviceId/playlist/full` to include screen orientation
- Finds associated Screen by matching device name/location to screen name/location
- Includes `screenId` and `orientation` in response

**Response:**
```json
{
  "ok": true,
  "deviceId": "device123",
  "screenId": "screen456",
  "orientation": "horizontal",
  "state": "ready",
  "message": "Playlist ready",
  "playlist": {
    "id": "playlist789",
    "name": "My Playlist",
    "version": 1,
    "items": [...]
  }
}
```

**Logic:**
1. Attempts to find Screen by matching:
   - Device name → Screen name
   - Device location → Screen location
2. If Screen found:
   - Sets `screenId` to Screen ID
   - Sets `orientation` to Screen's orientation (normalized to `"horizontal"` or `"vertical"`)
3. If no Screen found:
   - `screenId` is `null`
   - `orientation` defaults to `"horizontal"`

### 4. Logging
Added comprehensive logging for orientation:
- **Device Status Log:**
  ```javascript
  console.log('[Device Status] Sending orientation', {
    deviceId,
    screenId,
    orientation,
  });
  ```
- **Playlist Response Log:**
  Includes `screenId` and `orientation` in playlist response details

## API Endpoints

### Update Screen Orientation
```http
PATCH /api/screens/:id
Content-Type: application/json

{
  "orientation": "vertical"
}
```

### Get Device Playlist (with orientation)
```http
GET /api/device/:deviceId/playlist/full
```

**Response includes:**
- `screenId`: Associated screen ID (if found)
- `orientation`: `"horizontal"` | `"vertical"` (defaults to `"horizontal"`)

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

### Test Screen Orientation Update
```bash
curl -X PATCH http://localhost:3001/api/screens/:screenId \
  -H "Content-Type: application/json" \
  -d '{"orientation": "vertical"}'
```

### Test Device Playlist (check orientation)
```bash
curl http://localhost:3001/api/device/:deviceId/playlist/full
```

**Expected response:**
```json
{
  "ok": true,
  "deviceId": "...",
  "screenId": "...",
  "orientation": "vertical",
  ...
}
```

## Notes

- **Default Orientation:** All screens default to `"horizontal"` if not specified
- **Screen Matching:** Currently matches by name/location (best effort). For more reliable matching, consider adding a `screenId` field to the Device model in the future
- **Backward Compatibility:** Existing screens will have `orientation: "horizontal"` after migration
- **Normalization:** Orientation is always normalized to `"horizontal"` or `"vertical"` (case-insensitive matching)

## Future Improvements

1. **Direct Device-Screen Relationship:**
   - Add `screenId` field to Device model for explicit linking
   - More reliable than name/location matching

2. **Orientation Enum:**
   - Consider using Prisma enum instead of string:
     ```prisma
     enum ScreenOrientation {
       HORIZONTAL
       VERTICAL
     }
     ```

3. **Screen Creation:**
   - Update screen creation endpoints to accept orientation during creation

