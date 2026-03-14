# Video Playback Fix - Task Assignments
**Created:** Based on VIDEO_PLAYBACK_AUDIT_REPORT.md  
**Status:** Ready for Implementation  
**Total Tasks:** 15 tasks across 2 repositories

---

## Task Summary by Repository

| Repository | Critical | High | Medium | Low | Total |
|------------|----------|------|--------|-----|-------|
| **cardbey-core** (Backend) | 1 | 2 | 1 | 1 | 5 |
| **cardbey-marketing-dashboard** (Android) | 2 | 2 | 2 | 0 | 6 |
| **Environment/Config** | 1 | 0 | 0 | 0 | 1 |
| **Testing** | 0 | 1 | 1 | 0 | 2 |
| **Documentation** | 0 | 0 | 1 | 0 | 1 |

---

## Repository: `apps/core/cardbey-core` (Backend API)

### 🔴 CRITICAL Priority

#### Task CORE-001: Fix Playlist Endpoint URL Resolution
**Issue:** #3 - URL Resolution Problems  
**File:** `src/utils/publicUrl.js`  
**Lines:** 195-267  
**Assignee:** Backend Team  
**Estimated Time:** 2 hours

**Description:**
Add validation and error handling to `resolvePublicUrl()` function to ensure URLs are properly formatted.

