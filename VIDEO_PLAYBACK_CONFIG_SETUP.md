# Video Playback Configuration Setup Guide

## Overview

This guide explains how to configure `PUBLIC_API_BASE_URL` in the backend and `API_BASE_URL` in the Android device app to ensure video playback works correctly.

---

## Step 1: Backend Configuration

### 1.1 Create `.env` File

Copy the example file and create your `.env`:

```bash
cd apps/core/cardbey-core
cp .env.example .env
```

### 1.2 Set PUBLIC_API_BASE_URL

Edit `.env` and set `PUBLIC_API_BASE_URL` to your backend's accessible URL:

**For Local Development (Devices on Same Network):**
```bash
PUBLIC_API_BASE_URL=http://192.168.1.12:3001
```

**Important:** Replace `192.168.1.12` with your machine's actual local IP address.

**To find your local IP:**
- **Windows:** Run `ipconfig` and look for "IPv4 Address" under your active network adapter
- **macOS/Linux:** Run `ifconfig` or `ip addr` and look for your local network IP (usually starts with `192.168.` or `10.0.`)

**For Production:**
```bash
PUBLIC_API_BASE_URL=https://cardbey-core.onrender.com
```

### 1.3 Restart Backend

After updating `.env`, restart the backend server:

```bash
# Stop the current server (Ctrl+C)
# Then restart:
npm start
# Or if using PM2:
pm2 restart cardbey-core
```

---

## Step 2: Android Device App Configuration

### 2.1 Update build.gradle.kts

Edit `apps/dashboard/cardbey-marketing-dashboard/app/build.gradle.kts`:

**For Debug Build (Local Development):**
```kotlin
getByName("debug") {
    // Use the SAME IP address as PUBLIC_API_BASE_URL in backend .env
    buildConfigField("String", "API_BASE_URL", "\"http://192.168.1.12:3001\"")
    buildConfigField("String", "PAIR_BASE_URL", "\"https://dev.app.cardbey.com/pair\"")
    buildConfigField("String", "STREAM_KEY", "\"DEV_TV_KEY\"")
}
```

**Important:** The `API_BASE_URL` in the Android app **MUST match** `PUBLIC_API_BASE_URL` in the backend `.env` file.

### 2.2 Rebuild Android App

After updating `build.gradle.kts`, rebuild the app:

```bash
cd apps/dashboard/cardbey-marketing-dashboard/app
./gradlew clean
./gradlew assembleDebug
```

Or in Android Studio:
1. **Build** → **Clean Project**
2. **Build** → **Rebuild Project**

### 2.3 Install on Device

Install the rebuilt APK on your tablet/TV device:

```bash
adb install app/build/outputs/apk/debug/app-debug.apk
```

---

## Step 3: Verification & Testing

### 3.1 Verify Backend Configuration

Check that backend is using the correct URL:

```bash
# Check backend logs on startup
# Should see: [publicUrl] Using PUBLIC_API_BASE_URL: http://192.168.1.12:3001

# Or check health endpoint
curl http://192.168.1.12:3001/api/health
```

### 3.2 Verify Playlist URLs

Trigger a playlist fetch and check backend logs:

1. **Pair the device** (if not already paired)
2. **Assign a playlist** to the device from dashboard
3. **Check backend logs** - should show playlist URLs built with `192.168.1.12:3001`:

```
[deviceEngine] Building playlist URL: http://192.168.1.12:3001/uploads/media/video.mp4
```

### 3.3 Verify Device App

On the device, check the debug overlay (if available):

1. **Launch the app** on device
2. **Check debug overlay** - should show:
   ```
   url=http://192.168.1.12:3001/uploads/media/...
   ```

### 3.4 Test Video Playback

1. **Ensure playlist has videos** assigned
2. **Device should automatically fetch playlist**
3. **Video should play successfully**

**If video doesn't play:**
- Check device logs: `adb logcat | grep -i "exoplayer\|playlist\|video"`
- Check backend logs for playlist fetch requests
- Verify URLs in playlist response match `PUBLIC_API_BASE_URL`

---

## Troubleshooting

### Issue: "Cannot connect to backend"

**Symptoms:**
- Device shows "Connection failed" or "Network error"
- Backend logs show no requests from device

**Solutions:**
1. **Verify IP addresses match:**
   - Backend `.env`: `PUBLIC_API_BASE_URL=http://192.168.1.12:3001`
   - Android `build.gradle.kts`: `API_BASE_URL=http://192.168.1.12:3001`
   - Both must use the **exact same IP address**

2. **Check firewall:**
   - Ensure port 3001 is open on your machine
   - Windows: Check Windows Firewall settings
   - macOS/Linux: Check `ufw` or `iptables` rules

