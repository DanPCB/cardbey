# Device Engine V2 Debug & Connectivity Fixes

## Summary

Comprehensive debugging, instrumentation, and fixes for Android tablet (Device Engine V2) connectivity to Cardbey Core backend.

**Date:** 2025-12-11  
**Status:** ✅ All fixes implemented

---

## 1. Backend Diagnostic Endpoints

### Added `/api/device/debug/ping`
- **Location:** `apps/core/cardbey-core/src/routes/deviceEngine.js`
- **Purpose:** Simple connectivity test for tablets
- **Response:**
  ```json
  {
    "ok": true,
    "message": "Device Debug Ping OK",
    "timestamp": "...",
    "ip": req.ip,
    "headers": { ... }
  }
  ```

### Added `/api/device/debug/run-all`
- **Location:** `apps/core/cardbey-core/src/routes/deviceEngine.js`
- **Purpose:** Comprehensive connectivity test
- **Tests:**
  - API health (`/api/health`)
  - Database connection
  - Device count
  - WebSocket/SSE status
- **Response:**
  ```json
  {
    "ok": true,
    "results": {
      "apiHealth": { "ok": true/false, "error": null },
      "dbConnection": { "ok": true/false, "error": null },
      "deviceCount": { "count": 0, "ok": true },
      "websocketStatus": { "ok": true/false, "error": null },
      "reachableFromDashboard": true
    }
  }
  ```

---

## 2. Full Connection Logging

### Pairing Logging
- **Location:** `apps/core/cardbey-core/src/routes/deviceEngine.js` (handleRequestPairing)
- **Logs:**
  ```
  [PAIRING] Incoming pairing request from <ip>
  [PAIRING] Payload: { deviceId, pairingCode, engineVersion, model, platform }
  ```

### Heartbeat Logging
- **Location:** `apps/core/cardbey-core/src/routes/deviceEngine.js` (POST /heartbeat)
- **Logs:**
  ```
  [HEARTBEAT] Device <id> heartbeat received
  [HEARTBEAT] Payload: { battery, appVersion, orientation, playlistState, tenantId, storeId, status }
  ```

### WebSocket Logging
- **Location:** `apps/core/cardbey-core/src/realtime/deviceWebSocketHub.js`
- **Logs:**
  ```
  [WS] Device connected: <id>
  [WS] Device disconnected: <id>
  ```

### Device List Logging
- **Location:** `apps/core/cardbey-core/src/routes/deviceEngine.js` (GET /list)
- **Logs:**
  ```
  [DEVICE LIST] Query result: count=<n>
  [DEVICE ENGINE] WARNING: No devices found.
  [DEVICE ENGINE] Check if pairing created a row in DB.
  [DEVICE ENGINE] tenantId=<...> storeId=<...>
  ```
- **Diagnostic Query:** When no devices found, logs all devices in DB (first 50) with tenantId/storeId

---

## 3. Device List Investigation

### Defensive Logging Added
- When `/api/device/list` returns 0 devices:
  - Logs warning with tenantId/storeId
  - Runs diagnostic query: `prisma.device.findMany({ take: 50 })`
  - Logs all devices with their tenantId/storeId for debugging

### Fixed Issues
- Enhanced logging to identify why devices aren't found
- Diagnostic query helps identify tenant/store mismatches

---

## 4. Android Device Engine Connectivity

### Enhanced Logging
- **DeviceHeartbeatManager.kt:**
  - `Log.d(TAG, "HEARTBEAT → $url")`
  - `Log.d(TAG, "Response($url): code=${resp.code}, body=${resp.body?.take(200)}")`
  
- **PairTvActivity.kt:**
  - `Log.i("[DeviceEngine V2][PairTvActivity]", "PAIR → $url")`
  - `Log.d("[DeviceEngine V2][PairTvActivity]", "Response($url): code=${response.code}, body=${bodyText?.take(200)}")`
  
- **PlaylistEngine.kt:**
  - `Log.d(TAG, "PLAYLIST → $url")`

