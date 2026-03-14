# Device Engine V2 - Critical Fixes Implementation Guide
**Created:** Current Date  
**Scope:** Video Playback, Playlist Confirmation, Command Execution  
**Repositories:** Backend (cardbey-core), Frontend (Dashboard), Android App

---

## Overview

This guide provides step-by-step instructions to fix three critical issues:
1. **Video Playback Fixes** - Fix endpoint mismatch, URL resolution, ExoPlayer errors
2. **Playlist Confirmation** - Add playlist confirmation call from Android app
3. **Command Execution** - Implement SSE command handling in Android app

**Estimated Total Time:** 16-24 hours  
**Priority:** 🔴 CRITICAL

---

## Prerequisites

- Backend running on `http://192.168.1.12:3001` (or your local IP)
- Android Studio installed
- Node.js and npm installed
- Git access to all repositories

---

## Fix 1: Video Playback Fixes

### Issue Summary
- Android app calls `/api/devices/:id/playlist` but backend endpoint is `/api/device/:id/playlist/full`
- Video URLs may not resolve correctly
- ExoPlayer skips videos on errors without retry

---

### Step 1.1: Backend - Verify Playlist Endpoint

**Repository:** `apps/core/cardbey-core`

**File:** `src/routes/deviceEngine.js`

**Action:** Verify endpoint exists and returns correct format

1. **Check endpoint exists:**
   ```bash
   cd apps/core/cardbey-core
   grep -n "playlist/full" src/routes/deviceEngine.js
   ```
   Should show line ~1810 with `router.get('/:deviceId/playlist/full'`

2. **Verify response format:**
   ```bash
   # Check response structure
   grep -A 50 "playlist/full" src/routes/deviceEngine.js | head -30
   ```
   Should return: `{ ok: true, deviceId, state, playlist: { id, name, items: [...] } }`

3. **Test endpoint manually:**
   ```bash
   # Replace DEVICE_ID with actual device ID
   curl http://192.168.1.12:3001/api/device/DEVICE_ID/playlist/full
   ```
   Should return JSON with playlist data.

**✅ Verification:** Endpoint exists and returns correct format

---

### Step 1.2: Backend - Ensure PUBLIC_API_BASE_URL is Set

**Repository:** `apps/core/cardbey-core`

**File:** `.env`

**Action:** Set PUBLIC_API_BASE_URL environment variable

1. **Check if .env exists:**
   ```bash
   cd apps/core/cardbey-core
   ls -la .env
   ```

2. **Create/update .env:**
   ```bash
   # If .env doesn't exist, copy from example
   cp .env.example .env
   
   # Edit .env and add/update:
   PUBLIC_API_BASE_URL=http://192.168.1.12:3001
   ```
   **Important:** Replace `192.168.1.12` with your actual local IP address.

3. **Find your local IP:**
   ```bash
   # Windows PowerShell
   ipconfig | findstr "IPv4"
   
   # macOS/Linux
   ifconfig | grep "inet " | grep -v 127.0.0.1
   ```

4. **Restart backend:**
   ```bash
   # Stop current server (Ctrl+C)
   npm start
   ```

5. **Verify environment variable:**
   ```bash
   # Check backend logs on startup
   # Should see: [publicUrl] Using PUBLIC_API_BASE_URL: http://192.168.1.12:3001
   ```

**✅ Verification:** Backend logs show PUBLIC_API_BASE_URL is set

---

### Step 1.3: Android App - Fix Playlist Endpoint

**Repository:** `apps/dashboard/cardbey-marketing-dashboard/app`

**File:** `src/main/java/com/cardbey/slide/engine/PlaylistEngine.kt`

**Action:** Update endpoint to use `/api/device/:id/playlist/full` and fix response parsing

1. **Open file:**
   ```bash
   cd apps/dashboard/cardbey-marketing-dashboard/app
   # Open in Android Studio: src/main/java/com/cardbey/slide/engine/PlaylistEngine.kt
   ```

