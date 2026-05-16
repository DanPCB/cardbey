# Display Orientation Feature

This document describes the display orientation feature that allows users to explicitly choose how videos are displayed (horizontal/vertical) in the Android TV/Tablet player.

## Overview

The display orientation feature adds a user-facing option to control video display direction for each playlist item. The Android player will respect this setting and override auto-detection when explicitly set.

## Database Changes

### New Enum: `DisplayOrientation`

```prisma
enum DisplayOrientation {
  AUTO       // Use auto-detection (default, maintains current behavior)
  LANDSCAPE  // Force horizontal display
  PORTRAIT   // Force vertical display
}
```

### Updated Model: `PlaylistItem`

Added field:
```prisma
displayOrientation DisplayOrientation @default(AUTO)
```

**Migration Status:** ✅ Applied to database

## API Changes

### Create/Update Playlist Endpoints

#### POST `/api/playlists`
#### PATCH `/api/playlists/:id`

**Request Body:**
```json
{
  "name": "My Playlist",
  "items": [
    {
      "mediaId": "media123",
      "orderIndex": 0,
      "durationS": 10,
      "displayOrientation": "LANDSCAPE",  // NEW: Optional field
      // ... other fields
    }
  ]
}
```

**Validation:**
- `displayOrientation` is optional (defaults to `AUTO` if not provided)
- Accepts: `"AUTO"`, `"LANDSCAPE"`, `"PORTRAIT"` (case-insensitive)
- Normalized to uppercase for storage

**Backwards Compatibility:**
- ✅ Existing playlists continue to work (existing items get `AUTO` by default)
- ✅ Clients that don't send `displayOrientation` get default `AUTO` behavior
- ✅ No breaking changes to existing API responses

### Playlist Full Endpoint

#### GET `/api/screens/:id/playlist/full`

**Response:**
```json
{
  "ok": true,
  "screenId": "screen123",
  "playlistId": "playlist456",
  "items": [
    {
      "type": "video",
      "url": "https://...",
      "durationS": 10,
      "muted": true,
      "loop": false,
      "fit": "cover",
      "displayOrientation": "LANDSCAPE",  // NEW: Included in response
      "status": "OK"
    }
  ]
}
```

**Response Format:**
- `displayOrientation` is included as a string: `"AUTO"`, `"LANDSCAPE"`, or `"PORTRAIT"`
- Always present (defaults to `"AUTO"` if not explicitly set)

## Usage Examples

### Create Playlist with Display Orientation

```javascript
// POST /api/playlists
{
  "name": "My Playlist",
  "items": [
    {
      "mediaId": "video1",
      "orderIndex": 0,
      "durationS": 10,
      "displayOrientation": "PORTRAIT"  // Force vertical
    },
    {
      "mediaId": "video2",
      "orderIndex": 1,
      "durationS": 8,
      "displayOrientation": "LANDSCAPE"  // Force horizontal
    },
    {
      "mediaId": "video3",
      "orderIndex": 2,
      "durationS": 12
      // displayOrientation defaults to "AUTO"
    }
  ]
}
```

### Update Playlist Item Display Orientation

```javascript
// PATCH /api/playlists/:id
{
  "items": [
    {
      "mediaId": "video1",
      "displayOrientation": "PORTRAIT",  // Change to vertical
      // ... other fields
    }
  ]
}
```

## Android Player Integration

The Android player should:

1. **Read `displayOrientation`** from the playlist/full response
2. **Override auto-detection** when `displayOrientation` is not `"AUTO"`
3. **Use auto-detection** when `displayOrientation` is `"AUTO"` (default behavior)

### Example Android Logic

```kotlin
fun applyDisplayOrientation(item: PlaylistItem, videoView: VideoView) {
    when (item.displayOrientation) {
        "LANDSCAPE" -> {
            // Force horizontal orientation
            videoView.setRotation(0f)
            // Adjust video surface to landscape
        }
        "PORTRAIT" -> {
            // Force vertical orientation
            videoView.setRotation(90f)
            // Adjust video surface to portrait
        }
        "AUTO", null -> {
            // Use existing auto-detection logic
            // (from onVideoSizeChanged callback)
        }
    }
}
```

## Migration Notes

### Existing Data
- ✅ All existing `PlaylistItem` records automatically get `displayOrientation = AUTO`
- ✅ No data migration needed - default value handles existing items

### Frontend Dashboard
- Update playlist editor UI to include orientation selector per video item
- Options: "Auto", "Landscape", "Portrait"
- Store selection as `"AUTO"`, `"LANDSCAPE"`, or `"PORTRAIT"` when saving

### Android App
- Update playlist response model to include `displayOrientation: String?`
- Implement orientation logic based on the field value
- Maintain backwards compatibility (handle missing field as `AUTO`)

## Testing

### API Tests

1. **Create playlist with orientation:**
   ```bash
   curl -X POST http://localhost:3001/api/playlists \
     -H "Content-Type: application/json" \
     -d '{
       "name": "Test",
       "items": [{
         "mediaId": "media1",
         "orderIndex": 0,
         "displayOrientation": "PORTRAIT"
       }]
     }'
   ```

2. **Verify in playlist/full response:**
   ```bash
   curl http://localhost:3001/api/screens/:screenId/playlist/full
   ```
   Should include `displayOrientation: "PORTRAIT"` in items

3. **Test backwards compatibility:**
   - Create playlist without `displayOrientation` field
   - Verify it defaults to `"AUTO"` in response

## Files Modified

1. **`prisma/schema.prisma`**
   - Added `DisplayOrientation` enum
   - Added `displayOrientation` field to `PlaylistItem` model

2. **`src/routes/playlists.js`**
   - Updated Zod validation schema to accept `displayOrientation`
   - Updated create/update endpoints to store `displayOrientation`

3. **`src/routes/screens.js`**
   - Updated `/api/screens/:id/playlist/full` endpoint to include `displayOrientation` in response

## Summary

✅ Database schema updated  
✅ API endpoints accept `displayOrientation` field  
✅ Playlist/full endpoint returns `displayOrientation`  
✅ Backwards compatible (defaults to `AUTO`)  
✅ Ready for frontend dashboard integration  
✅ Ready for Android app integration  

The feature is now ready for use. Dashboard can send `displayOrientation` when creating/editing playlists, and Android app can read it from the playlist/full response.