### Retry Logic
- **Heartbeat:** 3 retries with exponential backoff (1s, 2s, 3s)
- **Pairing:** 3 retries with exponential backoff
- **Playlist:** 3 retries with exponential backoff (2s delay)

### Heartbeat Schedule
- **Interval:** 30 seconds (INTERVAL_MS = 30_000L)
- **Implementation:** Coroutine with `delay(INTERVAL_MS)`
- **URL:** `POST {coreUrl}/api/device/heartbeat` ✅

---

## 5. Tablet Self-Diagnostic UI

### Diagnostic Activity
- **Location:** `apps/dashboard/cardbey-marketing-dashboard/app/src/main/java/com/cardbey/slide/ui/diagnostic/DeviceDiagnosticActivity.kt`
- **Layout:** `activity_device_diagnostic.xml`
- **Enable:** Tap 5 times in top-left corner of PlayerActivity

### Tests Performed
1. **API Health:** `GET ${coreUrl}/api/health`
2. **Debug Ping:** `GET ${coreUrl}/api/device/debug/ping`
3. **Heartbeat:** `POST ${coreUrl}/api/device/heartbeat`
4. **SSE Stream:** `GET ${coreUrl}/api/stream?key=admin`
5. **Playlist:** `GET ${coreUrl}/api/device/${deviceId}/playlist/full`

### UI Features
- Shows pass/fail indicators for each test
- Displays current Core URL
- "Show Core URL" button with full details (deviceId, build config, stored URL)
- Auto-runs tests on start

---

## 6. Pairing Flow Fixes

### Issue A: Device Row Creation ✅
- **Fixed:** `requestPairing.js` now creates device with:
  - `tenantId: 'temp'`, `storeId: 'temp'` (updated on complete-pairing)
  - `appVersion: 'DEVICE_V2'` (explicitly set)
  - `pairingCode` generated
  - Returns `deviceId` + `pairingCode`

### Issue B: Heartbeat Schedule ✅
- **Fixed:** Heartbeat runs every 30 seconds via coroutine
- **Implementation:** `DeviceHeartbeatManager.start()` uses `delay(INTERVAL_MS)`

### Issue C: Heartbeat URL ✅
- **Verified:** Uses `POST {coreUrl}/api/device/heartbeat`
- **Logging:** `Log.d(TAG, "HEARTBEAT → $url")`

### Complete Pairing
- **Location:** `apps/core/cardbey-core/src/engines/device/completePairing.js`
- **Fixes:**
  - Creates device if not found (fallback)
  - Sets `appVersion: 'V2'` or preserves existing
  - Updates `tenantId` + `storeId`
  - Clears `pairingCode`
  - Sets `status: 'online'`

---

## 7. Core URL Validation

### Android App
- **Location:** `apps/dashboard/cardbey-marketing-dashboard/app/src/main/java/com/cardbey/slide/core/AppConfig.kt`
- **Logging:** `Log.i(TAG, "[DEVICE ENGINE] Using core URL: $url")`
- **Fallback:** Uses `BuildConfig.API_BASE_URL` if not stored
- **Build Config:** Updated to `http://192.168.1.3:3001` (matches dashboard)

### Build Configuration
- **Location:** `apps/dashboard/cardbey-marketing-dashboard/app/build.gradle.kts`
- **Debug URL:** `http://192.168.1.3:3001` (matches dashboard)
- **Note:** No fallback to 192.168.1.7, localhost, or cached values

### Diagnostic Screen
- Shows current Core URL
- "Show Core URL" button displays:
  - Current Core URL
  - Device ID
  - Build Config URL
  - Stored URL

---

## 8. Automated Connectivity Tests

### Endpoint: `/api/device/debug/run-all`
- Tests all critical backend services
- Returns comprehensive results
- Used by diagnostic screen

---

## Files Modified

### Backend (Core)
1. `apps/core/cardbey-core/src/routes/deviceEngine.js`
   - Added debug endpoints
   - Enhanced pairing/heartbeat logging
   - Added device list diagnostic logging