2. **Update `pollPlaylist()` method (around line 69):**

   **BEFORE:**
   ```kotlin
   private fun pollPlaylist(baseUrl: String, deviceId: String) {
       // Use DeviceEngine V2 playlist endpoint
       // Try /api/devices/:deviceId/playlist first (deviceAgentRoutes)
       // Fallback to /api/device/:deviceId/playlist if needed
       val url = "$baseUrl/api/devices/$deviceId/playlist"
   ```

   **AFTER:**
   ```kotlin
   private fun pollPlaylist(baseUrl: String, deviceId: String) {
       // Use DeviceEngine V2 playlist endpoint
       // Use /api/device/:deviceId/playlist/full (correct endpoint)
       val url = "$baseUrl/api/device/$deviceId/playlist/full"
   ```

3. **Update response parsing (around line 98):**

   **BEFORE:**
   ```kotlin
   val json = org.json.JSONObject(body)
   if (json.optBoolean("ok", false)) {
       val playlistObj = json.optJSONObject("playlist")
       if (playlistObj != null) {
           val itemsArray = playlistObj.optJSONArray("items")
   ```

   **AFTER:**
   ```kotlin
   val json = org.json.JSONObject(body)
   if (json.optBoolean("ok", false)) {
       // Backend returns: { ok: true, deviceId, state, playlist: {...} }
       val state = json.optString("state", "no_binding")
       
       if (state == "ready" || state == "pending_binding") {
           val playlistObj = json.optJSONObject("playlist")
           if (playlistObj != null) {
               val itemsArray = playlistObj.optJSONArray("items")
               if (itemsArray != null && itemsArray.length() > 0) {
                   // Format as { items: [...] } for player
                   val formattedPlaylist = org.json.JSONObject().apply {
                       put("items", itemsArray)
                   }
                   val playlistJson = formattedPlaylist.toString()
                   Log.d(TAG, "Playlist updated, state=$state, items=${itemsArray.length()}")
                   onPlaylistChanged(playlistJson)
               } else {
                   Log.d(TAG, "Playlist has no items (state=$state)")
                   onPlaylistChanged("{\"items\":[]}")
               }
           } else {
               Log.d(TAG, "No playlist object (state=$state)")
               onPlaylistChanged("{\"items\":[]}")
           }
       } else {
           // State is "no_binding" or other
           Log.d(TAG, "No active playlist binding (state=$state)")
           onPlaylistChanged("{\"items\":[]}")
       }
   } else {
       Log.w(TAG, "Playlist response not ok: ${json.optString("error")}")
   }
   ```

4. **Save file and rebuild:**
   ```bash
   ./gradlew clean
   ./gradlew assembleDebug
   ```

**✅ Verification:** App uses correct endpoint and parses response correctly

---

### Step 1.4: Android App - Fix ExoPlayer Error Handling

**Repository:** `apps/dashboard/cardbey-marketing-dashboard/app`

**File:** `src/main/java/com/cardbey/slide/ui/player/PlayerActivity.kt`

**Action:** Add retry logic and better error handling for video playback

1. **Find ExoPlayer error handler (search for `onPlayerError`):**

2. **Add retry logic:**

   **Add at top of class:**
   ```kotlin
   private var videoRetryCount = 0
   private val MAX_VIDEO_RETRIES = 3
   ```

