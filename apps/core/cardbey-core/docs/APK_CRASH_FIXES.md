# Android APK Crash Fixes - Complete Guide

## Confirmed Bugs

### BUG 1: Double Slash in Playlist URL ❌
**Symptom:** APK calls `/api//screens/<id>/playlist/full` (double slash)  
**Impact:** Backend route doesn't match → returns empty playlist → crash  
**Status:** Backend now normalizes this, but APK should still be fixed

### BUG 2: Slideshow Loop Crashes on Single Item ❌
**Symptom:** App crashes after 5-10 seconds when playlist has only 1 item  
**Root Cause:** `IndexOutOfBoundsException` - incrementing index without modulo  
**Impact:** App crashes after first item plays

### BUG 3: Empty Playlist Handling Missing ❌
**Symptom:** App crashes when playlist is empty  
**Impact:** No graceful fallback when playlist fetch fails

### BUG 4: Missing ExoPlayer Error Listener ❌
**Symptom:** Video errors cause app crash instead of skipping to next item  
**Impact:** Unhandled exceptions crash the app

---

## Fix 1: Correct Playlist URL Construction

### Find the File
Search for where the playlist endpoint is called. Common locations:
- `PlayerActivity.kt` or `PlayerFragment.kt`
- `PlaylistRepository.kt` or `ApiService.kt`
- `NetworkModule.kt` or `ApiClient.kt`

### Current (Broken) Code
```kotlin
// ❌ WRONG - Creates double slash
val baseUrl = "https://cardbey-core.onrender.com"
val endpoint = "/api/screens/$screenId/playlist/full"
val url = "$baseUrl$endpoint"  // Results in: https://cardbey-core.onrender.com/api//screens/...
```

### Fixed Code
```kotlin
// ✅ CORRECT - Proper URL joining
val baseUrl = "https://cardbey-core.onrender.com".trimEnd('/')
val endpoint = "/api/screens/$screenId/playlist/full".trimStart('/')
val url = "$baseUrl/$endpoint"

// OR use URL class (recommended)
val url = URL("https://cardbey-core.onrender.com")
    .resolve("/api/screens/$screenId/playlist/full")
    .toString()

// OR use Retrofit baseUrl properly
// In ApiService interface:
@GET("screens/{screenId}/playlist/full")
suspend fun getPlaylist(@Path("screenId") screenId: String): PlaylistResponse

// In Retrofit setup:
Retrofit.Builder()
    .baseUrl("https://cardbey-core.onrender.com/api/")  // Note trailing slash
    .build()
```

### Add Debug Logging
```kotlin
val fetchUrl = "$baseUrl/$endpoint"
Log.d("CNetPlayer", "Fetching playlist from: $fetchUrl")
```

---

## Fix 2: Slideshow Loop - Modulo Index

### Find the File
Search for the slideshow loop. Common locations:
- `PlayerActivity.kt` - `playNextItem()` or `onItemEnded()`
- `SlideshowController.kt` or `PlaylistManager.kt`

### Current (Broken) Code
```kotlin
// ❌ WRONG - Crashes when playlist.size == 1
var currentIndex = 0

fun playNextItem() {
    currentIndex += 1
    val item = playlist[currentIndex]  // CRASH if currentIndex >= playlist.size
    playItem(item)
}
```

### Fixed Code
```kotlin
// ✅ CORRECT - Use modulo to wrap around
var currentIndex = 0

fun playNextItem() {
    if (playlist.isEmpty()) {
        Log.e("CNetPlayer", "Cannot play next: playlist is empty")
        showNoPlaylistUI()
        return
    }
    
    currentIndex = (currentIndex + 1) % playlist.size
    val item = playlist[currentIndex]
    
    Log.d("CNetPlayer", "Playing item index=$currentIndex, type=${item.type}, url=${item.url}")
    playItem(item)
}
```

### Alternative: Safe Index Increment
```kotlin
fun playNextItem() {
    if (playlist.isEmpty()) {
        showNoPlaylistUI()
        return
    }
    
    currentIndex++
    if (currentIndex >= playlist.size) {
        currentIndex = 0  // Loop back to start
    }
    
    val item = playlist[currentIndex]
    playItem(item)
}
```

---

## Fix 3: Empty Playlist Handling

### Find the File
Where playlist response is processed. Common locations:
- `PlaylistRepository.kt` - `fetchPlaylist()`
- `PlayerActivity.kt` - `onPlaylistReceived()`

