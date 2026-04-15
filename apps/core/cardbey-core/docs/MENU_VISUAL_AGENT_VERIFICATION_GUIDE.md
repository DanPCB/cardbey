# ✅ MenuVisualAgent Feature Flag - Verification Guide

**Quick Reference:** Where to check if the feature flag is `true`

---

## 🔍 Backend Verification

### **Location 1: API Endpoint (Easiest)**

**URL:** `http://localhost:3001/api/v2/flags`

**How to Check:**
1. Open browser
2. Navigate to: `http://localhost:3001/api/v2/flags`
3. Look for: `"menu_visual_agent_v1": true`

**Expected Response:**
```json
{
  "menu_visual_agent_v1": true  ← Should be true
}
```

**If `false`:**
- Check `.env` file exists in `apps/core/cardbey-core/`
- Check `.env` contains `ENABLE_MENU_VISUAL_AGENT=true`
- Restart API server

---

### **Location 2: Backend Console Logs**

**Where:** Terminal running `npm run dev:api` or `npm run dev`

**Look for these logs on startup:**
```
[EnvLoader] Project root: C:\Projects\cardbey\apps\core\cardbey-core
[EnvLoader] ✅ Loaded env files: [ 'C:\\...\\cardbey-core\\.env' ]
[EnvLoader] Feature flag ENABLE_MENU_VISUAL_AGENT: {
  envKey: 'ENABLE_MENU_VISUAL_AGENT',
  envValue: 'true',
  parsed: true,  ← Should be true
  defaultValue: false
}
```

**If logs are missing:**
- Check import in `src/server.js`: `import './env/loadEnv.js'`
- Check for TypeScript compilation errors

---

### **Location 3: Verification Script**

**Run:**
```bash
cd apps/core/cardbey-core
npm run verify:feature-flag
```

**Expected Output:**
```
╔══════════════════════════════════════════════╗
║  MenuVisualAgent Feature Flag Verification  ║
╚══════════════════════════════════════════════╝

Feature Flag Status:
  ENABLE_MENU_VISUAL_AGENT: true
  Parsed Value: ✅ TRUE

✅ Feature is ENABLED
   - Backend should return menu_visual_agent_v1: true
   - Frontend should show menu_visual_agent_v1: true
   - Image generation jobs will be queued after menu OCR
```

---

## 🎨 Frontend Verification

### **Location 1: Browser Console (Easiest)**

**Steps:**
1. Open dashboard: `http://localhost:5174`
2. Press `F12` (or Right-click → Inspect)
3. Go to **Console** tab
4. Look for this log (appears on page load):

```
[FeatureFlags] Initialized: {
  enableSSE: true,
  enableV2API: true,
  enableFeaturedSubmissions: true,
  business_builder_v1: true,
  menu_visual_agent_v1: true,  ← Should be true
  EXPERIMENTS: {...}
}
```

**If `false`:**
- Backend flag is `false` (check backend first)
- Frontend cache issue (hard refresh: `Ctrl+Shift+R`)
- Feature flags not reloaded (restart dashboard dev server)

---

### **Location 2: Network Tab**

**Steps:**
1. Open dashboard: `http://localhost:5174`
2. Press `F12` → **Network** tab
3. Filter by: `flags` or `v2`
4. Find request: `GET /api/v2/flags` or `GET /v2/flags`
5. Click on the request
6. Go to **Response** tab
7. Look for: `"menu_visual_agent_v1": true`

**If request fails:**
- Backend not running
- CORS issue
- Wrong API URL

---

### **Location 3: React DevTools (Advanced)**

**Steps:**
1. Install React DevTools browser extension
2. Open dashboard
3. Open React DevTools
4. Find `AppShell` or root component
5. Check props/state for feature flags

**Note:** This is advanced and usually not needed.

---

## 📊 Visual Verification Checklist

### **Backend ✅**
- [ ] API endpoint `http://localhost:3001/api/v2/flags` returns `menu_visual_agent_v1: true`
- [ ] Backend console shows `[EnvLoader] Feature flag ... parsed: true`
- [ ] Verification script shows `✅ TRUE`

### **Frontend ✅**
- [ ] Browser console shows `menu_visual_agent_v1: true` in `[FeatureFlags] Initialized`
- [ ] Network tab shows `menu_visual_agent_v1: true` in response
- [ ] Regenerate button appears on menu items (if feature enabled)

---

## 🐛 Troubleshooting

### **Backend shows `false` but `.env` has `true`**

**Check:**
1. `.env` file location: Must be in `apps/core/cardbey-core/` (not dashboard)
2. File content: Must be `ENABLE_MENU_VISUAL_AGENT=true` (no quotes, no spaces)
3. Server restarted: Must restart after changing `.env`
4. Check logs: Look for `[EnvLoader]` messages

**Fix:**
```bash
cd apps/core/cardbey-core
# Verify file exists and has correct content
Get-Content .env | Select-String "MENU_VISUAL"

# Restart server
npm run dev:api
```

---

### **Frontend shows `false` but backend shows `true`**

**Check:**
1. Hard refresh browser: `Ctrl+Shift+R` (clears cache)
2. Check Network tab: Verify `/api/v2/flags` request succeeds
3. Check API URL: Should be `http://192.168.1.3:3001` or `http://localhost:3001`
4. Restart dashboard: `npm run dev` in dashboard folder

**Fix:**
```bash
# Restart dashboard
cd apps/dashboard/cardbey-marketing-dashboard
npm run dev

# Hard refresh browser (Ctrl+Shift+R)
```

---

### **No `[EnvLoader]` logs in backend**

**Possible Causes:**
1. Import not working (check `src/server.js` and `src/worker.js`)
2. TypeScript compilation error
3. `NODE_ENV=production` (logs only in dev mode)

**Fix:**
- Verify imports: `import './env/loadEnv.js'` in both files
- Check for TypeScript errors
- Ensure running in dev mode

---

## 🎯 Quick Test Commands

### **Backend:**
```bash
# Check feature flag via API
curl http://localhost:3001/api/v2/flags

# Or use verification script
cd apps/core/cardbey-core
npm run verify:feature-flag
```

### **Frontend:**
```javascript
// In browser console (after page loads)
// Check if feature flags are loaded
console.log('[FeatureFlags]', window.__featureFlags || 'Not exposed');

// Or check via network request
fetch('http://localhost:3001/api/v2/flags')
  .then(r => r.json())
  .then(flags => console.log('menu_visual_agent_v1:', flags.menu_visual_agent_v1));
```

---

## 📍 File Locations Summary

| What | Where |
|------|-------|
| **Backend API Endpoint** | `http://localhost:3001/api/v2/flags` |
| **Backend Code** | `apps/core/cardbey-core/src/routes/home.js:131` |
| **Env Loader** | `apps/core/cardbey-core/src/env/loadEnv.ts` |
| **Frontend Code** | `apps/dashboard/.../src/lib/featureFlags.ts` |
| **Frontend Console** | Browser DevTools → Console tab |
| **.env File** | `apps/core/cardbey-core/.env` |

---

**Need help?** Check `MENU_VISUAL_AGENT_QUICK_START.md` for step-by-step setup.