3. **Update error handler:**

   **Find:**
   ```kotlin
   player.addListener(object : Player.Listener {
       override fun onPlayerError(error: PlaybackException) {
           Log.e(TAG, "ExoPlayer error", error)
           // Skip to next item
           nextAsset()
       }
   })
   ```

   **Replace with:**
   ```kotlin
   player.addListener(object : Player.Listener {
       override fun onPlayerError(error: PlaybackException) {
           val errorCode = error.errorCode
           val errorMessage = error.message ?: "Unknown error"
           
           Log.e(TAG, "ExoPlayer error", error)
           Log.e(TAG, "Error code: $errorCode, message: $errorMessage")
           
           // Retry for transient errors
           if (videoRetryCount < MAX_VIDEO_RETRIES && 
               (errorCode == PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED ||
                errorCode == PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT ||
                errorCode == PlaybackException.ERROR_CODE_TIMEOUT)) {
               videoRetryCount++
               Log.w(TAG, "Retrying video playback (attempt $videoRetryCount/$MAX_VIDEO_RETRIES)")
               
               // Retry current video after delay
               lifecycleScope.launch {
                   delay(2000) // Wait 2 seconds
                   val currentUrl = currentVideoUrl
                   if (currentUrl != null) {
                       playVideo(currentUrl, currentVideoDuration)
                   }
               }
           } else {
               // Max retries reached or non-retryable error - skip to next
               Log.w(TAG, "Skipping video after $videoRetryCount retries or non-retryable error")
               videoRetryCount = 0
               nextAsset()
           }
       }
       
       override fun onPlaybackStateChanged(playbackState: Int) {
           if (playbackState == Player.STATE_READY) {
               // Reset retry count on successful playback
               videoRetryCount = 0
           }
       }
   })
   ```

4. **Save and rebuild:**
   ```bash
   ./gradlew assembleDebug
   ```

**✅ Verification:** Videos retry on transient errors instead of immediately skipping

---

## Fix 2: Playlist Confirmation

### Issue Summary
- Android app doesn't call `confirm-playlist-ready` after loading playlist
- Binding status stays "pending" instead of "ready"

---

### Step 2.1: Backend - Verify Confirmation Endpoint

**Repository:** `apps/core/cardbey-core`

**File:** `src/routes/deviceEngine.js`

**Action:** Verify endpoint exists and works

1. **Check endpoint:**
   ```bash
   cd apps/core/cardbey-core
   grep -n "confirm-playlist-ready" src/routes/deviceEngine.js
   ```
   Should show line ~1051 with `router.post('/confirm-playlist-ready'`

2. **Test endpoint manually:**
   ```bash
   curl -X POST http://192.168.1.12:3001/api/device/confirm-playlist-ready \
     -H "Content-Type: application/json" \
     -d '{
       "deviceId": "DEVICE_ID",
       "playlistId": "PLAYLIST_ID",
       "playlistVersion": "PLAYLIST_ID:1234567890"
     }'
   ```
   Should return: `{ ok: true }`

**✅ Verification:** Endpoint exists and accepts requests

---

### Step 2.2: Android App - Add Playlist Confirmation

**Repository:** `apps/dashboard/cardbey-marketing-dashboard/app`

**File:** `src/main/java/com/cardbey/slide/engine/PlaylistEngine.kt`

**Action:** Add confirmation call after playlist loads successfully

1. **Add confirmation function:**

   **Add after `pollPlaylist()` method:**
   ```kotlin
   private fun confirmPlaylistReady(
       baseUrl: String,
       deviceId: String,
       playlistId: String,
       version: String
   ) {
       lifecycleScope.launch(Dispatchers.IO) {
           try {
               val url = "$baseUrl/api/device/confirm-playlist-ready"
               val payload = org.json.JSONObject().apply {
                   put("deviceId", deviceId)
                   put("playlistId", playlistId)
                   put("playlistVersion", version)
               }
               
               val request = Request.Builder()
                   .url(url)
                   .post(payload.toString().toRequestBody(JSON_MEDIA_TYPE))
                   .build()
               
               client.newCall(request).execute().use { resp ->
                   if (resp.isSuccessful) {
                       Log.i(TAG, "Playlist confirmed ready: $playlistId (version: $version)")
                   } else {
                       Log.w(TAG, "Failed to confirm playlist: HTTP ${resp.code}")
                   }
               }
           } catch (e: Exception) {
               Log.e(TAG, "Error confirming playlist ready", e)
               // Non-fatal - don't throw
           }
       }
   }
   ```

2. **Add import for JSON_MEDIA_TYPE:**

   **Add at top of file:**
   ```kotlin
   import okhttp3.MediaType.Companion.toMediaType
   
   private val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()
   ```