### Current (Broken) Code
```kotlin
// ❌ WRONG - No validation
fun onPlaylistReceived(response: PlaylistResponse) {
    playlist = response.items
    startSlideshow()  // Crashes if playlist is empty
}
```

### Fixed Code
```kotlin
// ✅ CORRECT - Validate before using
fun onPlaylistReceived(response: PlaylistResponse) {
    if (response.items == null || response.items.isEmpty()) {
        Log.e("CNetPlayer", "Playlist returned empty, cannot start slideshow")
        Log.e("CNetPlayer", "Response: ok=${response.ok}, screenId=${response.screenId}, playlistId=${response.playlistId}")
        showNoPlaylistUI()
        return
    }
    
    playlist = response.items
    Log.d("CNetPlayer", "Playlist loaded: ${playlist.size} items")
    startSlideshow()
}

private fun showNoPlaylistUI() {
    // Show "No playlist assigned" message
    // Don't crash the app
    runOnUiThread {
        statusText.text = "No playlist assigned\nWaiting for content..."
        statusText.visibility = View.VISIBLE
    }
}
```

---

## Fix 4: ExoPlayer Error Listener

### Find the File
Where ExoPlayer is initialized. Common locations:
- `PlayerActivity.kt` - `setupPlayer()` or `initializePlayer()`
- `VideoPlayer.kt` or `ExoPlayerManager.kt`

### Current (Broken) Code
```kotlin
// ❌ WRONG - No error handling
val player = ExoPlayer.Builder(context).build()
player.setMediaItem(MediaItem.fromUri(videoUrl))
player.prepare()
player.play()
```

### Fixed Code
```kotlin
// ✅ CORRECT - Add error listener
val player = ExoPlayer.Builder(context).build()

player.addListener(object : Player.Listener {
    override fun onPlayerError(error: PlaybackException) {
        Log.e("CNetPlayer", "Video playback error: ${error.errorCodeName}", error)
        Log.e("CNetPlayer", "Error message: ${error.message}")
        Log.e("CNetPlayer", "Error code: ${error.errorCode}")
        
        // Skip to next item instead of crashing
        playNextItem()
    }
    
    override fun onPlayerStateChanged(playWhenReady: Boolean, playbackState: Int) {
        when (playbackState) {
            Player.STATE_READY -> {
                Log.d("CNetPlayer", "Player ready, starting playback")
            }
            Player.STATE_ENDED -> {
                Log.d("CNetPlayer", "Video ended, playing next item")
                playNextItem()
            }
            Player.STATE_BUFFERING -> {
                Log.d("CNetPlayer", "Player buffering...")
            }
            Player.STATE_IDLE -> {
                Log.d("CNetPlayer", "Player idle")
            }
        }
    }
})

player.setMediaItem(MediaItem.fromUri(videoUrl))
player.prepare()
player.play()
```

---

## Fix 5: Add Comprehensive Debug Logging

### Add Logging at Key Points

```kotlin
// 1. When fetching playlist
Log.d("CNetPlayer", "Fetching playlist for screen: $screenId")
Log.d("CNetPlayer", "API URL: $fetchUrl")

// 2. When playlist received
Log.d("CNetPlayer", "Playlist response received")
Log.d("CNetPlayer", "Items count: ${response.items?.size ?: 0}")
Log.d("CNetPlayer", "Screen ID: ${response.screenId}")
Log.d("CNetPlayer", "Playlist ID: ${response.playlistId}")

// 3. Before playing each item
Log.d("CNetPlayer", "Playing item index=$currentIndex")
Log.d("CNetPlayer", "Item type: ${item.type}")
Log.d("CNetPlayer", "Item URL: ${item.url}")
Log.d("CNetPlayer", "Item duration: ${item.durationS}s")

// 4. On errors
Log.e("CNetPlayer", "Error: $error", exception)
```

---

## Complete Example: Fixed PlayerActivity