2. `apps/core/cardbey-core/src/realtime/deviceWebSocketHub.js`
   - Added WebSocket connection/disconnection logging

3. `apps/core/cardbey-core/src/engines/device/requestPairing.js`
   - Set `appVersion: 'DEVICE_V2'` explicitly

4. `apps/core/cardbey-core/src/engines/device/completePairing.js`
   - Ensures `appVersion` is set to 'V2'
   - Creates device if not found (fallback)

### Android App
1. `apps/dashboard/cardbey-marketing-dashboard/app/src/main/java/com/cardbey/slide/engine/DeviceHeartbeatManager.kt`
   - Added URL logging
   - Added retry logic (3 attempts)
   - Enhanced response logging

2. `apps/dashboard/cardbey-marketing-dashboard/app/src/main/java/com/cardbey/slide/ui/pair/PairTvActivity.kt`
   - Added pairing URL logging
   - Added retry logic (3 attempts)
   - Enhanced response logging

3. `apps/dashboard/cardbey-marketing-dashboard/app/src/main/java/com/cardbey/slide/engine/PlaylistEngine.kt`
   - Added playlist URL logging

4. `apps/dashboard/cardbey-marketing-dashboard/app/src/main/java/com/cardbey/slide/core/AppConfig.kt`
   - Added Core URL logging
   - Fallback to BuildConfig.API_BASE_URL

5. `apps/dashboard/cardbey-marketing-dashboard/app/src/main/java/com/cardbey/slide/ui/player/PlayerActivity.kt`
   - Added diagnostic tap detector (5 taps in top-left)

6. `apps/dashboard/cardbey-marketing-dashboard/app/src/main/java/com/cardbey/slide/ui/diagnostic/DeviceDiagnosticActivity.kt` (NEW)
   - Self-diagnostic screen
   - Tests all connectivity endpoints

7. `apps/dashboard/cardbey-marketing-dashboard/app/src/main/res/layout/activity_device_diagnostic.xml` (NEW)
   - Diagnostic screen layout

8. `apps/dashboard/cardbey-marketing-dashboard/app/src/main/AndroidManifest.xml`
   - Added DeviceDiagnosticActivity

9. `apps/dashboard/cardbey-marketing-dashboard/app/build.gradle.kts`
   - Updated API_BASE_URL to `http://192.168.1.3:3001`

---

## Testing Instructions

### 1. Backend Tests
```bash
# Test ping endpoint
curl http://192.168.1.3:3001/api/device/debug/ping

# Test run-all endpoint
curl http://192.168.1.3:3001/api/device/debug/run-all
```

### 2. Android Tablet Tests
1. **Build and install app:**
   ```bash
   cd apps/dashboard/cardbey-marketing-dashboard/app
   ./gradlew assembleDebug
   adb install -r app/build/outputs/apk/debug/app-debug.apk
   ```

2. **Open diagnostic screen:**
   - Launch PlayerActivity
   - Tap top-left corner 5 times quickly
   - Diagnostic screen opens automatically

3. **Verify logs:**
   ```bash
   adb logcat | grep -E "\[DeviceEngine|\[PAIRING|\[HEARTBEAT|\[WS\]|\[DEVICE"
   ```

4. **Check connectivity:**
   - Diagnostic screen shows pass/fail for each test
   - Backend logs show pairing/heartbeat requests
   - Dashboard shows device as online

### 3. Pairing Flow Test
1. Tablet requests pairing → Backend creates device with temp tenant/store
2. Dashboard completes pairing → Device updated with real tenant/store
3. Tablet sends heartbeat → Device appears in dashboard
4. Dashboard assigns playlist → Tablet receives playlist

### 4. Device List Test
1. Pair device from dashboard
2. Check backend logs for `[DEVICE LIST]` entries
3. If 0 devices found, check diagnostic query output
4. Verify tenantId/storeId match

---

## Key Fixes Summary

