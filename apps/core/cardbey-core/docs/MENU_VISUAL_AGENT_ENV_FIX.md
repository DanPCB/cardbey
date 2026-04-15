# MenuVisualAgent Feature Flag Fix - Summary

**Issue:** Feature flag `menu_visual_agent_v1` stayed `false` in local dev  
**Root Cause:** Environment variables not loaded reliably (relied on `process.cwd()`)  
**Solution:** Shared env loader with explicit paths

---

## ✅ Changes Made

### **1. Created Shared Env Loader** (`src/env/loadEnv.ts`)

**Features:**
- ✅ Explicit file paths (not relying on `process.cwd()`)
- ✅ Loads `.env.local` (highest priority) then `.env`
- ✅ Robust boolean parsing: `true`, `1`, `yes`, `on` → `true`
- ✅ Debug logging in dev mode
- ✅ Auto-loads on import

**File Paths:**
- `apps/core/cardbey-core/.env.local` (if exists)
- `apps/core/cardbey-core/.env` (if exists)
- Falls back to `process.env` (system environment)

---

### **2. Updated Entry Points**

**Files Modified:**
- `src/server.js` - Replaced `import 'dotenv/config'` with `import './env/loadEnv.js'`
- `src/worker.js` - Replaced `import 'dotenv/config'` with `import './env/loadEnv.js'`

**Result:** Both API server and worker use the same env loader

---

### **3. Updated Feature Flag Logic**

**Files Modified:**
- `src/routes/home.js` - Uses `getFeatureFlag('ENABLE_MENU_VISUAL_AGENT', false)`
- `src/engines/menu/configureMenu.js` - Robust boolean parsing
- `src/routes/menuRoutes.js` - Robust boolean parsing
- `src/services/menuVisualAgent/featureFlag.ts` - Robust boolean parsing

**Result:** Feature flag parsing is consistent across all code paths

---

### **4. Updated Documentation**

**Files Updated:**
- `docs/MENU_VISUAL_AGENT_ENV_VARS.md` - Added env file location, worker instructions
- `docs/MENU_VISUAL_AGENT_TESTING_GUIDE.md` - Added troubleshooting, env file location
- `docs/MENU_VISUAL_AGENT_QUICK_START.md` - New quick start guide

---

## 🔍 How It Works

### **Environment Loading Flow:**

```
1. Server/Worker starts
   ↓
2. Imports src/env/loadEnv.js
   ↓
3. loadEnv() auto-executes
   ↓
4. Resolves project root: apps/core/cardbey-core/
   ↓
5. Tries to load:
   - .env.local (if exists, highest priority)
   - .env (if exists)
   ↓
6. Logs loaded/missing files (dev mode only)
   ↓
7. process.env now contains loaded variables
```

### **Feature Flag Resolution:**

```
1. API endpoint /api/v2/flags called
   ↓
2. Calls getFeatureFlag('ENABLE_MENU_VISUAL_AGENT', false)
   ↓
3. Reads process.env.ENABLE_MENU_VISUAL_AGENT
   ↓
4. Parses with parseBoolean():
   - "true", "1", "yes", "on" → true
   - Everything else → false
   ↓
5. Logs parsed value (dev mode only)
   ↓
6. Returns boolean to frontend
```

---

## 📝 Verification Checklist

### **Step 1: Create `.env` File**

```bash
cd apps/core/cardbey-core
# Create .env if it doesn't exist
echo "ENABLE_MENU_VISUAL_AGENT=true" > .env
```

**Verify:**
- [ ] File exists at: `apps/core/cardbey-core/.env`
- [ ] Contains: `ENABLE_MENU_VISUAL_AGENT=true` (or `1`, `yes`, `on`)

---

### **Step 2: Restart Backend Services**

**Terminal 1 - API Server:**
```bash
cd apps/core/cardbey-core
npm run dev:api
```

**Look for:**
```
[EnvLoader] Project root: C:\Projects\cardbey\apps\core\cardbey-core
[EnvLoader] ✅ Loaded env files: [ 'C:\\...\\cardbey-core\\.env' ]
[EnvLoader] Feature flag ENABLE_MENU_VISUAL_AGENT: { parsed: true, ... }
```

**Terminal 2 - Worker:**
```bash
cd apps/core/cardbey-core
npm run dev:worker
```

