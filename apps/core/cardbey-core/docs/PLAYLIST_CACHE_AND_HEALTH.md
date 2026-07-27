# Playlist Caching, Temp Cleanup, and Media Health API

## 1. Playlist Fetch Caching

### Overview
Server-side caching for playlist endpoints to reduce database load and response variance.

### Implementation

**File: `src/lib/playlistCache.js`**
- Simple in-memory Map-based cache
- TTL configurable via `PLAYLIST_CACHE_TTL_MS` env var (default: 3000ms)
- Cache disabled if TTL = 0

**Functions:**
- `getCachedPlaylist(screenId, options)` - Get cached data
- `setCachedPlaylist(screenId, options, data)` - Store in cache
- `invalidatePlaylist(screenId)` - Clear cache for a screen
- `getCacheStats()` - Debug stats

**Cache Key Format:**
```
${screenId}:${full ? "full" : "basic"}
```

**Integrated Endpoints:**
- `GET /api/screens/:id/playlist` - Basic playlist (cached)
- `GET /api/screens/:id/playlist/full` - Full playlist (cached)
- `GET /api/player/config` - Player config (cached if screenId provided)

**Logging:**
- `[DEBUG] [PLAYLIST] Served playlist from cache` - When cache hit

### Configuration

**Environment Variable:**
```bash
PLAYLIST_CACHE_TTL_MS=3000  # 3 seconds (default)
PLAYLIST_CACHE_TTL_MS=0     # Disable caching
```

### Example Flow

```
Request 1: GET /api/screens/abc123/playlist/full
  → Cache miss → Build playlist → Store in cache → Return

Request 2: GET /api/screens/abc123/playlist/full (within 3s)
  → Cache hit → Return immediately

Request 3: GET /api/screens/abc123/playlist/full (after 3s)
  → Cache expired → Build playlist → Store in cache → Return
```

## 2. Auto-Clean Local Temp Files

### Overview
Automatic cleanup of temporary files created during video optimization to prevent `/tmp` from filling up.

### Implementation

**File: `src/lib/tempFiles.js`**
- Helper utilities for temp file management
- Uses `os.tmpdir()` for system temp directory
- Recognizable prefix: `cardbey-`

**Functions:**
- `createTempPath(prefix, extension)` - Create temp file path
- `safeUnlink(filePath, component)` - Safely delete temp file
- `cleanupTempFiles(filePaths, component)` - Clean up multiple files

**Updated Files:**
- `src/lib/s3Client.js` - Uses `createTempPath()` for S3 downloads
- `src/services/videoOptimizer.js` - Uses temp helpers, ensures cleanup in finally blocks
- `src/routes/upload.js` - Uses temp helpers for metadata extraction

**Cleanup Strategy:**
- All temp files cleaned in `finally` blocks
- Ignores `ENOENT` (file not found) errors
- Logs other errors as warnings

**Logging:**
- `[DEBUG] [OPTIMIZER] Temp file deleted` - Successful cleanup
- `[WARN] [OPTIMIZER] Failed to delete temp file` - Cleanup failure

### Temp File Patterns

**S3 Downloads:**
- Prefix: `cardbey-s3-`
- Example: `/tmp/cardbey-s3-1763947327269-abc123.mp4`

**Video Optimization:**
- Input: `cardbey-input-`
- Output: `cardbey-optimized-`
- Example: `/tmp/cardbey-optimized-1763947327269-xyz789.mp4`

**Upload Metadata:**
- Prefix: `cardbey-upload-`
- Example: `/tmp/cardbey-upload-1763947327269-video.mp4`

## 3. Media Health Check API

### Overview
API endpoint to check media and playlist consistency, surface problems.

### Endpoint

**GET /api/admin/media/health**

**Authentication:**
- Requires `x-internal-secret` header matching `INTERNAL_API_SECRET`

**Query Parameters:**
- `checkS3=1` - Also check S3 object existence (optional, checks up to 20 objects)

### Response Format

```json
{
  "ok": true,
  "summary": {
    "totalAssets": 123,
    "assetsWithoutUrl": 2,
    "assetsWithoutStorageKey": 5,
    "assetsInPlaylistsCount": 100,
    "orphanAssetsCount": 10,
    "brokenPlaylistItemsCount": 1,
    "missingS3ObjectsCount": 3  // Only if checkS3=1
  },
  "samples": {
    "assetsWithoutUrl": [
      {
        "assetId": "abc123",
        "kind": "VIDEO",
        "createdAt": "2025-11-24T10:00:00.000Z"
      }
    ],
    "assetsWithoutStorageKey": [
      {
        "assetId": "def456",
        "url": "https://...",
        "kind": "IMAGE",
        "createdAt": "2025-11-24T10:00:00.000Z"
      }
    ],
    "orphanAssets": [
      {
        "assetId": "ghi789",
        "url": "https://...",
        "storageKey": "media/123.mp4",
        "kind": "VIDEO",
        "createdAt": "2025-11-24T10:00:00.000Z"
      }
    ],
    "brokenPlaylistItems": [
      {
        "playlistItemId": "jkl012",
        "playlistId": "playlist123",
        "playlistName": "My Playlist",
        "mediaId": "missing-asset-id"
      }
    ],
    "missingS3Objects": [  // Only if checkS3=1
      {
        "assetId": "mno345",
        "storageKey": "media/missing.mp4",
        "url": "https://..."
      }
    ]
  },
  "durationMs": 250
}
```

### Health Checks

1. **Assets Without URL** - Media records missing `url` field
2. **Assets Without Storage Key** - Media records missing `storageKey` field
3. **Orphan Assets** - Assets not referenced in any playlist
4. **Broken Playlist Items** - Playlist items pointing to non-existent media
5. **Missing S3 Objects** (optional) - S3 objects that don't exist (HEAD check)

### Logging

```
[INFO] [HEALTH] Media health check run {
  "totalAssets": 123,
  "orphanAssetsCount": 10,
  "checkS3": true,
  "durationMs": 250
}
```

### Usage

```bash
# Basic health check
curl -H "x-internal-secret: <INTERNAL_API_SECRET>" \
  https://cardbey-core.onrender.com/api/admin/media/health

# With S3 check
curl -H "x-internal-secret: <INTERNAL_API_SECRET>" \
  "https://cardbey-core.onrender.com/api/admin/media/health?checkS3=1"
```

## Files Created

1. `src/lib/playlistCache.js` - Playlist caching utility
2. `src/lib/tempFiles.js` - Temp file management helpers
3. `src/routes/mediaHealth.js` - Media health check endpoint

## Files Modified

1. `src/lib/s3Client.js` - Uses `createTempPath()` for downloads
2. `src/services/videoOptimizer.js` - Uses temp helpers, ensures cleanup
3. `src/routes/upload.js` - Uses temp helpers for metadata extraction
4. `src/routes/screens.js` - Integrated playlist caching
5. `src/routes/player.js` - Integrated playlist caching
6. `src/server.js` - Mounted media health routes

## Benefits

1. **Reduced Database Load** - Cached playlists reduce DB queries
2. **Faster Responses** - Cache hits return immediately
3. **Temp File Management** - Automatic cleanup prevents disk fill
4. **Health Monitoring** - Easy to spot media/playlist issues
5. **S3 Verification** - Optional S3 checks for object existence

## Configuration

**Environment Variables:**
```bash
PLAYLIST_CACHE_TTL_MS=3000        # Cache TTL in milliseconds
INTERNAL_API_SECRET=<secret>      # Required for health check
```