3. **Call confirmation after playlist loads:**

   **Update `pollPlaylist()` method, after successful playlist parsing:**

   **Find:**
   ```kotlin
   val playlistJson = formattedPlaylist.toString()
   Log.d(TAG, "Playlist updated, items=${itemsArray.length()}")
   onPlaylistChanged(playlistJson)
   ```

   **Add after:**
   ```kotlin
   // Confirm playlist is ready
   val playlistId = playlistObj.optString("id", "")
   val version = json.optString("version", "") // Backend should include version
   
   if (playlistId.isNotBlank()) {
       // Extract version from binding or use timestamp
       val bindingVersion = version.ifBlank { 
           "${playlistId}:${System.currentTimeMillis()}" 
       }
       confirmPlaylistReady(baseUrl, deviceId, playlistId, bindingVersion)
   }
   ```

4. **Update response parsing to extract version:**

   **In `pollPlaylist()`, after parsing JSON:**
   ```kotlin
   val json = org.json.JSONObject(body)
   if (json.optBoolean("ok", false)) {
       val state = json.optString("state", "no_binding")
       val version = json.optString("version", "") // Get version from response
       
       if (state == "ready" || state == "pending_binding") {
           val playlistObj = json.optJSONObject("playlist")
           if (playlistObj != null) {
               val playlistId = playlistObj.optString("id", "")
               // ... rest of parsing ...
               
               // After calling onPlaylistChanged:
               if (playlistId.isNotBlank() && itemsArray.length() > 0) {
                   val bindingVersion = version.ifBlank { 
                       "${playlistId}:${System.currentTimeMillis()}" 
                   }
                   confirmPlaylistReady(baseUrl, deviceId, playlistId, bindingVersion)
               }
           }
       }
   }
   ```

5. **Save and rebuild:**
   ```bash
   ./gradlew assembleDebug
   ```

**✅ Verification:** App calls confirmation endpoint after playlist loads

---

### Step 2.3: Backend - Include Version in Playlist Response

**Repository:** `apps/core/cardbey-core`

**File:** `src/routes/deviceEngine.js`

**Action:** Include binding version in playlist response

1. **Find playlist endpoint (around line 1810):**

2. **Update response to include version:**

   **Find:**
   ```javascript
   res.json({
     ok: true,
     deviceId,
     state,
     message,
     playlist: formattedPlaylist,
   });
   ```

   **Update to:**
   ```javascript
   res.json({
     ok: true,
     deviceId,
     state,
     message,
     version: latestBinding?.version || null, // Include version
     playlist: formattedPlaylist,
   });
   ```

3. **Save and restart backend:**
   ```bash
   # Restart backend
   npm start
   ```

**✅ Verification:** Playlist response includes version field

---

## Fix 3: Command Execution

### Issue Summary
- Android app doesn't execute commands received via SSE
- Commands queue but don't execute

---

### Step 3.1: Backend - Verify Command Endpoint

**Repository:** `apps/core/cardbey-core`

**File:** `src/routes/deviceEngine.js`

**Action:** Verify command endpoint and SSE broadcasting

1. **Check command endpoint:**
   ```bash
   cd apps/core/cardbey-core
   grep -n "POST.*command" src/routes/deviceEngine.js
   ```
   Should show line ~1143 with `router.post('/command'`

2. **Check command polling endpoint:**
   ```bash
   grep -n "GET.*commands" src/routes/deviceEngine.js
   ```
   Should show endpoint for device to poll commands

3. **Test command endpoint:**
   ```bash
   # Replace DEVICE_ID with actual device ID
   curl -X POST http://192.168.1.12:3001/api/device/command \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -d '{
       "deviceId": "DEVICE_ID",
       "type": "play"
     }'
   ```
   Should return: `{ ok: true, id: "command_id" }`

**✅ Verification:** Command endpoint exists and queues commands

---

### Step 3.2: Backend - Add Commands to Heartbeat Response

**Repository:** `apps/core/cardbey-core`

**File:** `src/routes/deviceEngine.js`

**Action:** Add pending commands to heartbeat response

1. **Find heartbeat response building (around line 850):**

