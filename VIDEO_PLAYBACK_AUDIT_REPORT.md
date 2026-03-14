# Video Playback Audit Report
**Date:** Current  
**Purpose:** Identify why video player on device cannot play videos  
**Scope:** Complete codebase audit across all folders

---

## Executive Summary

After auditing the entire codebase, I've identified **multiple potential root causes** for video playback failures on devices. The issues span across **playlist delivery**, **URL resolution**, **authentication**, **caching**, and **error handling**.

---

## Critical Issues Found

### 1. ⚠️ **CRITICAL: Playlist Endpoint Mismatch**

**Location:** 
- Android: `apps/dashboard/cardbey-marketing-dashboard/app/src/main/java/com/cardbey/slide/engine/PlaylistEngine.kt` (line 73)
- Backend: `apps/core/cardbey-core/src/routes/deviceEngine.js` (line 1750)

**Problem:**
- **Android app** calls: `/api/devices/:deviceId/playlist` (plural "devices")
- **Backend endpoint** exists at: `/api/device/:deviceId/playlist/full` (singular "device")
- **Mismatch** causes Android to get wrong playlist format or 404 errors

**Evidence:**
```kotlin
// PlaylistEngine.kt line 73
val url = "$baseUrl/api/devices/$deviceId/playlist"  // ❌ WRONG ENDPOINT
```

```javascript
// deviceEngine.js line 1750
router.get('/:deviceId/playlist/full', async (req, res) => {  // ✅ CORRECT ENDPOINT
```

**Impact:** Android devices may receive empty playlists or wrong format, causing videos not to play.

---

### 2. ⚠️ **CRITICAL: Video URL Authentication Required**

**Location:**
- `apps/dashboard/cardbey-marketing-dashboard/app/src/main/java/com/cardbey/slide/cache/OfflineCacheManager.kt` (line 189)
- `apps/dashboard/cardbey-marketing-dashboard/app/src/main/java/com/cardbey/slide/ui/player/PlayerActivity.kt` (line 299)

**Problem:**
- Android cache manager sends `Authorization: Bearer <token>` header when downloading videos
- **BUT:** Video URLs may be served from `/uploads/` static directory which **doesn't require auth**
- **OR:** Video URLs may require auth but token is `null` or expired
- **OR:** Video URLs are CloudFront URLs that don't accept Bearer tokens

**Evidence:**
```kotlin
// OfflineCacheManager.kt line 189
authToken?.let { header("Authorization", "Bearer $it") }  // May be null!
```

```kotlin
// PlayerActivity.kt line 299
cacheManager.cacheVideo(entry.url, sessionState?.token)  // sessionState?.token may be null
```

**Impact:** 
- Videos fail to download/cache if auth token is missing
- Videos fail to play if URL requires auth but token is invalid
- ExoPlayer gets 401/403 errors when trying to play videos

---

### 3. ⚠️ **HIGH: Video URL Resolution Issues**

**Location:**
- `apps/core/cardbey-core/src/routes/deviceEngine.js` (line 1932)
- `apps/core/cardbey-core/src/utils/publicUrl.js` (line 195)

**Problem:**
- Playlist endpoint resolves relative URLs using `resolvePublicUrl()`
- **BUT:** If `PUBLIC_BASE_URL` env var is not set, URLs may be malformed
- **OR:** URLs may resolve to `http://` instead of `https://` in production
- **OR:** CloudFront URLs may be incorrectly modified

**Evidence:**
```javascript
// deviceEngine.js line 1932
let resolvedUrl = itemUrl;
if (!isCloudFrontUrl(itemUrl)) {
  resolvedUrl = resolvePublicUrl(itemUrl, req);  // May return malformed URL
}
```

```javascript
// publicUrl.js line 195
export function resolvePublicUrl(url, req = null) {
  // If PUBLIC_BASE_URL not set, uses req.protocol (may be http://)
  // If req is null, returns path as-is (broken URL)
}
```

