# TV Device V2 — BUFFERING Truth Report

**Symptom:** Playlist loads, heartbeat healthy, API reachable, no ExoPlayer error — but state stays `BUFFERING`, `playing=false`, watchdog fires *"Playback did not render within 5s"*.

**Date:** 2026-06-14  
**Scope:** Android `PlayerActivity` + Core `playlist/full` + `/uploads` static serving

---

## Truth matrix (check logcat + Core logs)

| Check | How to verify | Expected if healthy |
|-------|---------------|---------------------|
| **URL reachable?** | logcat `[MediaDiagnostics] HEAD … → status=` | `YES` — HTTP 200/206 |
| **Range requests work?** | logcat `RANGE … → status=206` | `YES` — 206 + `Content-Range` |
| **Codec compatible?** | logcat `[MediaDiagnostics] CODEC … compatible=YES` | `YES` — H.264 + AAC |
| **Host mismatch?** | logcat `Host mismatch` or Core `[PLAYLIST_HOST_MISMATCH]` | `NO` — same host as API |

Filter logcat: `DeviceEngine V2`, `MediaDiagnostics`, `PLAYBACK_STATE_CHANGED`

Filter Core: `PLAYLIST_MEDIA_FINAL_URL`, `PLAYLIST_HOST_MISMATCH`, `[media-video]`

---

## Root cause analysis (ranked by likelihood)

### 1. Stale LAN IP in media URL (HIGH)

**What:** DB stores absolute URL like `http://192.168.1.11:3001/uploads/...` but TV talks to API at `http://192.168.1.12:3001`. Core rewrites path to current `DEVICE_PUBLIC_BASE_URL`, but if `DEVICE_PUBLIC_BASE_URL` is unset or wrong, URLs point at unreachable host.

**Evidence:**
- Playlist API works (same host as heartbeat)
- ExoPlayer buffers forever (HTTP connection to media host hangs/fails without surfacing error immediately)
- No `onPlayerError` if connection stalls

**Fix:**
```bash
# Core .env (Render or LAN)
DEVICE_PUBLIC_BASE_URL=http://<reachable-lan-ip>:3001
# or production:
DEVICE_PUBLIC_BASE_URL=https://cardbey-core-staging.onrender.com
```
Redeploy Core. Confirm `[PLAYLIST_MEDIA_FINAL_URL]` shows same host as TV `apiBaseUrl`.

---

### 2. Optimized video 404 on Render (HIGH on staging)

**What:** `MEDIA` playlists prefer `optimizedUrl` when `isOptimized=true`. On Render, `/uploads/optimized/*` lives on **ephemeral disk** — files vanish after redeploy → ExoPlayer buffers against 404 JSON body.

**Evidence:** Core log `[UPLOADS] Optimized file not found`

**Fix:**
- `playlist/full` now includes `fallbackUrl` (original upload) when optimized is selected
- Re-upload video or run `npm run backfill:ios-video:apply` / re-transcode
- Long-term: store optimized derivatives on persistent disk or R2/CDN

---

### 3. Missing `DEVICE_PUBLIC_BASE_URL` (HIGH on LAN)

**What:** `resolvePlaylistMediaBaseUrl` returns `null` → items dropped or URLs null.

**Evidence:** Core `[playlist/full missing DEVICE_PUBLIC_BASE_URL]`

**Fix:** Set env var to the IP/hostname the **TV browser/ExoPlayer** can reach (not `localhost`).

---

### 4. Codec incompatible — HEVC/H.265, non-faststart MP4 (MEDIUM)

**What:** TV ExoPlayer decoders require H.264 (avc1) + AAC for broad compatibility. HEVC, 10-bit, or `moov` at end causes infinite buffer.

**Evidence:** logcat `CODEC … compatible=NO` with `video=hevc`

**Fix:**
- Upload path already runs `ensureWebCompatibleVideoBuffer` (H.264/AAC/faststart)
- Legacy files: `node scripts/backfill-ios-video-derivatives.mjs --apply`
- On Render: ensure `VIDEO_UPLOAD_SKIP_TRANSCODE` is not `true` for device-bound uploads

