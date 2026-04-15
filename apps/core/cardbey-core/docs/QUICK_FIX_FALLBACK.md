# Quick Fix: Still Seeing Fallback Images

## ✅ API Key is Set

Your `.env` has `OPENAI_API_KEY` configured. If you're still seeing fallback images, try these steps:

## Step 1: Restart Backend

The backend needs to be restarted to load the API key:

```bash
# Stop the current backend (Ctrl+C)
# Then restart:
cd cardbey-core
npm run dev
```

## Step 2: Check Backend Logs

When you click "Generate Design", watch the backend console. You should see:

**✅ Success:**
```
[AI Images] Generated background: /assets/ai-backgrounds/bg-1234567890.png
```

**❌ Failure (fallback):**
```
[AI Images] OpenAI generation error: ...
[AI Images] Using placeholder: ...
```

## Step 3: Test Backend Directly

Test if the backend endpoint works:

```bash
curl -X POST http://localhost:3001/api/ai/images/background \
  -H "Content-Type: application/json" \
  -d "{\"prompt\":\"test poster\",\"goal\":\"poster\"}"
```

**Check the response:**
- If `"placeholder": false` → Backend is working! Check frontend.
- If `"placeholder": true` → Backend issue. Check logs for error.

## Step 4: Check Frontend Console

Open browser DevTools (F12) → Console tab.

**Add this debug code to your Design Assistant component:**

```typescript
const handleGenerateDesign = async () => {
  try {
    console.log("[DEBUG] 🚀 Starting background generation...");
    setIsGenerating(true);

    const background = await generateBackgroundImage({
      prompt: form.prompt,
      stylePreset: form.stylePreset,
      goal: form.goal,
    });

    console.log("[DEBUG] 📦 Response received:", background);

    if (background?.imageUrl) {
      console.log("[DEBUG] ✅ Image URL:", background.imageUrl);
      console.log("[DEBUG] Placeholder?", background.placeholder);
      setBackgroundImageUrl(background.imageUrl);
    }

  } catch (error) {
    console.error("[DEBUG] ❌ Error:", error);
  } finally {
    setIsGenerating(false);
  }
};
```

## Step 5: Check Network Tab

1. Open DevTools → Network tab
2. Click "Generate Design"
3. Find the request to `/api/ai/images/background`
4. Click it → Check Response tab

**What to look for:**
- Status: Should be `200 OK`
- Response body: Check if `placeholder: true` or `false`

## Step 6: Verify Image URL

If the response has `imageUrl`, check if it's accessible:

```typescript
// In browser console, after getting response:
const url = "/assets/ai-backgrounds/bg-1234567890.png";
fetch(url).then(r => console.log("Image accessible?", r.ok));
```

## Common Issues

### Issue: Backend returns placeholder: true

**Check backend logs for:**
- `OpenAI generation error: ...`
- `Request timeout`
- `invalid_api_key`

**Fix:**
- Verify API key is valid at https://platform.openai.com/api-keys
- Check you have credits/quota
- Restart backend

### Issue: Frontend not calling API

**Symptoms:**
- No network request in DevTools
- No console logs

**Fix:**
- Check `generateBackgroundImage` is imported
- Verify button handler is connected
- Check for JavaScript errors

### Issue: Image URL not loading

**Symptoms:**
- Response has `imageUrl` but image doesn't show
- Console shows image load errors

**Fix:**
- Check URL is absolute or relative correctly
- Verify file exists in `public/assets/ai-backgrounds/`
- Check CORS if using absolute URL

## Still Not Working?

Share:
1. **Backend console output** when you click Generate
2. **Browser console logs** (with debug code above)
3. **Network tab response** for the API call
4. **The actual response JSON** you're getting

This will help identify the exact issue!







