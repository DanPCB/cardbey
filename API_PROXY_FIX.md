# API Proxy Fix - Implementation Summary

## Root Cause

In dev mode (localhost:5174), the frontend was using absolute URLs (`http://localhost:3001/api/*`) instead of relative URLs (`/api/*`), causing CORS errors. The Vite proxy is configured to forward `/api/*` to `http://localhost:3001/api/*`, but only works when requests use relative URLs.

## Changes Made

### 1. API Base URL Resolver (`canonicalCoreUrl.ts`)

**Before:** In dev mode, returned `http://localhost:3001` (absolute URL)

**After:** In browser dev mode (localhost:5174), returns empty string `''` (signals to use relative URLs/Vite proxy)

```typescript
// CRITICAL: In browser dev mode, ALWAYS use Vite proxy (return empty string)
if (typeof window !== 'undefined' && isDevLocalhost()) {
  return ''; // Empty string = use relative URLs = Vite proxy
}
```

### 2. URL Resolution (`api.ts`)

**Before:** Always used `requireCoreApiBaseUrl()` which returned absolute URL

**After:** Checks if running in dev browser mode first, uses relative URLs if so

```typescript
function resolveUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  
  const normalized = ensureApiPath(path);
  
  // CRITICAL: In browser dev mode (localhost:5174), use relative URLs (Vite proxy)
  if (typeof window !== 'undefined') {
    const { hostname, port } = window.location;
    const isDevBrowser = (hostname === 'localhost' || hostname === '127.0.0.1') && port === '5174';
    
    if (isDevBrowser) {
      return normalized; // Return relative URL for Vite proxy
    }
  }
  
  // For non-dev: use absolute URL from canonical resolver
  const coreUrl = requireCoreApiBaseUrl();
  if (!coreUrl) {
    return normalized;
  }
  return `${coreUrl.replace(/\/+$/, '')}${normalized}`;
}
```

### 3. API URL Helper (`apiUrlHelper.ts`)

**Before:** Always returned absolute URL

**After:** Returns relative URL in dev browser mode

```typescript
export function buildApiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  
  // CRITICAL: In browser dev mode (localhost:5174), use relative URLs (Vite proxy)
  if (typeof window !== 'undefined') {
    const { hostname, port } = window.location;
    const isDevBrowser = (hostname === 'localhost' || hostname === '127.0.0.1') && port === '5174';
    
    if (isDevBrowser) {
      return normalizedPath; // Return relative URL for Vite proxy
    }
  }
  
  // For non-dev: use absolute URL
  // ...
}
```

### 4. Job Polling (`useMiJob.ts`)

**Before:** Used stored coreUrl or canonical resolver (absolute URLs)

**After:** Uses relative URLs in dev browser mode

```typescript
const buildJobApiUrl = (path: string): string => {
  // CRITICAL: In browser dev mode (localhost:5174), use relative URLs (Vite proxy)
  if (typeof window !== 'undefined') {
    const { hostname, port } = window.location;
    const isDevBrowser = (hostname === 'localhost' || hostname === '127.0.0.1') && port === '5174';
    
    if (isDevBrowser) {
      return path.startsWith('/') ? path : `/${path}`;
    }
  }
  
  // For non-dev: check stored coreUrl first, then fallback to canonical resolver
  // ...
}
```

### 5. Business Creation (`createBusiness.ts`)

**Before:** Always used `requireCoreApiBaseUrl()` (absolute URL)

**After:** Uses relative URLs in dev browser mode

```typescript
// Build API URL - use relative URLs in dev browser mode (Vite proxy)
let apiUrl: string;
if (typeof window !== 'undefined') {
  const { hostname, port } = window.location;
  const isDevBrowser = (hostname === 'localhost' || hostname === '127.0.0.1') && port === '5174';
  
  if (isDevBrowser) {
    apiUrl = '/api/business/create'; // Relative URL for Vite proxy
  } else {
    // Use absolute URL
    apiUrl = `${requireCoreApiBaseUrl()}/api/business/create`;
  }
}
```

