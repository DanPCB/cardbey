# Playlist Validation Fix

## Issue

When trying to create a playlist from Content Studio designs, the frontend receives:

```
Error: 400 Bad Request
{
  "message": "Validation failed",
  "issues": [
    {
      "path": "items.0.mediaId",
      "message": "Required",
      "expected": "string"
    }
  ]
}
```

## Root Cause

The frontend (`PublishToPlaylistModal`) is trying to create playlist items without `mediaId`. Playlists require **Media records** (uploaded video/image files), not **Content records** (canvas designs).

### Data Model Difference

- **Content Model** (`Content`): Stores canvas designs with JSON elements
- **Media Model** (`Media`): Stores uploaded video/image files
- **PlaylistItem**: Requires a `mediaId` (references `Media`, not `Content`)

## Solution

### Backend Changes (Completed)

✅ **Enhanced validation with better error messages:**
- Preprocessing to handle null/undefined/empty values
- Clear error messages with hints about what's expected
- Debug logging to see what the frontend actually sends
- Better error response format

**File:** `src/routes/playlists.js`

### Frontend Changes Needed

The frontend needs to convert Content Studio designs to Media before publishing to playlists:

1. **Export/Render Content as Media:**
   ```typescript
   // When publishing Content to playlist:
   // 1. Export the canvas design as an image/video
   const exportedFile = await exportCanvasAsImage(content); // or video
   
   // 2. Upload it as Media
   const media = await uploadMedia(exportedFile);
   
   // 3. Create playlist with Media ID
   await createPlaylist({
     name: 'My Playlist',
     items: [{
       mediaId: media.id, // ✅ Use Media ID
       durationS: 8,
       orderIndex: 0,
     }],
   });
   ```

2. **Alternative: Support Content-based playlists:**
   - Add new endpoint: `POST /api/playlists/from-content`
   - Accept Content IDs
   - Automatically render and convert to Media
   - Create playlist with generated Media records

## Expected Request Format

```json
{
  "name": "My Playlist",
  "items": [
    {
      "mediaId": "cmie9c3m40000jvdkydn4fz4f",  // ✅ Required: Media ID (not Content ID)
      "durationS": 8,
      "orderIndex": 0,
      "fit": "cover",
      "muted": false,
      "loop": false,
      "displayOrientation": "AUTO"  // Optional
    }
  ]
}
```

## Current Validation

The backend now:
- ✅ Logs request details when validation fails
- ✅ Provides hints about missing `mediaId`
- ✅ Shows what fields were actually received
- ✅ Validates that all `mediaId` values exist in the database

## Testing

To test the fix:

1. **Valid Request:**
   ```bash
   curl -X POST http://localhost:3001/api/playlists \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer dev-admin-token" \
     -d '{
       "name": "Test Playlist",
       "items": [{
         "mediaId": "existing-media-id",
         "durationS": 8,
         "orderIndex": 0
       }]
     }'
   ```

2. **Invalid Request (missing mediaId):**
   ```bash
   curl -X POST http://localhost:3001/api/playlists \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer dev-admin-token" \
     -d '{
       "name": "Test Playlist",
       "items": [{
         "durationS": 8,
         "orderIndex": 0
       }]
     }'
   ```
   
   Should return a clear error with hint about `mediaId` being required.

## Next Steps

1. **Frontend:** Update `PublishToPlaylistModal` to:
   - Export Content designs as images/videos
   - Upload as Media first
   - Then create playlist with Media IDs

2. **Optional:** Add `POST /api/playlists/from-content` endpoint that handles the conversion automatically

## Related Files

- `src/routes/playlists.js` - Playlist creation endpoint
- `prisma/schema.prisma` - Data models (Playlist, PlaylistItem, Media, Content)
- Frontend: `PublishToPlaylistModal.tsx` (needs update)