---

### 5. Range / CORS headers (LOW if same-origin)

**What:** ExoPlayer needs `Accept-Ranges: bytes` and 206 responses.

**Status:** Core serves explicit 206 for `/uploads/media/*`; general `/uploads` static sets `Accept-Ranges` via `uploadsStatic.js`. Compression disabled for `/uploads`.

**Verify:** Diagnostic HEAD + Range probe in logcat.

---

### 6. Dead `DataSourceFactory` (FIXED in this patch)

**What:** `DefaultHttpDataSourceFactory` was built but never passed to ExoPlayer — defaults used instead.

**Fix:** `DefaultMediaSourceFactory(dataSourceFactory)` wired in `ExoPlayer.Builder`.

---

## Diagnostics added (this patch)

### Android (`MediaPlaybackDiagnostics.kt`)
- HEAD: HTTP status, `Content-Length`, all response headers
- GET `Range: bytes=0-1`: 206 check
- API host vs media host comparison + stale LAN detection
- Truth report JSON → heartbeat `playbackReport.truthReport`

### Android (`PlayerActivity.kt`)
- ExoPlayer state log: `STATE_IDLE|BUFFERING|READY|ENDED`
- `playbackSuppressionReason`, `videoSize`, `playWhenReady`
- `onTracksChanged` → codec log (container, video/audio codec, resolution)
- **5s render watchdog:** `"Playback did not render within 5s"`
- Skip item if HEAD probe fails (unreachable URL)
- `DefaultMediaSourceFactory` wired

### Core (`deviceProjection.js`)
- `[PLAYLIST_HOST_MISMATCH]` when stored absolute URL host ≠ `mediaBase` host

### Core (`deviceEngine.js`)
- `fallbackUrl` on MEDIA video items when optimized URL differs from original

---

## Exact fix checklist

1. **Set `DEVICE_PUBLIC_BASE_URL`** on Core to the URL the TV can open in a browser.
2. **Manual Deploy Core** (after pipeline minutes restored).
3. **Rebuild & install TV APK** with this diagnostic patch.
4. **Pair device**, play playlist, capture logcat:
   ```bash
   adb logcat -s "DeviceEngine V2" MediaDiagnostics PLAYBACK_STATE_CHANGED
   ```
5. Read truth report line in logcat — address first `NO`:
   - URL reachable **NO** → fix host/DNS/firewall
   - Range **NO** → check Core `/uploads` route / CDN CORS
   - Codec **NO** → re-upload or run transcode backfill
   - Host mismatch **YES** → fix `DEVICE_PUBLIC_BASE_URL` + clear stale DB URLs

6. **Hidden diagnostic screen:** tap top-left 5× on player → runs API tests; after patch, also probes first video URL.

---

## Example truth report (logcat)

```
[MediaDiagnostics] === PLAYBACK TRUTH REPORT ===
[MediaDiagnostics] URL reachable? NO | Range requests work? NO | Host mismatch? YES | err=HEAD failed: timeout
[MediaDiagnostics] Host mismatch: api=192.168.1.12 media=192.168.1.11 staleLan=true
```

**Root cause:** Stale LAN IP in stored media URL / wrong `DEVICE_PUBLIC_BASE_URL`.  
**Exact fix:** `DEVICE_PUBLIC_BASE_URL=http://192.168.1.12:3001`, redeploy, verify `PLAYLIST_MEDIA_FINAL_URL` host matches.

---

## Files changed

| File | Change |
|------|--------|
| `app/.../MediaPlaybackDiagnostics.kt` | NEW — HTTP/range/host/codec truth probes |
| `app/.../PlayerActivity.kt` | ExoPlayer diagnostics, 5s watchdog, media probe before play |
| `app/.../PlaybackReportRegistry.kt` | Extended heartbeat playback report |
| `apps/core/.../deviceProjection.js` | Host mismatch warning |
| `apps/core/.../deviceEngine.js` | `fallbackUrl` for optimized videos |