**Look for:**
```
[EnvLoader] Project root: C:\Projects\cardbey\apps\core\cardbey-core
[EnvLoader] ✅ Loaded env files: [ 'C:\\...\\cardbey-core\\.env' ]
✅ Starting menu image generation worker (30s polling)...
```

**Verify:**
- [ ] API server shows `[EnvLoader]` logs
- [ ] Worker shows `[EnvLoader]` logs
- [ ] Feature flag parsed as `true` in logs

---

### **Step 3: Check Backend Endpoint**

**Visit:** `http://localhost:3001/api/v2/flags`

**Expected Response:**
```json
{
  "menu_visual_agent_v1": true,
  ...
}
```

**Verify:**
- [ ] `menu_visual_agent_v1` is `true` (not `false`)

---

### **Step 4: Check Frontend**

**Open Browser Console:**
- Navigate to: `http://localhost:5174`
- Check console for: `[FeatureFlags] Initialized: { ..., menu_visual_agent_v1: true }`

**Verify:**
- [ ] Frontend shows `menu_visual_agent_v1: true`

---

### **Step 5: Test Job Queue**

1. **Go to Menu Page:** `http://localhost:5174/menu`
2. **Upload Menu Photo:** Extract menu items
3. **Check Worker Console:** Should see `[ImageGenerationJob] Queued job...`

**Verify:**
- [ ] Job is queued after menu OCR
- [ ] Worker processes job within 30-60 seconds
- [ ] Images appear on menu items (if API keys configured)

---

## 🐛 Troubleshooting

### **Issue: Flag Still `false`**

**Check:**
1. `.env` file location: Must be in `apps/core/cardbey-core/` (not dashboard)
2. File content: Must have `ENABLE_MENU_VISUAL_AGENT=true` (or `1`, `yes`, `on`)
3. Server restarted: Both API and worker must be restarted after changing `.env`
4. Check logs: Look for `[EnvLoader]` logs in both API and worker consoles

**Debug:**
```bash
# Check if .env file exists
cd apps/core/cardbey-core
Test-Path .env

# Check file contents
Get-Content .env | Select-String "MENU_VISUAL"
```

---

### **Issue: No `[EnvLoader]` Logs**

**Possible Causes:**
1. Import path wrong in `server.js` or `worker.js`
2. TypeScript file not compiling (check for errors)
3. `NODE_ENV=production` (logs only in dev mode)

**Fix:**
- Verify imports: `import './env/loadEnv.js'` in both files
- Check for TypeScript compilation errors
- Ensure `NODE_ENV` is not set to `production`

---

### **Issue: Worker Not Processing Jobs**

**Check:**
1. Worker is running: `npm run dev:worker`
2. Worker logs show: `✅ Starting menu image generation worker`
3. Jobs are queued: Check `[ImageGenerationJob] Queued job...` logs

**Fix:**
- Start worker in separate terminal
- Check for errors in worker console
- Verify worker imports `loadEnv.js` correctly

---

## 📊 Code Changes Summary

**New Files:**
- `src/env/loadEnv.ts` - Shared env loader

**Modified Files:**
- `src/server.js` - Uses shared env loader
- `src/worker.js` - Uses shared env loader
- `src/routes/home.js` - Uses `getFeatureFlag()` helper
- `src/engines/menu/configureMenu.js` - Robust boolean parsing
- `src/routes/menuRoutes.js` - Robust boolean parsing
- `src/services/menuVisualAgent/featureFlag.ts` - Robust boolean parsing

**Documentation:**
- `docs/MENU_VISUAL_AGENT_ENV_VARS.md` - Updated with env file location
- `docs/MENU_VISUAL_AGENT_TESTING_GUIDE.md` - Updated with troubleshooting
- `docs/MENU_VISUAL_AGENT_QUICK_START.md` - New quick start guide

---

## ✅ Success Criteria

**Feature flag is working correctly if:**

1. ✅ `.env` file exists in `apps/core/cardbey-core/`
2. ✅ Both API and worker show `[EnvLoader]` logs on startup
3. ✅ Backend `/api/v2/flags` returns `menu_visual_agent_v1: true`
4. ✅ Frontend console shows `menu_visual_agent_v1: true`
5. ✅ Jobs queue after menu OCR
6. ✅ Worker processes jobs (if running)

---

**Ready to test?** Follow the verification checklist above step by step.