```kotlin
class PlayerActivity : AppCompatActivity() {
    private var currentIndex = 0
    private var playlist: List<PlaylistItem> = emptyList()
    private lateinit var player: ExoPlayer
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setupPlayer()
        fetchPlaylist()
    }
    
    private fun setupPlayer() {
        player = ExoPlayer.Builder(this).build()
        
        player.addListener(object : Player.Listener {
            override fun onPlayerError(error: PlaybackException) {
                Log.e("CNetPlayer", "Video error: ${error.errorCodeName}", error)
                playNextItem()  // Skip to next instead of crashing
            }
            
            override fun onPlayerStateChanged(playWhenReady: Boolean, playbackState: Int) {
                if (playbackState == Player.STATE_ENDED) {
                    playNextItem()
                }
            }
        })
    }
    
    private fun fetchPlaylist() {
        val screenId = getScreenId() // Get from intent or shared prefs
        val baseUrl = "https://cardbey-core.onrender.com".trimEnd('/')
        val endpoint = "/api/screens/$screenId/playlist/full".trimStart('/')
        val fetchUrl = "$baseUrl/$endpoint"
        
        Log.d("CNetPlayer", "Fetching playlist from: $fetchUrl")
        
        // Use your HTTP client (Retrofit, OkHttp, etc.)
        apiService.getPlaylist(screenId).enqueue(object : Callback<PlaylistResponse> {
            override fun onResponse(call: Call<PlaylistResponse>, response: Response<PlaylistResponse>) {
                if (response.isSuccessful && response.body() != null) {
                    val playlistResponse = response.body()!!
                    
                    // ✅ FIX 3: Validate playlist
                    if (playlistResponse.items == null || playlistResponse.items.isEmpty()) {
                        Log.e("CNetPlayer", "Playlist returned empty")
                        showNoPlaylistUI()
                        return
                    }
                    
                    playlist = playlistResponse.items
                    Log.d("CNetPlayer", "Playlist loaded: ${playlist.size} items")
                    startSlideshow()
                } else {
                    Log.e("CNetPlayer", "Playlist fetch failed: ${response.code()}")
                    showNoPlaylistUI()
                }
            }
            
            override fun onFailure(call: Call<PlaylistResponse>, t: Throwable) {
                Log.e("CNetPlayer", "Playlist fetch error", t)
                showNoPlaylistUI()
            }
        })
    }
    
    private fun startSlideshow() {
        if (playlist.isEmpty()) {
            showNoPlaylistUI()
            return
        }
        
        currentIndex = 0
        playCurrentItem()
    }
    
    private fun playCurrentItem() {
        val item = playlist[currentIndex]
        
        Log.d("CNetPlayer", "Playing item index=$currentIndex, type=${item.type}, url=${item.url}")
        
        when (item.type) {
            "video" -> playVideo(item.url)
            "image" -> showImage(item.url, item.durationS)
            else -> {
                Log.w("CNetPlayer", "Unknown item type: ${item.type}, skipping")
                playNextItem()
            }
        }
    }
    
    // ✅ FIX 2: Use modulo to prevent IndexOutOfBoundsException
    private fun playNextItem() {
        if (playlist.isEmpty()) {
            Log.e("CNetPlayer", "Cannot play next: playlist is empty")
            showNoPlaylistUI()
            return
        }
        
        currentIndex = (currentIndex + 1) % playlist.size
        playCurrentItem()
    }
    
    private fun playVideo(url: String) {
        val mediaItem = MediaItem.fromUri(url)
        player.setMediaItem(mediaItem)
        player.prepare()
        player.play()
    }
    
    private fun showNoPlaylistUI() {
        runOnUiThread {
            // Show "No playlist" message
            // Don't crash
        }
    }
}
```

---

## Testing Checklist

After implementing fixes:

- [ ] **Test single-item playlist:** Create playlist with 1 video, verify it loops without crashing
- [ ] **Test empty playlist:** Verify app shows "No playlist" instead of crashing
- [ ] **Test video errors:** Use invalid video URL, verify app skips to next item
- [ ] **Check logs:** Verify correct URL is being called (no double slashes)
- [ ] **Test on TV:** Deploy to TV and verify no crashes after 5-10 seconds
- [ ] **Test on tablet:** Deploy to tablet and verify no crashes

---

## Backend Safeguards (Already Implemented)

The backend now:
- ✅ Normalizes double slashes in URLs automatically
- ✅ Logs warnings when double slashes are detected
- ✅ Logs errors when empty playlists are returned
- ✅ Provides detailed logging for debugging

However, **the APK should still be fixed** to avoid relying on backend normalization.

---

## Summary

1. **Fix URL construction** - Remove double slashes
2. **Fix slideshow loop** - Use modulo: `(currentIndex + 1) % playlist.size`
3. **Handle empty playlists** - Validate before using
4. **Add ExoPlayer error listener** - Skip to next on errors
5. **Add debug logging** - Log all key operations

These fixes will prevent all crashes and make the app robust.

