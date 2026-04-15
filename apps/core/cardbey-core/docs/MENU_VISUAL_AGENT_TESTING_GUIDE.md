# 🧪 MenuVisualAgent - Testing Guide

**Feature:** Auto-generate images for menu items after OCR  
**Status:** Ready for Testing

---

## 📋 Prerequisites

### **1. Install Dependencies**

```bash
cd apps/core/cardbey-core
npm install unsplash-js
```

### **2. Set Environment Variables**

**IMPORTANT:** Add to `.env` file in `apps/core/cardbey-core/` (NOT in dashboard folder):

```bash
# Enable the feature (supports: true, 1, yes, on)
ENABLE_MENU_VISUAL_AGENT=true

# Optional: Unsplash API key (get from https://unsplash.com/developers)
UNSPLASH_ACCESS_KEY=your_unsplash_key_here

# Required: OpenAI API key (for fallback if Unsplash unavailable)
OPENAI_API_KEY=your_openai_key_here
```

**File Location:** `apps/core/cardbey-core/.env`

**Note:** 
- If `.env` doesn't exist, create it
- Both API server and worker read from the same file
- After changing `.env`, **restart both API server and worker**
- If you don't have API keys, the feature will still work but won't generate images. Jobs will queue but fail gracefully.

### **3. Start Worker Process**

The worker process handles background image generation jobs. You need to run it separately:

**Option A: Development (with auto-reload)**
```bash
cd apps/core/cardbey-core
npm run dev:worker
```

**Option B: Production**
```bash
cd apps/core/cardbey-core
npm run start:worker
```

**Option C: Run both API and Worker together**
```bash
cd apps/core/cardbey-core
npm run dev:all
```

**Verify worker is running:**
- Look for log: `✅ Starting menu image generation worker (30s polling)...`
- Check console for: `📊 Active Services: ... Menu Image Generation (30s)`

---

## 🧪 Testing Steps

### **Test 1: Verify Feature Flag**

1. **Create/Update `.env` file:**
   ```bash
   cd apps/core/cardbey-core
   # Create .env if it doesn't exist
   echo "ENABLE_MENU_VISUAL_AGENT=true" >> .env
   ```

2. **Restart API Server:**
   - Stop the current API server (Ctrl+C)
   - Start it again: `npm run dev:api` or `npm run dev`
   - Look for logs: `[EnvLoader] ✅ Loaded env files: [...]`
   - Check for: `[EnvLoader] Feature flag ENABLE_MENU_VISUAL_AGENT: { parsed: true }`

3. **Start the dashboard:**
   ```bash
   cd apps/dashboard/cardbey-marketing-dashboard
   npm run dev
   ```

4. **Check feature flag endpoint:**
   - Open browser console
   - Navigate to: `http://localhost:5174`
   - Check console for: `[FeatureFlags] Initialized: { ..., menu_visual_agent_v1: true }`
   - Or visit: `http://localhost:3001/api/v2/flags`
   - Should see: `"menu_visual_agent_v1": true`

**Expected Result:** ✅ Feature flag is `true`

**Troubleshooting:**
- If flag is still `false`, check:
  1. `.env` file exists in `apps/core/cardbey-core/`
  2. File contains `ENABLE_MENU_VISUAL_AGENT=true` (or `1`, `yes`, `on`)
  3. API server was restarted after changing `.env`
  4. Check API server console for `[EnvLoader]` logs

---

### **Test 2: Menu OCR → Auto Image Generation**

1. **Navigate to Menu Page:**
   - Go to: `http://localhost:5174/menu` (or click "Menu" in sidebar)
   - Ensure you're logged in and have a store/business

2. **Upload Menu Photo:**
   - Click "Upload Menu Photo" or "Extract from Photo"
   - Upload a menu image (JPG/PNG)
   - Wait for OCR to complete