2. **Add commands before building response:**

   **Find:**
   ```javascript
   // Build standardized response
   const response = {
     ok: true,
     deviceId: device.id,
     status: normalizedStatus,
     pairingStatus,
     displayName,
     orientation: deviceOrientation,
     tenantId: device.tenantId ?? null,
     storeId: device.storeId ?? null,
     ...(repairStatus && { repairStatus }),
   };
   ```

   **Replace with:**
   ```javascript
   // Get pending commands for device
   const pendingCommands = await getPendingCommandsForDevice(deviceId);
   
   // Mark commands as sent
   if (pendingCommands.length > 0) {
     const commandIds = pendingCommands.map(cmd => cmd.id);
     await markCommandsAsSent(commandIds);
     console.log(`[Device Engine] Marked ${pendingCommands.length} commands as sent`);
   }
   
   // Build standardized response
   const response = {
     ok: true,
     deviceId: device.id,
     status: normalizedStatus,
     pairingStatus,
     displayName,
     orientation: deviceOrientation,
     tenantId: device.tenantId ?? null,
     storeId: device.storeId ?? null,
     commands: pendingCommands.length > 0 ? pendingCommands.map(cmd => ({
       id: cmd.id,
       type: cmd.type,
       payload: cmd.payload || {},
     })) : undefined,
     ...(repairStatus && { repairStatus }),
   };
   
   // Remove commands if empty
   if (!response.commands || response.commands.length === 0) {
     delete response.commands;
   }
   ```

3. **Add imports at top of file (if not already present):**

   ```javascript
   import { getPendingCommandsForDevice, markCommandsAsSent } from '../engines/device/commands.js';
   ```

4. **Save and restart backend:**
   ```bash
   npm start
   ```

**✅ Verification:** Heartbeat response includes pending commands

---

### Step 3.3: Android App - Extract Commands from Heartbeat

**Repository:** `apps/dashboard/cardbey-marketing-dashboard/app`

**File:** `src/main/java/com/cardbey/slide/engine/DeviceHeartbeatManager.kt`

**Action:** Extract and handle commands from heartbeat response

1. **Open file:** `src/main/java/com/cardbey/slide/engine/DeviceHeartbeatManager.kt`

2. **Add command callback field:**

   **Add after `private var isRunning = false`:**
   ```kotlin
   private var onCommandReceived: ((String, String, org.json.JSONObject?) -> Unit)? = null
   private val executedCommandIds = mutableSetOf<String>()
   ```

3. **Add command handler setter:**

   **Add after `stop()` method:**
   ```kotlin
   fun setCommandHandler(handler: (String, String, org.json.JSONObject?) -> Unit) {
       onCommandReceived = handler
   }
   ```

4. **Update `sendHeartbeat()` to parse response and extract commands:**

   **Find:**
   ```kotlin
   client.newCall(request).execute().use { resp ->
       if (!resp.isSuccessful) {
           Log.w(TAG, "Heartbeat HTTP ${resp.code}: ${resp.body?.string()?.take(200)}")
       } else {
           Log.d(TAG, "Heartbeat OK")
       }
   }
   ```

   **Replace with:**
   ```kotlin
   client.newCall(request).execute().use { resp ->
       if (!resp.isSuccessful) {
           Log.w(TAG, "Heartbeat HTTP ${resp.code}: ${resp.body?.string()?.take(200)}")
       } else {
           val body = resp.body?.string().orEmpty()
           try {
               val json = org.json.JSONObject(body)
               if (json.optBoolean("ok", false)) {
                   // Extract commands from response
                   val commandsArray = json.optJSONArray("commands")
                   if (commandsArray != null && commandsArray.length() > 0) {
                       Log.d(TAG, "Received ${commandsArray.length()} commands from heartbeat")
                       for (i in 0 until commandsArray.length()) {
                           val cmdObj = commandsArray.getJSONObject(i)
                           val commandId = cmdObj.getString("id")
                           val commandType = cmdObj.getString("type")
                           val commandPayload = cmdObj.optJSONObject("payload")
                           
                           // Execute command (will be handled by PlayerActivity)
                           onCommandReceived?.invoke(commandId, commandType, commandPayload)
                       }
                   }
               }
           } catch (e: Exception) {
               Log.e(TAG, "Failed to parse heartbeat response", e)
           }
           Log.d(TAG, "Heartbeat OK")
       }
   }
   ```