✅ **Backend:**
- Added diagnostic endpoints (`/api/device/debug/ping`, `/api/device/debug/run-all`)
- Enhanced logging for pairing, heartbeat, WebSocket, device list
- Fixed pairing to set `appVersion: 'DEVICE_V2'`
- Fixed complete-pairing to ensure device is created/updated correctly

✅ **Android:**
- Added comprehensive logging (PAIR →, HEARTBEAT →, PLAYLIST →)
- Added retry logic (3 attempts with exponential backoff)
- Added diagnostic screen (tap 5 times in top-left)
- Verified heartbeat runs every 30 seconds
- Verified heartbeat URL is correct
- Added Core URL logging and validation

✅ **Connectivity:**
- Core URL set to `http://192.168.1.3:3001` (matches dashboard)
- No fallback to wrong IPs
- Diagnostic screen shows current URL

---

## Next Steps

1. **Test pairing flow:**
   - Tablet requests pairing
   - Dashboard completes pairing
   - Verify device appears in dashboard

2. **Test heartbeat:**
   - Verify heartbeat logs appear every 30 seconds
   - Check device appears as online in dashboard

3. **Test diagnostic screen:**
   - Tap 5 times in top-left corner
   - Verify all tests pass

4. **Monitor logs:**
   - Backend: Check for `[PAIRING]`, `[HEARTBEAT]`, `[WS]`, `[DEVICE LIST]` logs
   - Android: Check for `[DeviceEngine V2]` logs

---

## Known Issues & Notes

- **Device List:** If still showing 0 devices, check diagnostic query output in logs
- **Core URL:** Ensure both dashboard and tablet use same IP (`192.168.1.3:3001`)
- **Heartbeat:** Runs every 30 seconds - check logs if not appearing
- **Pairing:** Device created with temp tenant/store, updated on complete-pairing

---

**Status:** ✅ All fixes implemented and ready for testing

---

## Media URL Auto-Healing Middleware

### Overview

A read-time URL normalization layer that automatically fixes old media URLs (e.g., with host `192.168.1.12`) when responses are returned, so frontends and device players always see correct URLs even if the DB still contains the old host.

**Location:** `src/utils/normalizeMediaUrl.js`

### How It Works

1. **OLD_HOSTS List:**
   - `http://192.168.1.12:3001`
   - `http://192.168.1.7:3001`
   - `https://192.168.1.12:3001`
   - `https://192.168.1.7:3001`

2. **URL Rewriting on Read:**
   - If a URL starts with any OLD_HOSTS[i], replace that prefix with the current `coreBaseUrl`
   - If a URL starts with `/uploads/` or `/assets/`, prefix with `coreBaseUrl`
   - Otherwise return URL unchanged
   - When a URL is modified, log: `[MEDIA_URL_FIX] { from: oldUrl, to: newUrl }`

3. **Applied To:**
   - Device playlist endpoint: `GET /api/device/:deviceId/playlist/full`
   - Screen playlist endpoint: `GET /api/screens/:id/playlist/full`
   - Signage assets list: `GET /api/signage-assets`
   - Signage playlists: `GET /api/signage-playlists/:playlistId`

4. **Normalized Fields:**
   - `url`, `originalUrl`, `normalizedUrl`, `safeUrl`
   - `thumbnailUrl`, `previewUrl`, `screenshotUrl`, `optimizedUrl`
   - Nested `media`, `asset`, `video` objects

### Long-Term Fix

While this middleware provides immediate relief, the long-term fix is still to run the database migration script:

```bash
npm run fix-media-urls
```

This updates the database records themselves, so the middleware becomes a no-op for already-fixed URLs.

### Testing

1. Seed (or keep) at least one media record with `originalUrl` starting with `http://192.168.1.12:3001`
2. Call:
   - `GET /api/signage-assets`
   - `GET /api/device/<deviceId>/playlist/full`
   - `GET /api/screens/<screenId>/playlist/full`
3. Verify responses now return URLs starting with `http://192.168.1.3:3001` (or current core base URL)
4. Confirm that the dashboard ScreenPreview and device player can load and play videos with no "Skipping previously failed URL" errors