**Impact:**
- Videos get 404 errors if URL is malformed
- Videos fail to load if URL uses wrong protocol (http vs https)
- ExoPlayer cannot resolve video URLs

---

### 4. ⚠️ **HIGH: ExoPlayer Error Handling Too Aggressive**

**Location:**
- `apps/dashboard/cardbey-marketing-dashboard/app/src/main/java/com/cardbey/slide/ui/player/PlayerActivity.kt` (line 183)

**Problem:**
- ExoPlayer error listener **immediately skips to next item** on ANY error
- **No retry logic** for transient network errors
- **No logging** of specific error codes
- **No fallback** to original URL if cached URL fails

**Evidence:**
```kotlin
// PlayerActivity.kt line 183
override fun onPlayerError(error: com.google.android.exoplayer2.PlaybackException) {
    next()  // ❌ Immediately skips - no retry, no logging, no fallback
}
```

**Impact:**
- Transient network errors cause videos to be skipped
- No way to diagnose what error occurred
- Cached video failures don't fallback to network URL

---

### 5. ⚠️ **MEDIUM: Playlist Format Mismatch**

**Location:**
- `apps/dashboard/cardbey-marketing-dashboard/app/src/main/java/com/cardbey/slide/engine/PlaylistEngine.kt` (line 98-129)
- `apps/core/cardbey-core/src/routes/deviceEngine.js` (line 1949-1958)

**Problem:**
- Backend returns: `{ ok: true, playlist: { id, name, items: [...] } }`
- Android expects: `{ items: [...] }` (direct array or wrapped)
- Android parsing tries multiple formats but may fail silently

**Evidence:**
```kotlin
// PlaylistEngine.kt line 98-129
val json = org.json.JSONObject(body)
if (json.optBoolean("ok", false)) {
    val playlistObj = json.optJSONObject("playlist")
    if (playlistObj != null) {
        val itemsArray = playlistObj.optJSONArray("items")
        // Complex parsing with fallbacks - may fail silently
    }
}
```

**Impact:**
- Playlist may be parsed incorrectly
- Videos may not be extracted from playlist
- Empty playlist causes "waiting for content" screen

---

### 6. ⚠️ **MEDIUM: Video Caching Race Condition**

**Location:**
- `apps/dashboard/cardbey-marketing-dashboard/app/src/main/java/com/cardbey/slide/ui/player/PlayerActivity.kt` (line 271-301)

**Problem:**
- `playVideo()` uses `cacheManager.getVideoUrl()` which returns **original URL if not cached**
- **THEN** starts async caching in background
- **BUT:** If video URL requires auth and token is missing, caching fails silently
- **AND:** ExoPlayer tries to play original URL **before** caching completes

**Evidence:**
```kotlin
// PlayerActivity.kt line 280
val videoUrl = cacheManager.getVideoUrl(entry.url)  // Returns original URL if not cached

player.setMediaItem(MediaItem.fromUri(videoUrl))  // Plays immediately
player.prepare()
player.playWhenReady = true

// THEN starts caching (too late!)
if (!cacheManager.isVideoCached(entry.url)) {
    lifecycleScope.launch {
        cacheManager.cacheVideo(entry.url, sessionState?.token)  // May fail silently
    }
}
```

**Impact:**
- Videos play from network even if they should be cached
- Network failures cause immediate playback errors
- No retry logic if network URL fails

---

### 7. ⚠️ **MEDIUM: Missing Video Content-Type Headers**

**Location:**
- `apps/core/cardbey-core/src/server.js` (line 332-344)

**Problem:**
- Static file server sets Content-Type for videos **only if file extension matches**
- **BUT:** If video URL has query params or no extension, Content-Type may be missing
- **OR:** If video is served from different route, headers may not be set

**Evidence:**
```javascript
// server.js line 332-344
if (ext === '.mp4') {
    res.setHeader('Content-Type', 'video/mp4');
} else if (ext === '.webm') {
    res.setHeader('Content-Type', 'video/webm');
}
// ❌ What if URL is /uploads/video?id=123 (no extension)?
```

