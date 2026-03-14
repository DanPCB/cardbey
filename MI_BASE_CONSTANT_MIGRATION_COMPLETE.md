# MI_BASE Constant Migration Complete

**Date:** 2026-01-12  
**Status:** ✅ **COMPLETED**

---

## ✅ Changes Applied

### 1. Created MI_BASE Constant

**File:** `apps/dashboard/cardbey-marketing-dashboard/src/lib/api.ts`

```typescript
/**
 * MI (Merged Intelligence) API Base Path
 * Single source of truth for all MI orchestration endpoints
 * 
 * All MI routes are under /api/mi/orchestra/*
 * Use this constant instead of hardcoding paths
 */
export const MI_BASE = '/api/mi/orchestra';
```

### 2. Replaced All Hardcoded Strings

**Updated Files:**
- ✅ `lib/api.ts` - All template endpoint functions
- ✅ `lib/quickStart.ts` - All orchestra start/infer/sync-store calls
- ✅ `pages/store/StoreReviewPage.tsx` - All orchestra job calls
- ✅ `features/storeDraft/StoreDraftReview.tsx` - All orchestra job calls
- ✅ `features/storeDraft/review/ProductSuggestions.tsx` - Template suggestions endpoint
- ✅ `pages/DashboardEnhanced.jsx` - Health check fallback

**Replaced Patterns:**
- `/api/mi/orchestra/infer` → `${MI_BASE}/infer`
- `/api/mi/orchestra/start` → `${MI_BASE}/start`
- `/api/mi/orchestra/job/:jobId/sync-store` → `${MI_BASE}/job/${jobId}/sync-store`
- `/api/mi/orchestra/templates/suggestions` → `${MI_BASE}/templates/suggestions`
- `/api/mi/orchestra/templates/generate` → `${MI_BASE}/templates/generate`
- `/api/mi/orchestra/templates/:templateId/instantiate` → `${MI_BASE}/templates/${templateId}/instantiate`
- `/api/mi/orchestra/signage-playlists/:playlistId/suggestions` → `${MI_BASE}/signage-playlists/${playlistId}/suggestions`

### 3. Fixed useDraftPolling AbortError Handling

**File:** `apps/dashboard/cardbey-marketing-dashboard/src/hooks/useDraftPolling.ts`

**Changes:**
- Removed all error logging for AbortError
- Silently ignore abort errors (no console.log, no error state)
- AbortError is now completely silent (as expected for polling cancellation)

**Before:**
```typescript
if (err?.name === 'AbortError' || ...) {
  if (import.meta.env.DEV) {
    console.log('[useDraftPolling] Request aborted before response received');
  }
  return;
}
```

**After:**
```typescript
if (err?.name === 'AbortError' || 
    err?.message?.includes('NS_BINDING_ABORTED') || 
    err?.code === 'NS_BINDING_ABORTED' ||
    err?.isAbort ||
    signal.aborted) {
  return; // No error logging for AbortError
}
```

### 4. Forced getCoreApiBaseUrl() Usage

**File:** `apps/dashboard/cardbey-marketing-dashboard/src/lib/api.ts`

**Changes:**
- Modified `resolveUrl()` to always call `getCoreApiBaseUrl()` first
- If base URL is configured, use it to build absolute URLs
- If no base URL, fall back to relative URLs (for Vite proxy compatibility)
- This ensures dev/prod/mobile all behave consistently

**Before:**
```typescript
// Browser: ALWAYS return relative URL (Vite proxy handles forwarding)
if (typeof window !== 'undefined') {
  return normalized; // Return relative URL for Vite proxy
}
// Server-side only: use absolute URL from canonical resolver
const coreUrl = requireCoreApiBaseUrl();
```

**After:**
```typescript
// CRITICAL: Always use getCoreApiBaseUrl() for consistent behavior across dev/prod/mobile
const { getCoreApiBaseUrl } = require('./coreApiBaseUrl');
const coreBaseUrl = getCoreApiBaseUrl();

// If we have a base URL, use it to build absolute URL
if (coreBaseUrl && coreBaseUrl.trim()) {
  return `${coreBaseUrl.replace(/\/+$/, '')}${normalized}`;
}

// No base URL configured - fall back to relative URL (for Vite proxy in dev)
if (typeof window !== 'undefined') {
  return normalized; // Return relative URL for Vite proxy
}
```

---

## 📊 Benefits

1. **Single Source of Truth:** All MI routes use `MI_BASE` constant
2. **Easier Maintenance:** Change base path in one place
3. **Type Safety:** Constant can be typed and validated
4. **Consistent Behavior:** All environments use `getCoreApiBaseUrl()` consistently
5. **Cleaner Logs:** No AbortError noise in console

---

## 🧪 Testing Checklist

- [ ] Test template suggestions endpoint
- [ ] Test orchestra start endpoint
- [ ] Test orchestra job sync-store endpoint
- [ ] Verify AbortError is silent (no console logs)
- [ ] Verify getCoreApiBaseUrl() is called for all API requests
- [ ] Test in dev mode (Vite proxy)
- [ ] Test in prod mode (absolute URLs)

---

## ✅ Status

**Migration Complete:** ✅  
**All Hardcoded Strings Replaced:** ✅  
**AbortError Handling Fixed:** ✅  
**getCoreApiBaseUrl() Forced:** ✅  
**Linter Errors:** ✅ None  
**Ready for Testing:** ✅