5. **Update heartbeat payload to include executed commands:**

   **Find:**
   ```kotlin
   val json = JSONObject().apply {
       put("deviceId", deviceId)
       put("engine", "DEVICE_V2")
       put("status", "online")
       put("timestamp", System.currentTimeMillis())
   }
   ```

   **Replace with:**
   ```kotlin
   val json = JSONObject().apply {
       put("deviceId", deviceId)
       put("engineVersion", "DEVICE_V2")
       put("status", "online")
       put("timestamp", System.currentTimeMillis())
       
       // Include executed commands
       if (executedCommandIds.isNotEmpty()) {
           val executedArray = org.json.JSONArray()
           executedCommandIds.forEach { id ->
               executedArray.put(id)
           }
           put("executedCommandIds", executedArray)
           executedCommandIds.clear() // Clear after sending
       }
   }
   ```

6. **Add method to track executed commands:**

   **Add after `setCommandHandler()`:**
   ```kotlin
   fun markCommandExecuted(commandId: String) {
       executedCommandIds.add(commandId)
   }
   ```

7. **Add missing import:**

   ```kotlin
   import org.json.JSONArray
   ```

8. **Save file**

**✅ Verification:** Heartbeat extracts commands from response and sends executed commands

---

### Step 3.4: Android App - Integrate Command Handling in PlayerActivity

**Repository:** `apps/dashboard/cardbey-marketing-dashboard/app`

**File:** `src/main/java/com/cardbey/slide/ui/player/PlayerActivity.kt`

**Action:** Set command handler and execute commands

1. **Set command handler in `startDeviceEngineV2Engines()`:**

   **Find:**
   ```kotlin
   private fun startDeviceEngineV2Engines(deviceId: String) {
       // 1) Start heartbeat
       deviceHeartbeatManager = DeviceHeartbeatManager.getInstance()
       deviceHeartbeatManager?.start()
       
       // 2) Start playlist engine
       playlistEngine = PlaylistEngine(onPlaylistChanged = { ... })
       playlistEngine?.start()
   }
   ```

   **Update to:**
   ```kotlin
   private fun startDeviceEngineV2Engines(deviceId: String) {
       // 1) Start heartbeat with command handler
       deviceHeartbeatManager = DeviceHeartbeatManager.getInstance()
       deviceHeartbeatManager?.setCommandHandler { commandId, commandType, payload ->
           lifecycleScope.launch(Dispatchers.Main) {
               executeCommand(commandId, commandType, payload)
           }
       }
       deviceHeartbeatManager?.start()
       
       // 2) Start playlist engine
       playlistEngine = PlaylistEngine(onPlaylistChanged = { ... })
       playlistEngine?.start()
   }
   ```

