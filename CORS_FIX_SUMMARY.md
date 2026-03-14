# CORS Fix - Root Cause Elimination

## Problem

All browser-side API calls were using absolute URLs (`http://localhost:3001/api/*`) instead of relative URLs (`/api/*`), causing CORS errors and redirect-to-login loops.

## Solution

**CRITICAL RULE:** In browser code, **NEVER** use absolute URLs. Always use relative URLs (`/api/...`) which go through Vite proxy (same-origin, no CORS).

## Changes Made

### 1. Core URL Resolver (`canonicalCoreUrl.ts`)

**Before:** Returned `http://localhost:3001` in dev mode or from localStorage

**After:** In browser, **ALWAYS** returns empty string `''` (ignores localStorage coreUrl)

```typescript
export function getCoreApiBaseUrl(): string | null {
  // CRITICAL: In browser, NEVER return absolute URLs - always return empty string
  if (typeof window !== 'undefined') {
    return ''; // Empty string = use relative URLs = Vite proxy
  }
  
  // Server-side only: check localStorage and env vars
  // ...
}
```

### 2. URL Resolution (`api.ts`)

**Before:** Checked dev mode, then called `requireCoreApiBaseUrl()` which could return absolute URL

**After:** In browser, **ALWAYS** returns relative URL (never calls `requireCoreApiBaseUrl()`)

```typescript
function resolveUrl(path: string): string {
  // If path is already absolute, replace with relative in browser
  if (/^https?:\/\//i.test(path)) {
    if (typeof window !== 'undefined') {
      const relativePath = path.replace(/^https?:\/\/[^/]+(\/.*)$/, '$1');
      console.error('[resolveUrl] BLOCKED: Absolute URL detected, replacing with relative');
      return relativePath;
    }
  }
  
  const normalized = ensureApiPath(path);
  
  // CRITICAL: In browser, ALWAYS use relative URLs (never absolute)
  if (typeof window !== 'undefined') {
    return normalized; // Return relative URL for Vite proxy
  }
  
  // Server-side only: use absolute URL
  // ...
}
```

**Added Guard:** Detects and blocks absolute URLs in browser fetch calls

```typescript
const url = resolveUrl(path);

// GUARD: In browser, detect and block absolute URLs (fail-fast)
if (typeof window !== 'undefined' && /^https?:\/\//i.test(url)) {
  const relativePath = url.replace(/^https?:\/\/[^/]+(\/.*)$/, '$1');
  console.error('[api.request] BLOCKED: Absolute URL detected in browser fetch');
  return request(method, relativePath, body, init);
}
```

### 3. API URL Helper (`apiUrlHelper.ts`)

**Before:** Checked dev mode, then used `getApiBaseUrl()` which could return absolute URL

**After:** In browser, **ALWAYS** returns relative URL

```typescript
export function buildApiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  
  // CRITICAL: In browser, ALWAYS use relative URLs (never absolute)
  if (typeof window !== 'undefined') {
    return normalizedPath; // Return relative URL for Vite proxy
  }
  
  // Server-side only: use absolute URL
  // ...
}
```

### 4. Business Creation (`createBusiness.ts`)

**Before:** Checked dev mode, then used `requireCoreApiBaseUrl()` for non-dev

**After:** In browser, **ALWAYS** uses relative URL

```typescript
// Build API URL - ALWAYS use relative URLs in browser (Vite proxy)
let apiUrl: string;
if (typeof window !== 'undefined') {
  // Browser: ALWAYS use relative URL (Vite proxy handles forwarding)
  apiUrl = '/api/business/create';
} else {
  // Server-side: use absolute URL
  apiUrl = `${requireCoreApiBaseUrl()}/api/business/create`;
}
```

### 5. Job Polling (`useMiJob.ts`)

**Before:** Checked dev mode, then used stored coreUrl or canonical resolver

**After:** In browser, **ALWAYS** uses relative URL

```typescript
const buildJobApiUrl = (path: string): string => {
  // CRITICAL: In browser, ALWAYS use relative URLs (never absolute)
  if (typeof window !== 'undefined') {
    return path.startsWith('/') ? path : `/${path}`;
  }
  
  // Server-side only: check stored coreUrl
  // ...
}
```

