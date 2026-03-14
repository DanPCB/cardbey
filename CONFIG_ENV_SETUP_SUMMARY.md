# Configuration & Environment Setup - Summary

## Changes Made

### ✅ Backend Documentation Updated

1. **`apps/core/cardbey-core/docs/ENVIRONMENT_VARIABLES.md`**
   - Added `PUBLIC_API_BASE_URL` as primary variable (with `PUBLIC_BASE_URL` as fallback)
   - Updated all examples to use `PUBLIC_API_BASE_URL`
   - Added development example: `PUBLIC_API_BASE_URL=http://192.168.1.12:3001`
   - Updated troubleshooting section

2. **`apps/core/cardbey-core/docs/BACKEND_ENVIRONMENT_CONFIG.md`**
   - Updated all environment examples to use `PUBLIC_API_BASE_URL`
   - Added local IP example for development

### ✅ Android App Configuration Updated

**`apps/dashboard/cardbey-marketing-dashboard/app/build.gradle.kts`**
- Updated debug build to use: `API_BASE_URL=http://192.168.1.12:3001`
- Added comment explaining to replace IP with actual local IP
- Changed from `http://10.0.2.2:5174/` (emulator-only) to `http://192.168.1.12:3001` (network-accessible)

### ✅ Created Setup Guide

**`VIDEO_PLAYBACK_CONFIG_SETUP.md`**
- Complete step-by-step setup instructions
- Troubleshooting guide
- Configuration checklist
- Quick reference commands

---

## Next Steps

### 1. Create Backend `.env` File

**Note:** `.env` files are gitignored, so you need to create it manually:

```bash
cd apps/core/cardbey-core
```

Create `.env` file with this content:

```bash
# Cardbey Core Environment Configuration

# CRITICAL - Required for video playback
PUBLIC_API_BASE_URL=http://192.168.1.12:3001

# Database
DATABASE_URL=file:./prisma/dev.db
# Or for PostgreSQL:
# DATABASE_URL=postgresql://user:password@host:5432/database

# JWT Secret (generate with: openssl rand -hex 32)
JWT_SECRET=dev-secret-change-in-production-generate-secure-random-string-here

# Node Environment
NODE_ENV=development

# CORS
ALLOWED_ORIGINS=http://localhost:5174,http://127.0.0.1:5174
```

**Important:** Replace `192.168.1.12` with your machine's actual local IP address.

### 2. Find Your Local IP Address

**Windows:**
```powershell
ipconfig | findstr "IPv4"
```

**macOS/Linux:**
```bash
ifconfig | grep "inet " | grep -v 127.0.0.1
```

### 3. Update Android App IP

Edit `apps/dashboard/cardbey-marketing-dashboard/app/build.gradle.kts` and replace `192.168.1.12` with your actual IP in the debug build configuration.

### 4. Restart Backend

After creating/updating `.env`:
```bash
# Stop current server (Ctrl+C)
# Then restart:
cd apps/core/cardbey-core
npm start
```

### 5. Rebuild Android App

After updating `build.gradle.kts`:
```bash
cd apps/dashboard/cardbey-marketing-dashboard/app
./gradlew clean
./gradlew assembleDebug
```

### 6. Install & Test

```bash
# Install rebuilt APK
adb install app/build/outputs/apk/debug/app-debug.apk

# Test connectivity
curl http://192.168.1.12:3001/api/health
```

---

## Verification Checklist

- [ ] Backend `.env` created with `PUBLIC_API_BASE_URL=http://YOUR_IP:3001`
- [ ] Android `build.gradle.kts` updated with `API_BASE_URL=http://YOUR_IP:3001` (same IP)
- [ ] Backend restarted
- [ ] Android app rebuilt
- [ ] Device can connect to backend
- [ ] Playlist fetch succeeds
- [ ] Video URLs show correct IP in backend logs
- [ ] Video playback works

---

## Key Points

1. **Both must match:** `PUBLIC_API_BASE_URL` in backend `.env` must match `API_BASE_URL` in Android `build.gradle.kts`
2. **Use local IP:** For development, use your machine's local IP (not `localhost` or `127.0.0.1`)
3. **Same network:** Device and backend machine must be on the same network
4. **Restart required:** Backend must be restarted after `.env` changes
5. **Rebuild required:** Android app must be rebuilt after `build.gradle.kts` changes

---

## Documentation Files

- **Setup Guide:** `VIDEO_PLAYBACK_CONFIG_SETUP.md` - Complete setup instructions
- **Environment Variables:** `apps/core/cardbey-core/docs/ENVIRONMENT_VARIABLES.md` - All env vars documented
- **Backend Config:** `apps/core/cardbey-core/docs/BACKEND_ENVIRONMENT_CONFIG.md` - Backend-specific config




