4. **Add command execution function:**

   ```kotlin
   private fun executeCommand(commandId: String, commandType: String, payload: org.json.JSONObject?) {
       Log.i(TAG, "Executing command: $commandType (id: $commandId)")
       
       try {
           when (commandType) {
               "play" -> {
                   // Resume playback
                   if (player != null && player?.isPlaying == false) {
                       player?.play()
                   } else {
                       // Resume slideshow
                       isPaused = false
                       nextAsset()
                   }
               }
               "pause" -> {
                   // Pause playback
                   if (player != null && player?.isPlaying == true) {
                       player?.pause()
                   }
                   isPaused = true
                   clearTimeout(slideTimer)
               }
               "next" -> {
                   nextAsset()
               }
               "previous" -> {
                   prevAsset()
               }
               "reloadPlaylist" -> {
                   // Restart playlist from beginning
                   currentIndex = -1
                   nextAsset()
               }
               "setPlaylistIndex" -> {
                   val index = payload?.optInt("index", -1) ?: -1
                   if (index >= 0) {
                       skipToIndex(index)
                   }
               }
               "setVolume" -> {
                   val volume = payload?.optDouble("volume", 1.0) ?: 1.0
                   // Set volume (if supported)
                   Log.d(TAG, "Set volume: $volume")
               }
               "setBrightness" -> {
                   val brightness = payload?.optDouble("brightness", 1.0) ?: 1.0
                   // Set brightness (if supported)
                   Log.d(TAG, "Set brightness: $brightness")
               }
               "screenshot" -> {
                   // Take screenshot (if supported)
                   Log.d(TAG, "Screenshot requested")
               }
               else -> {
                   Log.w(TAG, "Unknown command type: $commandType")
               }
           }
           
           // Confirm command execution via next heartbeat
           // Commands are confirmed by including executedCommandIds in heartbeat
           deviceHeartbeatManager?.markCommandExecuted(commandId)
       } catch (e: Exception) {
           Log.e(TAG, "Error executing command", e)
       }
   }
   ```

5. **Add missing imports:**

   ```kotlin
   import org.json.JSONObject
   import org.json.JSONArray
   ```

7. **Save and rebuild:**
   ```bash
   ./gradlew assembleDebug
   ```

**✅ Verification:** Commands are polled and executed

---

## Testing Checklist

### Video Playback Fixes

- [ ] Backend `.env` has `PUBLIC_API_BASE_URL=http://YOUR_IP:3001`
- [ ] Backend restarted and logs show PUBLIC_API_BASE_URL
- [ ] Android app uses `/api/device/:id/playlist/full` endpoint
- [ ] Playlist response parsed correctly
- [ ] Videos play successfully
- [ ] Videos retry on transient errors instead of skipping

### Playlist Confirmation

- [ ] Backend endpoint `/api/device/confirm-playlist-ready` exists
- [ ] Backend playlist response includes `version` field
- [ ] Android app calls confirmation after playlist loads
- [ ] Binding status changes from "pending" to "ready" in database
- [ ] Dashboard shows playlist status as "ready"

### Command Execution

- [ ] Backend command endpoints exist (`/command`, `/commands/pending`, `/commands/:id/executed`)
- [ ] Android app polls commands every 5 seconds
- [ ] Commands are executed (play, pause, next, previous, reload)
- [ ] Command execution is confirmed to backend
- [ ] Dashboard can send commands and see them execute

---

## Troubleshooting

### Video Playback Issues

**Problem:** Videos still don't play

**Solutions:**
1. Check backend logs for URL resolution errors
2. Verify `PUBLIC_API_BASE_URL` is set correctly
3. Check Android logs: `adb logcat | grep "Playlist\|ExoPlayer"`
4. Verify playlist response includes valid video URLs
5. Check video file exists and is accessible

### Playlist Confirmation Issues

**Problem:** Binding status stays "pending"

**Solutions:**
1. Check Android logs: `adb logcat | grep "confirm-playlist-ready"`
2. Verify confirmation endpoint is called
3. Check backend logs for confirmation requests
4. Verify deviceId, playlistId, and version are correct
5. Check database: `SELECT * FROM DevicePlaylistBinding WHERE deviceId = '...'`

### Command Execution Issues

**Problem:** Commands don't execute

**Solutions:**
1. Check Android logs: `adb logcat | grep "Command"`
2. Verify CommandEngine is started
3. Check backend logs for command polling requests
4. Verify command type matches supported types
5. Check command execution confirmation is sent

---

## Summary

After completing all steps:

1. **Video Playback:** Fixed endpoint, URL resolution, and ExoPlayer retry logic
2. **Playlist Confirmation:** App confirms playlist loading, binding status updates
3. **Command Execution:** App polls and executes commands from backend

**Next Steps:**
- Test end-to-end flow
- Monitor logs for errors
- Update documentation
- Add unit tests

---

**Last Updated:** Current Date  
**Estimated Completion Time:** 16-24 hours