### 6. Axios Instance (`utils/api.ts`)

**Before:** Used `getApiBase()` which could return absolute URL

**After:** In browser, **ALWAYS** uses empty baseURL (relative URLs)

```typescript
function resolveBaseUrl() {
  // CRITICAL: In browser, ALWAYS return empty string (use relative URLs via Vite proxy)
  if (typeof window !== 'undefined') {
    return ""; // Empty string = use relative URLs = Vite proxy
  }
  
  // Server-side only: use absolute URL
  // ...
}

api.interceptors.request.use((config) => {
  // CRITICAL: In browser, ALWAYS use relative URLs (never absolute)
  if (typeof window !== 'undefined') {
    config.baseURL = ""; // Empty string = use relative URLs = Vite proxy
    return config;
  }
  
  // Server-side only: use absolute URL
  // ...
});
```

### 7. SSE Client (`sseClient.ts`)

**Before:** Used `getCoreApiBaseUrl()` which could return absolute URL

**After:** In browser, **ALWAYS** uses relative URL

```typescript
function getUrl(): string {
  // CRITICAL: In browser, ALWAYS use relative URL (never absolute)
  if (typeof window !== 'undefined') {
    // Browser: ALWAYS return relative URL (Vite proxy handles forwarding)
    return `/api/stream?key=${encodeURIComponent(key)}`;
  }
  
  // Server-side only: use absolute URL
  // ...
}
```

### 8. Menu Image Updates (`useMenuImageUpdates.ts`)

**Already correct:** Uses relative URLs (`/api/stream?...`)

No changes needed.

## Files Changed

1. `apps/dashboard/cardbey-marketing-dashboard/src/lib/canonicalCoreUrl.ts`
2. `apps/dashboard/cardbey-marketing-dashboard/src/lib/api.ts`
3. `apps/dashboard/cardbey-marketing-dashboard/src/lib/apiUrlHelper.ts`
4. `apps/dashboard/cardbey-marketing-dashboard/src/services/createBusiness.ts`
5. `apps/dashboard/cardbey-marketing-dashboard/src/hooks/useMiJob.ts`
6. `apps/dashboard/cardbey-marketing-dashboard/src/utils/api.ts`
7. `apps/dashboard/cardbey-marketing-dashboard/src/lib/sseClient.ts`

## Testing Checklist

1. **CORS Fix:**
   - ✅ Open `/features` in private window
   - ✅ Click "Form" or "Website/Link" → Generate
   - ✅ Network tab shows requests to `http://localhost:5174/api/...` (not `:3001`)
   - ✅ No CORS errors in console

2. **SSE Connection:**
   - ✅ SSE connects to `/api/stream?...` (relative URL)
   - ✅ No "using absolute URL" warnings
   - ✅ Connection stays open (no rapid reconnect loop)

3. **No Login Redirect:**
   - ✅ Private window → Form create → No redirect to `/login`
   - ✅ Job page loads and polls successfully
   - ✅ Review page loads without auth

4. **Suggestions Endpoint:**
   - ✅ Template suggestions load without CORS
   - ✅ Image suggestions work without CORS

## Key Principles

1. **Browser = Relative URLs Only:** All browser code must use relative URLs (`/api/...`)
2. **Server-Side = Absolute URLs:** Server-side code can use absolute URLs if needed
3. **Guard Against Absolute URLs:** Added fail-fast guards to detect and replace absolute URLs in browser
4. **Ignore localStorage coreUrl in Browser:** `cardbey.dev.coreUrl` should only affect Vite proxy config, not browser fetch calls

## Debug Logging

When `cardbey.debug=true` or in dev mode, logs show:
- `[getCoreApiBaseUrl] Browser mode: returning empty string (forces relative URLs via Vite proxy)`
- `[resolveUrl] Browser mode, using relative URL: /api/...`
- `[buildApiUrl] Browser mode, using relative URL: /api/...`
- `[resolveUrl] BLOCKED: Absolute URL detected in browser, replacing with relative` (if guard triggers)