**Impact:**
- ExoPlayer may not recognize video format
- Browser/player may reject video without proper Content-Type
- Videos fail to play with "format not supported" errors

---

### 8. ⚠️ **LOW: CORS Headers for Video Streaming**

**Location:**
- `apps/core/cardbey-core/src/server.js` (line 327-329)

**Problem:**
- CORS headers are set for `/uploads/` static files
- **BUT:** `Access-Control-Allow-Origin: *` may not work with credentials
- **OR:** Range request headers may not be properly handled for video streaming

**Evidence:**
```javascript
// server.js line 327-329
res.setHeader('Access-Control-Allow-Origin', '*');
res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
res.setHeader('Access-Control-Allow-Headers', 'Range');
```

**Impact:**
- Cross-origin video requests may fail
- Range requests (for video seeking) may be blocked
- Videos may not stream properly

---

## Root Cause Analysis

### Primary Root Causes (Most Likely):

1. **Playlist Endpoint Mismatch** (Issue #1)
   - Android calls wrong endpoint → gets wrong format → videos don't play
   - **Fix:** Change Android to call `/api/device/:deviceId/playlist/full`

2. **Missing/Invalid Auth Token** (Issue #2)
   - Videos require auth but token is null/expired → 401/403 errors → videos don't play
   - **Fix:** Ensure token is passed and valid, or make video URLs public

3. **URL Resolution Failure** (Issue #3)
   - URLs are malformed or use wrong protocol → 404 errors → videos don't play
   - **Fix:** Ensure `PUBLIC_BASE_URL` is set and URLs are properly resolved

### Secondary Root Causes:

4. **ExoPlayer Error Handling** (Issue #4)
   - Any error immediately skips video → no retry → videos appear broken
   - **Fix:** Add retry logic and better error logging

5. **Playlist Format Mismatch** (Issue #5)
   - Playlist parsing fails silently → empty playlist → no videos to play
   - **Fix:** Standardize playlist format and add validation

---

## Recommended Fixes (Priority Order)

### Priority 1: Fix Playlist Endpoint (CRITICAL)
**File:** `PlaylistEngine.kt` line 73
**Change:**
```kotlin
// FROM:
val url = "$baseUrl/api/devices/$deviceId/playlist"

// TO:
val url = "$baseUrl/api/device/$deviceId/playlist/full"
```

### Priority 2: Add Auth Token Validation (CRITICAL)
**File:** `PlayerActivity.kt` line 299
**Change:**
```kotlin
// Add validation before caching:
if (sessionState?.token.isNullOrBlank()) {
    Log.w(TAG, "No auth token available - video may fail to load")
    // Optionally: Try to get token from AppConfig or request new one
}
```

### Priority 3: Improve ExoPlayer Error Handling (HIGH)
**File:** `PlayerActivity.kt` line 183
**Change:**
```kotlin
override fun onPlayerError(error: com.google.android.exoplayer2.PlaybackException) {
    Log.e(TAG, "Video playback error: ${error.errorCodeName}", error)
    
    // Retry logic: Try original URL if cached URL failed
    val currentUrl = entry.url
    val cachedUrl = cacheManager.getVideoUrl(entry.url)
    
    if (cachedUrl != currentUrl && cachedUrl.startsWith("file://")) {
        // Cached file failed - try original URL
        Log.d(TAG, "Retrying with original URL: $currentUrl")
        player.setMediaItem(MediaItem.fromUri(currentUrl))
        player.prepare()
        player.playWhenReady = true
        return
    }
    
    // Only skip if retry also fails
    next()
}
```

### Priority 4: Fix URL Resolution (HIGH)
**File:** `publicUrl.js` line 195
**Change:**
```javascript
// Add validation:
if (!url) {
    console.warn('[publicUrl] Empty URL provided');
    return url;
}

// Ensure PUBLIC_BASE_URL is set in production
if (!base && process.env.NODE_ENV === 'production') {
    console.error('[publicUrl] PUBLIC_BASE_URL not set in production!');
}
```

### Priority 5: Add Playlist Format Validation (MEDIUM)
**File:** `PlaylistEngine.kt` line 98
**Change:**
```kotlin
// Add logging for debugging:
Log.d(TAG, "Playlist response format: ${json.keys().asSequence().toList()}")
Log.d(TAG, "Playlist items count: ${itemsArray?.length() ?: 0}")

// Add validation:
if (itemsArray == null || itemsArray.length() == 0) {
    Log.w(TAG, "Playlist has no items - device will show waiting screen")
}
```

---

## Testing Checklist

To verify fixes, test the following scenarios:

- [ ] **Test 1:** Android device receives playlist from correct endpoint
  - Check logs: `[DeviceEngine V2][Playlist]` should show successful fetch
  - Verify playlist has items: `items=${itemsArray.length()}`

- [ ] **Test 2:** Video URLs are accessible without auth
  - Test video URL in browser/curl: Should return 200 OK
  - Check if URL requires auth: Should not require Bearer token

- [ ] **Test 3:** Video URLs are properly formatted
  - Check URL format: Should be absolute HTTPS URL or file:// URL
  - Verify no malformed URLs: Should not have double slashes or missing protocol

- [ ] **Test 4:** ExoPlayer can play videos
  - Check ExoPlayer logs: Should not show `PlaybackException`
  - Verify video plays: Should start playing within 2-3 seconds

- [ ] **Test 5:** Error handling works
  - Test with invalid URL: Should retry or skip gracefully
  - Check logs: Should show error details, not just skip

---

## Files Requiring Investigation

1. **`apps/core/cardbey-core/src/routes/deviceEngine.js`** (line 1750-1990)
   - Playlist endpoint implementation
   - URL resolution logic

2. **`apps/dashboard/cardbey-marketing-dashboard/app/src/main/java/com/cardbey/slide/engine/PlaylistEngine.kt`** (line 69-141)
   - Playlist fetching logic
   - Endpoint URL construction

3. **`apps/dashboard/cardbey-marketing-dashboard/app/src/main/java/com/cardbey/slide/ui/player/PlayerActivity.kt`** (line 271-302)
   - Video playback logic
   - Error handling

4. **`apps/dashboard/cardbey-marketing-dashboard/app/src/main/java/com/cardbey/slide/cache/OfflineCacheManager.kt`** (line 178-241)
   - Video caching logic
   - Auth token handling

5. **`apps/core/cardbey-core/src/utils/publicUrl.js`** (line 195-267)
   - URL resolution logic
   - PUBLIC_BASE_URL handling

6. **`apps/core/cardbey-core/src/server.js`** (line 319-356)
   - Static file serving
   - Content-Type headers

---

## Environment Variables to Check

Ensure these are set correctly:

- `PUBLIC_BASE_URL` - Must be set to full HTTPS URL in production
- `CDN_BASE_URL` - Must be set if using CloudFront
- `JWT_SECRET` - Must be set for auth token validation
- `NODE_ENV` - Should be `production` in production

---

## Next Steps

1. **Immediate:** Fix playlist endpoint mismatch (Issue #1)
2. **Immediate:** Add auth token validation and logging (Issue #2)
3. **High Priority:** Improve ExoPlayer error handling (Issue #4)
4. **High Priority:** Fix URL resolution (Issue #3)
5. **Medium Priority:** Standardize playlist format (Issue #5)
6. **Low Priority:** Improve CORS headers (Issue #8)

---

## Conclusion

The video playback failure is likely caused by a **combination of issues**, with the **playlist endpoint mismatch** and **auth token problems** being the most critical. Fixing these should resolve the majority of playback failures.

**Note:** This audit did not include code refactoring, only identification of issues as requested.

