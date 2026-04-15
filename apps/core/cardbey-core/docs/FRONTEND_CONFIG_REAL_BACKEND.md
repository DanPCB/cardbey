# Frontend Configuration - Use Real Backend Only

## ✅ Backend is Running

Your `cardbey-core` backend is running correctly on:
- **Local:** `http://localhost:3001`
- **LAN:** `http://192.168.1.7:3001`

The backend route is mounted at: `POST /api/ai/images/background`

## 🔧 Frontend Configuration

Your frontend (`cardbey-marketing-dashboard`) should call the real backend directly. **Do NOT use stub routes.**

### Update API Helper

In your frontend `aiBackground.api.ts`, make sure it calls the real backend:

```typescript
export async function generateBackgroundImage(
  payload: AiBackgroundRequest
): Promise<AiBackgroundResponse> {
  // Call the REAL backend at localhost:3001
  const apiUrl = "http://localhost:3001/api/ai/images/background";
  
  // OR if using Vite proxy (recommended):
  // const apiUrl = "/api/ai/images/background";
  // (Make sure vite.config.ts proxies /api/* to http://localhost:3001)

  const res = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(
      `AI background generation failed: ${res.status} ${errorData.error || res.statusText}`
    );
  }

  return res.json() as Promise<AiBackgroundResponse>;
}
```

### Option 1: Direct URL (Development)

```typescript
const apiUrl = "http://localhost:3001/api/ai/images/background";
```

### Option 2: Vite Proxy (Recommended)

If your `vite.config.ts` has a proxy configured:

```typescript
// vite.config.ts
export default {
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      }
    }
  }
}
```

Then use relative URL:
```typescript
const apiUrl = "/api/ai/images/background";
```

## ✅ Verify Backend Route

The backend route is already mounted. Verify it's working:

```bash
curl -X POST http://localhost:3001/api/ai/images/background \
  -H "Content-Type: application/json" \
  -d '{"prompt":"test poster","goal":"poster"}'
```

You should get a response with `imageUrl` and `placeholder: false` (if OpenAI is working).

## 🚫 Remove Stub Routes

If your frontend has stub routes, **remove them** or ensure they're not being used. The frontend should ONLY call the real backend at `http://localhost:3001`.

## 📝 Summary

1. ✅ Backend is running on `http://localhost:3001`
2. ✅ Route is mounted: `POST /api/ai/images/background`
3. ✅ Frontend should call: `http://localhost:3001/api/ai/images/background`
4. ❌ Do NOT use stub routes in frontend
5. ✅ All API calls go to `cardbey-core` backend only

## 🧪 Test

1. Open browser DevTools → Network tab
2. Click "Generate Design" in frontend
3. Look for request to `http://localhost:3001/api/ai/images/background`
4. Check response - should have `imageUrl` and `placeholder: false`

If you see `placeholder: true`, check backend logs for OpenAI errors.







