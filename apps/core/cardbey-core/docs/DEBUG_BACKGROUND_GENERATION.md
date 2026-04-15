# Debugging AI Background Generation

If you're still seeing fallback/placeholder images, follow these steps:

## 1. Check Backend API Key

First, verify the backend has the OpenAI API key configured:

```bash
# In cardbey-core directory
# Check .env file has:
OPENAI_API_KEY=sk-...
```

If missing, add it and restart the backend:
```bash
npm run dev
```

## 2. Test Backend Endpoint Directly

Test if the backend endpoint is working:

```bash
# Using curl
curl -X POST http://localhost:3001/api/ai/images/background \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Vietnamese noodle bowl poster",
    "goal": "poster"
  }'
```

**Expected response:**
```json
{
  "ok": true,
  "imageUrl": "/assets/ai-backgrounds/bg-1234567890.png",
  "placeholder": false,
  "width": 1024,
  "height": 1536,
  "source": "openai"
}
```

**If you see `"placeholder": true`, the backend is falling back because:**
- OpenAI API key is missing
- OpenAI API call failed
- Rate limit exceeded

## 3. Check Browser Console

Open browser DevTools (F12) and check:

### Network Tab
1. Look for request to `/api/ai/images/background`
2. Check if it returns 200 OK
3. Check the response body - does it have `placeholder: true`?

### Console Tab
Look for errors like:
- `AI background generation failed: ...`
- `Failed to load image: ...`
- CORS errors

## 4. Check Frontend Code

Verify your frontend is actually calling the API:

### In Design Assistant Component

Add console logs:

```typescript
const handleGenerateDesign = async () => {
  try {
    setIsGenerating(true);
    console.log("[DEBUG] Starting background generation...");

    const background = await generateBackgroundImage({
      prompt: form.prompt,
      stylePreset: form.stylePreset,
      goal: form.goal,
      width: form.width,
      height: form.height,
    });

    console.log("[DEBUG] Background response:", background);

    if (background?.imageUrl) {
      console.log("[DEBUG] Setting background URL:", background.imageUrl);
      setBackgroundImageUrl(background.imageUrl);
      
      if (background.placeholder) {
        console.warn("[DEBUG] ⚠️ Using placeholder image:", background.error);
      } else {
        console.log("[DEBUG] ✅ AI-generated image:", background.imageUrl);
      }
    } else {
      console.error("[DEBUG] ❌ No imageUrl in response");
    }

  } catch (error) {
    console.error("[DEBUG] ❌ Background generation error:", error);
  } finally {
    setIsGenerating(false);
  }
};
```

## 5. Check API URL

Verify the API URL is correct in `aiBackground.api.ts`:

```typescript
// Should match your frontend's API base URL
const apiUrl = "/api/ai/images/background"; // If using proxy
// or
const apiUrl = "http://localhost:3001/api/ai/images/background"; // Direct
// or
const apiUrl = buildApiUrl("/ai/images/background"); // Using helper
```

## 6. Check Backend Logs

Look at your backend console output. You should see:

```
[AI Images] Generated background: /assets/ai-backgrounds/bg-1234567890.png
```

If you see:
```
[AI Images] OpenAI generation error: ...
[AI Images] Using placeholder: ...
```

Then the backend is failing to call OpenAI.

## 7. Common Issues

### Issue: "placeholder": true in response

**Cause:** Backend can't reach OpenAI or API key is invalid

**Fix:**
1. Check `.env` has `OPENAI_API_KEY=sk-...`
2. Restart backend after adding key
3. Verify key is valid at https://platform.openai.com/api-keys

### Issue: CORS errors in browser

**Cause:** Frontend and backend on different origins

**Fix:** Check `src/config/cors.js` allows your frontend origin

### Issue: 404 Not Found

**Cause:** API endpoint not mounted correctly

**Fix:** Verify in `src/server.js`:
```javascript
app.use('/api/ai/images', aiImagesRouter);
```

### Issue: Image loads but shows placeholder

**Cause:** Frontend is using wrong URL or image doesn't exist

**Fix:**
1. Check `imageUrl` in response is accessible
2. Try opening the URL directly in browser
3. Check if file exists in `public/assets/ai-backgrounds/`

## 8. Quick Test Script

Create a test file to verify everything works:

```typescript
// test-background.ts
import { generateBackgroundImage } from './src/api/aiBackground.api';

async function test() {
  try {
    console.log("Testing background generation...");
    const result = await generateBackgroundImage({
      prompt: "Test poster with blue sky",
      goal: "poster"
    });
    
    console.log("Result:", result);
    
    if (result.placeholder) {
      console.error("❌ Got placeholder - check backend logs");
    } else {
      console.log("✅ Success! Image URL:", result.imageUrl);
    }
  } catch (error) {
    console.error("❌ Error:", error);
  }
}

test();
```

## 9. Verify Image Loading

Check if the image URL is actually loading:

```typescript
// In your canvas component, add:
useEffect(() => {
  if (backgroundImageUrl) {
    console.log("[DEBUG] Loading image:", backgroundImageUrl);
    
    const img = new Image();
    img.onload = () => console.log("[DEBUG] ✅ Image loaded");
    img.onerror = () => console.error("[DEBUG] ❌ Image failed to load");
    img.src = backgroundImageUrl;
  }
}, [backgroundImageUrl]);
```

## 10. Check Backend Response

The backend should return one of these:

**Success:**
```json
{
  "ok": true,
  "imageUrl": "/assets/ai-backgrounds/bg-1234567890.png",
  "placeholder": false,
  "source": "openai"
}
```

**Fallback (placeholder):**
```json
{
  "ok": true,
  "imageUrl": "/assets/placeholders/poster-placeholder.webp",
  "placeholder": true,
  "source": "placeholder",
  "error": "Image generation failed, using placeholder"
}
```

If you see `placeholder: true`, check backend logs for the actual error.

---

## Still Not Working?

Share:
1. Browser console errors
2. Network tab response
3. Backend console logs
4. The actual API response you're getting

This will help identify the exact issue.