**Acceptance Criteria:**
- [ ] Function validates input URL is not null/empty
- [ ] Function logs warning if `PUBLIC_BASE_URL` is not set in production
- [ ] Function ensures HTTPS protocol in production
- [ ] Function handles CloudFront URLs correctly (doesn't modify them)
- [ ] Function returns proper error messages for invalid inputs

**Implementation Notes:**
```javascript
// Add at start of resolvePublicUrl():
if (!url) {
    console.warn('[publicUrl] Empty URL provided');
    return url;
}

// Add before returning:
if (!base && process.env.NODE_ENV === 'production') {
    console.error('[publicUrl] PUBLIC_BASE_URL not set in production!');
    // Still try to resolve using req if available
}
```

**Testing:**
- [ ] Test with null/empty URL
- [ ] Test with `PUBLIC_BASE_URL` set and unset
- [ ] Test with CloudFront URLs (should not modify)
- [ ] Test with relative paths
- [ ] Test in production environment

---

### 🟠 HIGH Priority

#### Task CORE-002: Improve Content-Type Header Detection
**Issue:** #7 - Missing Video Content-Type Headers  
**File:** `src/server.js`  
**Lines:** 332-344  
**Assignee:** Backend Team  
**Estimated Time:** 3 hours

**Description:**
Enhance static file server to detect Content-Type for videos even when URL has query params or missing extension.

**Acceptance Criteria:**
- [ ] Content-Type is set based on file content, not just extension
- [ ] Handles URLs with query parameters (e.g., `/uploads/video.mp4?id=123`)
- [ ] Falls back to extension-based detection if content detection fails
- [ ] Logs warning when Content-Type cannot be determined

**Implementation Notes:**
```javascript
// Enhance setHeaders function:
setHeaders(res, filePath, stat) {
    // Extract extension from filePath (before query params)
    const cleanPath = filePath.split('?')[0];
    const ext = path.extname(cleanPath).toLowerCase();
    
    // Also check file content if extension missing
    if (!ext && stat && stat.isFile()) {
        // Try to read first bytes to detect MIME type
        // Or use file path from filesystem
    }
    
    // Existing Content-Type logic...
}
```

**Testing:**
- [ ] Test with URLs containing query params
- [ ] Test with URLs without extension
- [ ] Test with all video formats (.mp4, .webm, .mov)
- [ ] Verify Content-Type header in response

---

#### Task CORE-003: Enhance CORS Headers for Video Streaming
**Issue:** #8 - CORS Headers for Video Streaming  
**File:** `src/server.js`  
**Lines:** 327-329  
**Assignee:** Backend Team  
**Estimated Time:** 2 hours

**Description:**
Improve CORS headers for video streaming to properly support Range requests and cross-origin access.

**Acceptance Criteria:**
- [ ] Range requests are properly handled
- [ ] CORS headers work with credentials if needed
- [ ] Preflight OPTIONS requests are handled correctly
- [ ] Headers are set before response is sent

**Implementation Notes:**
```javascript
// Update CORS headers:
res.setHeader('Access-Control-Allow-Origin', '*'); // Or specific origin
res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Range, Content-Type');
res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges');
res.setHeader('Accept-Ranges', 'bytes'); // Critical for video streaming
```

**Testing:**
- [ ] Test Range requests (e.g., `Range: bytes=0-1023`)
- [ ] Test cross-origin video requests
- [ ] Test OPTIONS preflight requests
- [ ] Verify video seeking works in players

---

### 🟡 MEDIUM Priority

#### Task CORE-004: Standardize Playlist Response Format
**Issue:** #5 - Playlist Format Mismatch  
**File:** `src/routes/deviceEngine.js`  
**Lines:** 1949-1958  
**Assignee:** Backend Team  
**Estimated Time:** 4 hours

**Description:**
Ensure playlist endpoint returns consistent format that matches Android app expectations.

**Acceptance Criteria:**
- [ ] Response format is documented
- [ ] Format matches Android parsing expectations
- [ ] Backward compatibility maintained
- [ ] Response includes version field for format detection

**Implementation Notes:**
```javascript
// Ensure consistent format:
{
  ok: true,
  deviceId: string,
  state: 'ready' | 'pending_binding' | 'no_binding',
  message: string,
  playlist: {
    id: string,
    name: string,
    version: number,  // Add version field
    items: [
      {
        id: string,
        type: 'image' | 'video' | 'html',
        url: string,  // Always absolute URL
        durationMs: number,
        order: number
      }
    ]
  } | null
}
```

**Testing:**
- [ ] Verify response format matches Android expectations
- [ ] Test with empty playlist
- [ ] Test with playlist containing videos
- [ ] Test backward compatibility

---

### 🟢 LOW Priority

#### Task CORE-005: Add Playlist Endpoint Logging
**Issue:** #5 - Playlist Format Mismatch (Debugging)  
**File:** `src/routes/deviceEngine.js`  
**Lines:** 1967-1974  
**Assignee:** Backend Team  
**Estimated Time:** 1 hour

**Description:**
Add comprehensive logging to playlist endpoint to help diagnose parsing issues.

**Acceptance Criteria:**
- [ ] Log playlist response format
- [ ] Log item count and types
- [ ] Log URL resolution results
- [ ] Log any parsing errors

**Implementation Notes:**
```javascript
// Add logging:
console.log(`[Device Engine] [${requestId}] Playlist response details:`, {
    deviceId,
    playlistId: playlist.id,
    state: response.state,
    itemCount: items.length,
    itemTypes: items.map(i => i.type),
    hasPlaylist: !!response.playlist,
    bindingStatus: latestBinding.status,
    sampleUrls: items.slice(0, 3).map(i => i.url), // First 3 URLs for debugging
});
```

**Testing:**
- [ ] Verify logs appear in production
- [ ] Verify logs don't expose sensitive data
- [ ] Verify logs help diagnose issues

---

## Repository: `apps/dashboard/cardbey-marketing-dashboard` (Android App)

### 🔴 CRITICAL Priority

#### Task ANDROID-001: Fix Playlist Endpoint URL
**Issue:** #1 - Playlist Endpoint Mismatch  
**File:** `app/src/main/java/com/cardbey/slide/engine/PlaylistEngine.kt`  
**Lines:** 73  
**Assignee:** Android Team  
**Estimated Time:** 30 minutes

**Description:**
Change playlist endpoint from `/api/devices/:deviceId/playlist` to `/api/device/:deviceId/playlist/full`.

**Acceptance Criteria:**
- [ ] Endpoint URL is corrected
- [ ] App successfully fetches playlist from new endpoint
- [ ] Playlist parsing works correctly
- [ ] No regressions in existing functionality

**Implementation Notes:**
```kotlin
// Change line 73:
// FROM:
val url = "$baseUrl/api/devices/$deviceId/playlist"

// TO:
val url = "$baseUrl/api/device/$deviceId/playlist/full"
```

**Testing:**
- [ ] Verify playlist fetch succeeds
- [ ] Verify playlist items are parsed correctly
- [ ] Verify videos appear in playlist
- [ ] Test with empty playlist
- [ ] Test with playlist containing videos

---

#### Task ANDROID-002: Add Auth Token Validation
**Issue:** #2 - Video URL Authentication Issues  
**File:** `app/src/main/java/com/cardbey/slide/ui/player/PlayerActivity.kt`  
**Lines:** 296-301  
**Assignee:** Android Team  
**Estimated Time:** 2 hours

**Description:**
Add validation and logging for auth token before attempting to cache videos.

**Acceptance Criteria:**
- [ ] Token is validated before caching
- [ ] Warning is logged if token is missing
- [ ] Caching gracefully handles missing token
- [ ] Token is refreshed if expired

**Implementation Notes:**
```kotlin
// Add before caching:
if (sessionState?.token.isNullOrBlank()) {
    Log.w(TAG, "No auth token available - video may fail to load")
    Log.w(TAG, "Video URL: ${entry.url}")
    Log.w(TAG, "Session state: ${if (sessionState == null) "null" else "exists"}")
    
    // Optionally: Try to get token from AppConfig or request new one
    // For now, still attempt caching without token (may work for public URLs)
}

// Update cache call:
lifecycleScope.launch {
    try {
        val cached = cacheManager.cacheVideo(entry.url, sessionState?.token)
        if (cached == null) {
            Log.w(TAG, "Video caching failed for: ${entry.url}")
        }
    } catch (e: Exception) {
        Log.e(TAG, "Video caching error", e)
    }
}
```

**Testing:**
- [ ] Test with valid token
- [ ] Test with null token
- [ ] Test with expired token
- [ ] Verify logging appears
- [ ] Verify caching still works for public URLs

---

### 🟠 HIGH Priority

#### Task ANDROID-003: Improve ExoPlayer Error Handling
**Issue:** #4 - ExoPlayer Error Handling Too Aggressive  
**File:** `app/src/main/java/com/cardbey/slide/ui/player/PlayerActivity.kt`  
**Lines:** 183-185  
**Assignee:** Android Team  
**Estimated Time:** 4 hours

**Description:**
Add retry logic, error logging, and fallback to original URL when cached URL fails.

**Acceptance Criteria:**
- [ ] Error codes are logged with details
- [ ] Retry logic attempts original URL if cached URL fails
- [ ] Transient errors are retried before skipping
- [ ] Error details are logged for debugging

**Implementation Notes:**
```kotlin
// Store current entry for retry:
private var currentVideoEntry: PlaylistEntry? = null

// In playVideo():
currentVideoEntry = entry  // Store for retry

// In onPlayerError():
override fun onPlayerError(error: com.google.android.exoplayer2.PlaybackException) {
    val entry = currentVideoEntry ?: return
    
    Log.e(TAG, "Video playback error: ${error.errorCodeName}", error)
    Log.e(TAG, "Error code: ${error.errorCode}")
    Log.e(TAG, "Error message: ${error.message}")
    Log.e(TAG, "Video URL: ${entry.url}")
    
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
    
    // Check if it's a transient error (network-related)
    val isTransientError = error.errorCode == PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED ||
                          error.errorCode == PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT
    
    if (isTransientError) {
        // Retry once after delay
        handler.postDelayed({
            Log.d(TAG, "Retrying after transient error")
            playVideo(entry)
        }, 2000)
        return
    }
    
    // Only skip if retry also fails or non-transient error
    Log.w(TAG, "Skipping to next item after error")
    next()
}
```

**Testing:**
- [ ] Test with invalid cached URL (should retry original)
- [ ] Test with network timeout (should retry)
- [ ] Test with permanent error (should skip)
- [ ] Verify error logs appear
- [ ] Verify retry logic works

---

#### Task ANDROID-004: Fix Video Caching Race Condition
**Issue:** #6 - Video Caching Race Condition  
**File:** `app/src/main/java/com/cardbey/slide/ui/player/PlayerActivity.kt`  
**Lines:** 271-301  
**Assignee:** Android Team  
**Estimated Time:** 3 hours

**Description:**
Ensure videos are cached before playback, or implement proper fallback if caching fails.

**Acceptance Criteria:**
- [ ] Videos are cached before playback when possible
- [ ] Playback doesn't wait indefinitely for caching
- [ ] Fallback to network URL if caching fails
- [ ] Caching errors are logged

**Implementation Notes:**
```kotlin
private fun playVideo(entry: PlaylistEntry) {
    stopImageTimer()
    hideComposeView()

    imageView.isVisible = false
    playerView.isVisible = true
    waitingText.isVisible = false

    // Check if video is already cached
    val isCached = cacheManager.isVideoCached(entry.url)
    val videoUrl = if (isCached) {
        cacheManager.getVideoUrl(entry.url)
    } else {
        // Not cached - use original URL and cache in background
        entry.url
    }
    
    player.setMediaItem(MediaItem.fromUri(videoUrl))
    
    // Set repeat mode
    player.repeatMode = if (playlist.size == 1) {
        Player.REPEAT_MODE_ONE
    } else {
        Player.REPEAT_MODE_OFF
    }
    
    player.prepare()
    player.playWhenReady = true
    
    // Cache in background if not already cached
    if (!isCached) {
        lifecycleScope.launch {
            try {
                val cached = cacheManager.cacheVideo(entry.url, sessionState?.token)
                if (cached != null) {
                    Log.d(TAG, "Video cached successfully: ${entry.url}")
                    // Optionally: Switch to cached URL for next playback
                } else {
                    Log.w(TAG, "Video caching failed: ${entry.url}")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Video caching error", e)
            }
        }
    }
}
```

**Testing:**
- [ ] Test with cached video (should use cached URL)
- [ ] Test with uncached video (should use network URL)
- [ ] Test caching failure (should still play from network)
- [ ] Verify caching happens in background
- [ ] Verify playback doesn't wait for caching

---

### 🟡 MEDIUM Priority

#### Task ANDROID-005: Add Playlist Format Validation
**Issue:** #5 - Playlist Format Mismatch  
**File:** `app/src/main/java/com/cardbey/slide/engine/PlaylistEngine.kt`  
**Lines:** 98-129  
**Assignee:** Android Team  
**Estimated Time:** 2 hours

**Description:**
Add logging and validation to playlist parsing to help diagnose format issues.

**Acceptance Criteria:**
- [ ] Playlist response format is logged
- [ ] Item count is logged
- [ ] Warnings are logged for empty playlists
- [ ] Parsing errors are logged with details

**Implementation Notes:**
```kotlin
// Add logging before parsing:
Log.d(TAG, "Playlist response body length: ${body.length}")
Log.d(TAG, "Playlist response preview: ${body.take(200)}")

// Add logging after parsing:
try {
    val json = org.json.JSONObject(body)
    Log.d(TAG, "Playlist response format: ${json.keys().asSequence().toList()}")
    
    if (json.optBoolean("ok", false)) {
        val playlistObj = json.optJSONObject("playlist")
        if (playlistObj != null) {
            val itemsArray = playlistObj.optJSONArray("items")
            Log.d(TAG, "Playlist items count: ${itemsArray?.length() ?: 0}")
            
            // Add validation:
            if (itemsArray == null || itemsArray.length() == 0) {
                Log.w(TAG, "Playlist has no items - device will show waiting screen")
                Log.w(TAG, "Playlist ID: ${playlistObj.optString("id", "unknown")}")
                Log.w(TAG, "Playlist name: ${playlistObj.optString("name", "unknown")}")
            }
            
            // Log sample items for debugging:
            if (itemsArray != null && itemsArray.length() > 0) {
                val sampleItem = itemsArray.optJSONObject(0)
                Log.d(TAG, "Sample item: ${sampleItem?.toString()?.take(200)}")
            }
            
            // Existing parsing logic...
        } else {
            Log.w(TAG, "Playlist object is null in response")
        }
    } else {
        Log.w(TAG, "Playlist response not ok: ${json.optString("error", "unknown")}")
    }
} catch (e: Exception) {
    Log.e(TAG, "Failed to parse playlist response", e)
    Log.e(TAG, "Response body: ${body.take(500)}")
    throw e
}
```

**Testing:**
- [ ] Verify logs appear for successful parsing
- [ ] Verify warnings appear for empty playlists
- [ ] Verify errors are logged for parsing failures
- [ ] Verify logs help diagnose issues

---

#### Task ANDROID-006: Improve OfflineCacheManager Error Handling
**Issue:** #2 - Video URL Authentication Issues  
**File:** `app/src/main/java/com/cardbey/slide/cache/OfflineCacheManager.kt`  
**Lines:** 178-214  
**Assignee:** Android Team  
**Estimated Time:** 2 hours

**Description:**
Add better error handling and logging to video caching to help diagnose auth and network issues.

**Acceptance Criteria:**
- [ ] HTTP errors are logged with status codes
- [ ] Auth errors are specifically identified
- [ ] Network errors are logged with details
- [ ] Caching failures don't crash the app

**Implementation Notes:**
```kotlin
suspend fun cacheVideo(url: String, authToken: String? = null): File? = withContext(Dispatchers.IO) {
    try {
        val cachedFile = getCachedVideoFile(url)
        if (cachedFile.exists()) {
            Log.d(TAG, "Video already cached: $url")
            return@withContext cachedFile
        }
        
        Log.d(TAG, "Caching video: $url (hasToken: ${authToken != null})")
        
        val request = Request.Builder()
            .url(url)
            .apply {
                authToken?.let { 
                    header("Authorization", "Bearer $it")
                    Log.d(TAG, "Added auth token to request")
                } ?: Log.w(TAG, "No auth token provided for video caching")
            }
            .build()
        
        httpClient.newCall(request).execute().use { response ->
            if (response.isSuccessful) {
                response.body?.let { body ->
                    cachedFile.parentFile?.mkdirs()
                    cachedFile.sink().buffer().use { sink ->
                        body.source().use { source ->
                            sink.writeAll(source)
                        }
                    }
                    Log.d(TAG, "Video cached successfully: $url -> ${cachedFile.absolutePath}")
                    cachedFile
                } ?: run {
                    Log.e(TAG, "Response body is null for: $url")
                    null
                }
            } else {
                when (response.code) {
                    401 -> Log.e(TAG, "Unauthorized (401) - auth token may be invalid or expired: $url")
                    403 -> Log.e(TAG, "Forbidden (403) - auth token may not have permission: $url")
                    404 -> Log.e(TAG, "Not found (404) - video file does not exist: $url")
                    else -> Log.e(TAG, "Failed to download video: HTTP ${response.code} for $url")
                }
                null
            }
        }
    } catch (e: java.net.SocketTimeoutException) {
        Log.e(TAG, "Video caching timeout: $url", e)
        null
    } catch (e: java.net.UnknownHostException) {
        Log.e(TAG, "Video caching network error (unknown host): $url", e)
        null
    } catch (e: Exception) {
        Log.e(TAG, "Failed to cache video: $url", e)
        null
    }
}
```

**Testing:**
- [ ] Test with valid token (should cache successfully)
- [ ] Test with invalid token (should log 401 error)
- [ ] Test with missing token (should log warning)
- [ ] Test with network timeout (should log timeout error)
- [ ] Test with 404 URL (should log 404 error)

---

## Environment & Configuration

### 🔴 CRITICAL Priority

#### Task ENV-001: Verify Environment Variables
**Issue:** #3 - URL Resolution Problems  
**Files:** Production environment configuration  
**Assignee:** DevOps/Backend Team  
**Estimated Time:** 1 hour

**Description:**
Ensure all required environment variables are set correctly in production.

**Acceptance Criteria:**
- [ ] `PUBLIC_BASE_URL` is set to full HTTPS URL
- [ ] `CDN_BASE_URL` is set if using CloudFront
- [ ] `JWT_SECRET` is set for auth token validation
- [ ] `NODE_ENV` is set to `production` in production

**Checklist:**
- [ ] Verify `PUBLIC_BASE_URL` in production environment
- [ ] Verify `CDN_BASE_URL` if using CloudFront
- [ ] Verify `JWT_SECRET` is set and secure
- [ ] Verify `NODE_ENV=production` in production
- [ ] Document all required environment variables

**Testing:**
- [ ] Test URL resolution with `PUBLIC_BASE_URL` set
- [ ] Test URL resolution without `PUBLIC_BASE_URL` (should log warning)
- [ ] Verify production URLs use HTTPS
- [ ] Verify CloudFront URLs are not modified

---

## Testing Tasks

### 🟠 HIGH Priority

#### Task TEST-001: End-to-End Video Playback Test
**Issue:** All issues  
**Assignee:** QA Team  
**Estimated Time:** 4 hours

**Description:**
Create comprehensive test suite to verify video playback works end-to-end.

**Test Scenarios:**
- [ ] **Test 1:** Android device receives playlist from correct endpoint
  - Check logs: `[DeviceEngine V2][Playlist]` should show successful fetch
  - Verify playlist has items: `items=${itemsArray.length()}`

- [ ] **Test 2:** Video URLs are accessible
  - Test video URL in browser/curl: Should return 200 OK
  - Check if URL requires auth: Should not require Bearer token (or token should work)

- [ ] **Test 3:** Video URLs are properly formatted
  - Check URL format: Should be absolute HTTPS URL or file:// URL
  - Verify no malformed URLs: Should not have double slashes or missing protocol

- [ ] **Test 4:** ExoPlayer can play videos
  - Check ExoPlayer logs: Should not show `PlaybackException`
  - Verify video plays: Should start playing within 2-3 seconds

- [ ] **Test 5:** Error handling works
  - Test with invalid URL: Should retry or skip gracefully
  - Check logs: Should show error details, not just skip

**Test Data:**
- [ ] Create test playlist with videos
- [ ] Create test device
- [ ] Assign playlist to device
- [ ] Verify device receives playlist

---

### 🟡 MEDIUM Priority

#### Task TEST-002: Regression Testing
**Issue:** All fixes  
**Assignee:** QA Team  
**Estimated Time:** 2 hours

**Description:**
Verify that fixes don't break existing functionality.

**Test Scenarios:**
- [ ] Image playback still works
- [ ] Playlist switching still works
- [ ] Device pairing still works
- [ ] Playlist assignment still works
- [ ] Caching still works for images
- [ ] Offline mode still works

---

## Documentation Tasks

### 🟡 MEDIUM Priority

#### Task DOC-001: Update API Documentation
**Issue:** #1, #5 - Playlist Endpoint and Format  
**Files:** API documentation  
**Assignee:** Backend Team  
**Estimated Time:** 2 hours

**Description:**
Document the correct playlist endpoint and response format.

**Documentation Updates:**
- [ ] Document `/api/device/:deviceId/playlist/full` endpoint
- [ ] Document response format structure
- [ ] Document error responses
- [ ] Add examples for Android app integration
- [ ] Document authentication requirements (if any)

---

## Implementation Timeline

### Week 1: Critical Fixes
- **Day 1-2:** Task ANDROID-001 (Playlist endpoint fix) - **30 min**
- **Day 1-2:** Task ANDROID-002 (Auth token validation) - **2 hours**
- **Day 1-2:** Task CORE-001 (URL resolution) - **2 hours**
- **Day 3-4:** Task ENV-001 (Environment variables) - **1 hour**
- **Day 5:** Testing critical fixes

### Week 2: High Priority Fixes
- **Day 1-2:** Task ANDROID-003 (ExoPlayer error handling) - **4 hours**
- **Day 2-3:** Task ANDROID-004 (Caching race condition) - **3 hours**
- **Day 3-4:** Task CORE-002 (Content-Type headers) - **3 hours**
- **Day 4-5:** Task CORE-003 (CORS headers) - **2 hours**
- **Day 5:** Testing high priority fixes

### Week 3: Medium Priority & Testing
- **Day 1-2:** Task ANDROID-005 (Playlist validation) - **2 hours**
- **Day 2-3:** Task ANDROID-006 (Cache error handling) - **2 hours**
- **Day 3-4:** Task CORE-004 (Playlist format) - **4 hours**
- **Day 4-5:** Task TEST-001 (E2E testing) - **4 hours**
- **Day 5:** Task TEST-002 (Regression testing) - **2 hours**

### Week 4: Polish & Documentation
- **Day 1-2:** Task CORE-005 (Logging) - **1 hour**
- **Day 2-3:** Task DOC-001 (API documentation) - **2 hours**
- **Day 3-5:** Final testing and bug fixes

---

## Success Criteria

### Critical Success Criteria (Must Have)
- [ ] Android devices can fetch playlists from correct endpoint
- [ ] Videos play successfully on Android devices
- [ ] Video URLs are properly formatted and accessible
- [ ] Auth token issues are resolved or documented

### High Priority Success Criteria (Should Have)
- [ ] ExoPlayer errors are properly handled with retry logic
- [ ] Video caching works correctly without race conditions
- [ ] Content-Type headers are set correctly for all videos
- [ ] CORS headers support video streaming properly

### Medium Priority Success Criteria (Nice to Have)
- [ ] Playlist format is standardized and documented
- [ ] Comprehensive error logging helps diagnose issues
- [ ] API documentation is up to date
- [ ] Test coverage is comprehensive

---

## Notes

- **No code refactoring** - Only bug fixes as requested
- **Backward compatibility** - Ensure fixes don't break existing functionality
- **Logging** - Add comprehensive logging to help diagnose future issues
- **Testing** - Test each fix individually before moving to next
- **Documentation** - Update documentation as fixes are implemented

---

## Task Assignment Summary

| Task ID | Priority | Repository | Estimated Time | Status |
|---------|----------|------------|----------------|--------|
| ANDROID-001 | 🔴 CRITICAL | Android | 30 min | ⏳ Pending |
| ANDROID-002 | 🔴 CRITICAL | Android | 2 hours | ⏳ Pending |
| ANDROID-003 | 🟠 HIGH | Android | 4 hours | ⏳ Pending |
| ANDROID-004 | 🟠 HIGH | Android | 3 hours | ⏳ Pending |
| ANDROID-005 | 🟡 MEDIUM | Android | 2 hours | ⏳ Pending |
| ANDROID-006 | 🟡 MEDIUM | Android | 2 hours | ⏳ Pending |
| CORE-001 | 🔴 CRITICAL | Backend | 2 hours | ⏳ Pending |
| CORE-002 | 🟠 HIGH | Backend | 3 hours | ⏳ Pending |
| CORE-003 | 🟠 HIGH | Backend | 2 hours | ⏳ Pending |
| CORE-004 | 🟡 MEDIUM | Backend | 4 hours | ⏳ Pending |
| CORE-005 | 🟢 LOW | Backend | 1 hour | ⏳ Pending |
| ENV-001 | 🔴 CRITICAL | Config | 1 hour | ⏳ Pending |
| TEST-001 | 🟠 HIGH | Testing | 4 hours | ⏳ Pending |
| TEST-002 | 🟡 MEDIUM | Testing | 2 hours | ⏳ Pending |
| DOC-001 | 🟡 MEDIUM | Docs | 2 hours | ⏳ Pending |

**Total Estimated Time:** ~34.5 hours (~4.5 days)

---

**Last Updated:** Current  
**Next Review:** After Week 1 critical fixes are complete