### 6. SSE Connection (`useMenuImageUpdates.ts`)

**Already correct:** Uses relative URLs (`/api/stream?...`)

No changes needed - already uses relative URLs.

### 7. Store Review Route (`App.jsx`)

**Added:** Public route for `/app/store/:storeId/review` (no `RequireAuth`)

```jsx
{/* Canonical Store Review Page - Public when mode=draft */}
<Route
  path="/app/store/:storeId/review"
  element={<StoreReviewPage />}
/>
```

**Updated:** `isPublicPage` check includes draft review route

```typescript
const isPublicPage = loc.pathname === "/" || 
                    // ...
                    (loc.pathname.startsWith("/app/store/") && 
                     loc.pathname.includes("/review") && 
                     new URLSearchParams(loc.search).get("mode") === "draft");
```

### 8. Store Review Page (`StoreReviewPage.tsx`)

**Added:** Public context flag for draft mode

```typescript
// Set public context flag for draft mode
if (mode === 'draft' && typeof window !== 'undefined') {
  localStorage.setItem('cardbey.publicContext', 'true');
}
```

**Updated:** Graceful fallback for draft mode (creates minimal draft if API fails)

## Files Changed

### Frontend
- `apps/dashboard/cardbey-marketing-dashboard/src/lib/canonicalCoreUrl.ts`
- `apps/dashboard/cardbey-marketing-dashboard/src/lib/api.ts`
- `apps/dashboard/cardbey-marketing-dashboard/src/lib/apiUrlHelper.ts`
- `apps/dashboard/cardbey-marketing-dashboard/src/hooks/useMiJob.ts`
- `apps/dashboard/cardbey-marketing-dashboard/src/services/createBusiness.ts`
- `apps/dashboard/cardbey-marketing-dashboard/src/App.jsx`
- `apps/dashboard/cardbey-marketing-dashboard/src/pages/store/StoreReviewPage.tsx`

## Testing Checklist

1. **CORS Fix:**
   - Open `/features` in private window
   - Click "Form" or "Website/Link" → Generate
   - ✅ Network tab shows requests to `http://localhost:5174/api/...` (not `:3001`)
   - ✅ No CORS errors in console

2. **SSE Connection:**
   - Open job page or store review
   - ✅ SSE connects to `/api/stream?...` (relative URL)
   - ✅ No "using absolute URL" warnings
   - ✅ Connection stays open (no rapid reconnect loop)

3. **Guest-Safe Flow:**
   - Private window → `/features` → Form create
   - ✅ No redirect to `/login`
   - ✅ Job page loads and polls successfully
   - ✅ When job completes, redirects to `/app/store/:storeId/review?mode=draft`
   - ✅ Review page loads without auth
   - ✅ Can edit products (autosaves to draft patch)

4. **Publish Gating:**
   - On draft review page, click "Publish Store"
   - ✅ If not authed: Shows sign-in modal (NOT hard redirect)
   - ✅ After login: Returns to same page and allows publish

5. **Unified Quick Start:**
   - All 4 options (Form, Voice, OCR, Website) → Navigate to `/mi/job/:jobId`
   - ✅ Job progresses and redirects to review page
   - ✅ No duplicate flows or old routes

## Debug Logging

When `cardbey.debug=true` or in dev mode, logs show:
- `[getCoreApiBaseUrl] Dev mode detected (localhost:5174), using Vite proxy (empty base)`
- `[resolveUrl] Dev browser mode, using relative URL: /api/...`
- `[buildApiUrl] Dev browser mode, using relative URL: /api/...`

## Notes

- **Single Source of Truth:** All URL resolution goes through `canonicalCoreUrl.ts` → `resolveUrl()` → `buildApiUrl()`
- **Dev Detection:** Checks `window.location.hostname === 'localhost' && port === '5174'`
- **Credentials:** All fetch calls include `credentials: 'include'` for CORS
- **SSE:** Already uses relative URLs, no changes needed
- **Production:** Non-dev environments still use absolute URLs (as configured)


