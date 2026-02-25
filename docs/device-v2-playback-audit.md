# DEVICE V2 Playback Flow Audit & Fix

## Current Playback Flow

### 1. Device Mode Detection
- **TV**: Detected via `UiModeManager.currentModeType == Configuration.UI_MODE_TYPE_TELEVISION`
- **Tablet**: All other devices
- Both use the same `PlayerActivity` and `ExoPlayer` code path
- Difference: TV uses ExoPlayer rotation, Tablet uses container rotation

### 2. Playlist Fetching
- **Endpoint**: `GET /api/device/:deviceId/playlist/full`
- **Frequency**: Every 10 seconds via `PlaylistEngine`
- **Response Format**: 
  ```json
  {
    "ok": true,
    "deviceId": "...",
    "state": "ready" | "pending_binding" | "no_binding",
    "playlist": {
      "id": "...",
      "name": "...",
      "version": "...",
      "items": [
        {
          "id": "...",
          "type": "video" | "image",
          "url": "http://...",
          "durationMs": 8000,
          "order": 0
        }
      ]
    }
  }
  ```

### 3. ExoPlayer Initialization
- **Location**: `PlayerActivity.setupPlayer()`
- **Current Setup**:
  - Uses `ExoPlayer.Builder(this).build()`
  - Sets `videoScalingMode = SCALE_TO_FIT_WITH_CROPPING`
  - Uses `MediaItem.fromUri(videoUrl)` directly (no explicit DataSourceFactory)
  - Resize mode: `RESIZE_MODE_ZOOM`

### 4. Playlist Item Advancement
- **Next Item**: `next()` increments index, wraps around, calls `playCurrent()`
- **Video End**: `onPlaybackStateChanged(STATE_ENDED)` triggers `next()`
- **Error Handling**: `onPlayerError()` retries up to 3 times for network errors, then skips to next

### 5. Error Logging
- **Current**: Basic error logging in `onPlayerError()`
- **Missing**: 
  - No structured logging with device ID, asset URL, error codes
  - No tracking of failed items
  - No "All items failed" detection logic
  - Watchdog is too aggressive (30s timeout)

## Identified Issues

### Issue 1: TV "All playlist items failed to play"
**Root Causes**:
1. No explicit `DataSourceFactory` - ExoPlayer may fail silently on some TV devices
2. No proper MediaSource setup for HTTP URLs
3. Watchdog timeout too short (30s) - may trigger before video loads
4. No distinction between temporary buffering and hard failure
5. No tracking of failed items across playlist loop

### Issue 2: Tablet Lag + Not Fullscreen
**Root Causes**:
1. Layout is correct (match_parent) but resize mode might cause issues
2. No hardware acceleration explicitly enabled
3. ExoPlayer buffer configuration not optimized
4. Possible unnecessary player recreation

### Issue 3: Backend URL Construction
**Needs Verification**: Ensure URLs are absolute and reachable

## Fix Plan

1. ✅ Add explicit DataSourceFactory for ExoPlayer
2. ✅ Improve error logging with structured data
3. ✅ Implement proper failed item tracking
4. ✅ Add watchdog with proper timeout (20-30s for buffering, longer for initial load)
5. ✅ Fix tablet fullscreen and performance
6. ✅ Verify backend URL construction
7. ✅ Add comprehensive error recovery