3. **Verify Menu Items Created:**
   - Menu items should appear in the list
   - Items should NOT have images yet (they'll be generated in background)

4. **Check Job Queue:**
   - Open backend console (where worker is running)
   - Look for log: `[ImageGenerationJob] Queued job <taskId> for store <storeId>`
   - Wait 30 seconds (worker polls every 30s)

5. **Verify Images Generated:**
   - After 30-60 seconds, refresh the menu page
   - Menu items should now have images
   - Check browser console for: `[MenuVisualAgent] ✅ Generated image for "Item Name" via unsplash/openai`

**Expected Result:** ✅ Images appear on menu items within 1-2 minutes

---

### **Test 3: Regenerate Image Button**

1. **Navigate to Menu Page:**
   - Go to menu page with existing items
   - Find a menu item card

2. **Click Regenerate Button:**
   - Look for refresh icon (🔄) button next to Edit/Delete buttons
   - Click the regenerate button
   - Should see loading overlay: "Generating image..."

3. **Verify Regeneration:**
   - Check backend console for: `[ImageGenerationJob] Queued job ...`
   - Wait 30-60 seconds
   - Image should update (refresh page if needed)

**Expected Result:** ✅ New image generated and replaces old one

---

### **Test 4: Feature Flag Disabled**

1. **Disable Feature:**
   - Set `ENABLE_MENU_VISUAL_AGENT=false` in `.env`
   - Restart backend server

2. **Test Menu OCR:**
   - Upload menu photo
   - Menu items should be created
   - NO image generation jobs should be queued
   - Regenerate button should NOT appear

**Expected Result:** ✅ No image generation, feature is disabled

---

### **Test 5: API Key Scenarios**

#### **5A: No API Keys**

1. **Remove API keys from `.env`:**
   ```bash
   # ENABLE_MENU_VISUAL_AGENT=true
   # UNSPLASH_ACCESS_KEY=  (commented out)
   # OPENAI_API_KEY=  (commented out)
   ```

2. **Test Menu OCR:**
   - Upload menu photo
   - Jobs should queue but fail gracefully
   - Check console: `[MenuVisualAgent] ⚠️  No image generated for "Item Name" (no sources available)`

**Expected Result:** ✅ Jobs fail gracefully, no crashes

#### **5B: Unsplash Only**

1. **Set only Unsplash key:**
   ```bash
   ENABLE_MENU_VISUAL_AGENT=true
   UNSPLASH_ACCESS_KEY=your_key
   # OPENAI_API_KEY=  (commented out)
   ```

2. **Test:**
   - Images should generate via Unsplash
   - If Unsplash fails, no fallback (but no crash)

**Expected Result:** ✅ Unsplash images generated

#### **5C: OpenAI Only**

1. **Set only OpenAI key:**
   ```bash
   ENABLE_MENU_VISUAL_AGENT=true
   # UNSPLASH_ACCESS_KEY=  (commented out)
   OPENAI_API_KEY=your_key
   ```

2. **Test:**
   - Images should generate via OpenAI DALL-E 3
   - Check console: `[OpenAIImageService] Image generated successfully`

**Expected Result:** ✅ OpenAI images generated

#### **5D: Both Keys (Recommended)**

1. **Set both keys:**
   ```bash
   ENABLE_MENU_VISUAL_AGENT=true
   UNSPLASH_ACCESS_KEY=your_key
   OPENAI_API_KEY=your_key
   ```

2. **Test:**
   - System tries Unsplash first
   - Falls back to OpenAI if Unsplash fails
   - Check console for source: `via unsplash` or `via openai`

**Expected Result:** ✅ Unsplash preferred, OpenAI fallback works

---

### **Test 6: Style Presets**

1. **Set Business Style:**
   - Go to Business Builder onboarding
   - Complete Step 2 (Industry Selection) or set style preferences
   - Or manually update `Business.stylePreferences` in database:
     ```json
     { "style": "warm" }
     ```

2. **Generate Images:**
   - Upload menu photo or regenerate images
   - Check console: `[MenuVisualAgent] Using style preset: warm`
   - Images should match the style (warm, modern, minimal, or vibrant)

**Expected Result:** ✅ Images match business style preferences

---

### **Test 7: Job Queue Status**

1. **Check Job Status:**
   - After queuing a job, note the `taskId` from console
   - Query job status (if endpoint exists) or check database:
     ```sql
     SELECT * FROM OrchestratorTask 
     WHERE entryPoint = 'menu_visual_generation' 
     ORDER BY createdAt DESC 
     LIMIT 5;
     ```

2. **Verify Job States:**
   - `queued` → Job is waiting
   - `running` → Job is processing
   - `completed` → Job finished successfully
   - `failed` → Job failed (check `result.error`)

**Expected Result:** ✅ Jobs transition through states correctly

---

### **Test 8: Error Handling**

1. **Test Rate Limits:**
   - Generate many images quickly (trigger rate limits)
   - Check console for: `[OpenAIImageService] Rate limit hit, will retry later`
   - Jobs should fail gracefully, not crash

2. **Test Invalid Store ID:**
   - Try regenerating with invalid `storeId`
   - Should show error toast, not crash

3. **Test Network Errors:**
   - Disconnect internet temporarily
   - Queue a job
   - Should fail gracefully with error logged

**Expected Result:** ✅ All errors handled gracefully, no crashes

---

## 🔍 Debugging

### **Check Worker Logs**

```bash
# In worker console, look for:
[ImageGenerationJob] Processing X queued jobs
[MenuVisualAgent] Processing Y items for store <storeId>
[MenuVisualAgent] ✅ Generated image for "Item Name" via unsplash
[ImageGenerationJob] ✅ Completed job <taskId>
```

### **Check Frontend Console**

```javascript
// Should see:
[FeatureFlags] Initialized: { menu_visual_agent_v1: true }
```

### **Check Database**

```sql
-- Check queued jobs
SELECT id, status, createdAt, updatedAt 
FROM OrchestratorTask 
WHERE entryPoint = 'menu_visual_generation'
ORDER BY createdAt DESC;

-- Check products with images
SELECT id, name, imageUrl, images 
FROM Product 
WHERE businessId = '<your-store-id>' 
AND imageUrl IS NOT NULL;
```

### **Common Issues**

| Issue | Solution |
|-------|----------|
| Feature flag shows `false` | Check `ENABLE_MENU_VISUAL_AGENT=true` in `.env` and restart server |
| No images generated | Check worker is running (`npm run dev:worker`) |
| Jobs stuck in "queued" | Worker not running or polling interval too long |
| "Module not found" errors | Run `npm install unsplash-js` in `apps/core/cardbey-core` |
| Images not appearing | Refresh page, check `Product.imageUrl` in database |
| Regenerate button missing | Check feature flag is enabled and `storeId` is passed to component |

---

## ✅ Success Criteria

**Feature is working correctly if:**

1. ✅ Feature flag is `true` when enabled
2. ✅ Menu OCR creates items without blocking
3. ✅ Images appear on menu items within 1-2 minutes after OCR
4. ✅ Regenerate button appears and works
5. ✅ Jobs queue and process correctly
6. ✅ Errors are handled gracefully (no crashes)
7. ✅ Style presets are applied
8. ✅ Unsplash → OpenAI fallback works

---

## 📝 Test Checklist

- [ ] Feature flag enabled/disabled correctly
- [ ] Menu OCR creates items (non-blocking)
- [ ] Images auto-generate after OCR
- [ ] Regenerate button appears and works
- [ ] Worker process runs and processes jobs
- [ ] Jobs transition: queued → running → completed
- [ ] Unsplash images work (if key provided)
- [ ] OpenAI images work (if key provided)
- [ ] Fallback works (Unsplash → OpenAI)
- [ ] Style presets applied
- [ ] Feature disabled = no image generation
- [ ] Errors handled gracefully
- [ ] No crashes or blocking operations

---

**Ready to test?** Start with **Test 1** and work through each test sequentially.