3. **Verify network:**
   - Device and backend machine must be on the **same network**
   - Test connectivity: `ping 192.168.1.12` from device (if possible)
   - Or test from another device: `curl http://192.168.1.12:3001/api/health`

### Issue: "Video URLs are malformed"

**Symptoms:**
- Playlist fetch succeeds but videos don't play
- ExoPlayer shows "404 Not Found" errors
- URLs in playlist are relative paths like `/uploads/video.mp4`

**Solutions:**
1. **Verify `PUBLIC_API_BASE_URL` is set:**
   ```bash
   # Check backend .env file
   grep PUBLIC_API_BASE_URL apps/core/cardbey-core/.env
   ```

2. **Check backend logs:**
   - Should NOT see: `[publicUrl] PUBLIC_BASE_URL not set in production!`
   - Should see: `[publicUrl] Using PUBLIC_API_BASE_URL: http://192.168.1.12:3001`

3. **Restart backend** after changing `.env`

### Issue: "Video plays but URLs are wrong"

**Symptoms:**
- Videos play but URLs show `localhost:3001` or `10.0.2.2:5174`
- Device can't access videos because URL is wrong

**Solutions:**
1. **Backend `.env` must use device-accessible IP:**
   ```bash
   # ❌ Wrong (only accessible from same machine):
   PUBLIC_API_BASE_URL=http://localhost:3001
   
   # ✅ Correct (accessible from network):
   PUBLIC_API_BASE_URL=http://192.168.1.12:3001
   ```

2. **Android app must match backend:**
   ```kotlin
   // ❌ Wrong (emulator-only address):
   buildConfigField("String", "API_BASE_URL", "\"http://10.0.2.2:5174/\"")
   
   // ✅ Correct (matches backend):
   buildConfigField("String", "API_BASE_URL", "\"http://192.168.1.12:3001\"")
   ```

### Issue: "Backend restarted but still using old URL"

**Solutions:**
1. **Ensure `.env` file is in correct location:**
   - Should be: `apps/core/cardbey-core/.env`
   - Not: `apps/core/.env` or `.env` in root

2. **Check environment variable loading:**
   - Backend uses `dotenv` package
   - Ensure `.env` file is loaded before server starts

3. **Verify no hardcoded URLs:**
   - Search codebase: `grep -r "localhost:3001" apps/core/cardbey-core/src`
   - Should only find in `.env.example` or documentation

---

## Configuration Checklist

### Backend Setup
- [ ] Created `.env` file from `.env.example`
- [ ] Set `PUBLIC_API_BASE_URL=http://192.168.1.12:3001` (with your IP)
- [ ] Restarted backend server
- [ ] Verified backend logs show correct URL
- [ ] Tested health endpoint: `curl http://192.168.1.12:3001/api/health`

### Android App Setup
- [ ] Updated `build.gradle.kts` debug build with correct IP
- [ ] `API_BASE_URL` matches `PUBLIC_API_BASE_URL` exactly
- [ ] Rebuilt app: `./gradlew clean assembleDebug`
- [ ] Installed rebuilt APK on device

### Testing
- [ ] Device can pair successfully
- [ ] Playlist fetch succeeds
- [ ] Backend logs show URLs with correct IP
- [ ] Video playback works
- [ ] Debug overlay (if available) shows correct URLs

---

## Quick Reference

### Find Your Local IP Address

**Windows:**
```powershell
ipconfig | findstr "IPv4"
```

**macOS/Linux:**
```bash
ifconfig | grep "inet " | grep -v 127.0.0.1
# Or:
ip addr show | grep "inet " | grep -v 127.0.0.1
```

### Test Backend Accessibility

From another device on the same network:
```bash
curl http://192.168.1.12:3001/api/health
```

### Check Backend Configuration

```bash
# View current .env (without exposing secrets)
grep PUBLIC_API_BASE_URL apps/core/cardbey-core/.env
```

### Check Android App Configuration

```bash
# View build.gradle.kts API_BASE_URL
grep -A 2 "API_BASE_URL" apps/dashboard/cardbey-marketing-dashboard/app/build.gradle.kts
```

---

## Summary

**Critical Requirements:**
1. ✅ Backend `.env` has `PUBLIC_API_BASE_URL=http://192.168.1.12:3001` (your IP)
2. ✅ Android `build.gradle.kts` has `API_BASE_URL=http://192.168.1.12:3001` (same IP)
3. ✅ Both use the **exact same IP address**
4. ✅ Backend restarted after `.env` changes
5. ✅ Android app rebuilt after `build.gradle.kts` changes

**After Changes:**
- Restart backend
- Rebuild/reload Device app
- Trigger playlist fetch
- Verify URLs in backend logs show `192.168.1.12:3001`
- Verify video plays successfully




































