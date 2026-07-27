# 🚀 MenuVisualAgent - Quick Start Guide

## Enable the Feature (3 Steps)

### **Step 1: Create/Update `.env` File**

Create or edit `apps/core/cardbey-core/.env`:

```bash
# Enable Menu Visual Agent
ENABLE_MENU_VISUAL_AGENT=true

# Optional: Add API keys for image generation
# UNSPLASH_ACCESS_KEY=your_key_here
# OPENAI_API_KEY=your_key_here
```

**File Location:** `apps/core/cardbey-core/.env` (NOT in dashboard folder)

**Accepted Values:** `true`, `1`, `yes`, or `on` (all work the same)

---

### **Step 2: Restart Backend Services**

**IMPORTANT:** You must restart BOTH the API server AND worker after changing `.env`:

**Option A: Separate Terminals (Recommended)**
```bash
# Terminal 1: API Server
cd apps/core/cardbey-core
npm run dev:api

# Terminal 2: Worker Process
cd apps/core/cardbey-core
npm run dev:worker
```

**Option B: Combined**
```bash
cd apps/core/cardbey-core
npm run dev:all
```

**Look for these logs:**
```
[EnvLoader] Project root: C:\Projects\cardbey\apps\core\cardbey-core
[EnvLoader] ✅ Loaded env files: [ 'C:\\Projects\\cardbey\\apps\\core\\cardbey-core\\.env' ]
[EnvLoader] Feature flag ENABLE_MENU_VISUAL_AGENT: { parsed: true, ... }
✅ Starting menu image generation worker (30s polling)...
```

---

### **Step 3: Verify Feature Flag**

**Check Backend:**
- Visit: `http://localhost:3001/api/v2/flags`
- Should see: `"menu_visual_agent_v1": true`

**Check Frontend:**
- Open browser console on dashboard
- Should see: `[FeatureFlags] Initialized: { ..., menu_visual_agent_v1: true }`

---

## ✅ Verification Checklist

- [ ] `.env` file exists in `apps/core/cardbey-core/`
- [ ] `.env` contains `ENABLE_MENU_VISUAL_AGENT=true` (or `1`, `yes`, `on`)
- [ ] API server restarted (check for `[EnvLoader]` logs)
- [ ] Worker process running (check for `Menu Image Generation (30s)` log)
- [ ] Backend `/api/v2/flags` returns `menu_visual_agent_v1: true`
- [ ] Frontend console shows `menu_visual_agent_v1: true`
- [ ] Regenerate button appears on menu items (if feature enabled)

---

## 🧪 Test the Feature

1. **Go to Menu Page:** `http://localhost:5174/menu`
2. **Upload Menu Photo:** Click "Upload Menu Photo" or "Extract from Photo"
3. **Wait for OCR:** Menu items should appear
4. **Check Worker Console:** Should see `[ImageGenerationJob] Queued job...`
5. **Wait 30-60 seconds:** Worker polls every 30s
6. **Refresh Menu Page:** Images should appear on items
7. **Test Regenerate:** Click refresh icon (🔄) on any menu item

---

## 🐛 Troubleshooting

| Problem | Solution |
|---------|----------|
| Flag still `false` | Check `.env` file location and restart both API + worker |
| No `[EnvLoader]` logs | Check import path in `server.js` and `worker.js` |
| Worker not running | Run `npm run dev:worker` in separate terminal |
| Images not generating | Check worker console for job processing logs |
| Regenerate button missing | Verify feature flag is `true` and `storeId` is passed |

---

## 📝 Next Steps

- See full testing guide: `MENU_VISUAL_AGENT_TESTING_GUIDE.md`
- See env vars docs: `MENU_VISUAL_AGENT_ENV_VARS.md`
- See implementation plan: `MENU_VISUAL_AGENT_IMPLEMENTATION_PLAN.md`

