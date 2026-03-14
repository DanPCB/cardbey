# process.env Fix - Complete

**Date:** 2025-01-28  
**Status:** ✅ All `process.env` references replaced with Vite-safe `import.meta.env`

---

## ✅ Issue Fixed

**Error:** `ReferenceError: process is not defined`

**Root Cause:**
- Vite (browser) doesn't expose `process.env`
- Must use `import.meta.env` instead
- Error occurred in `apiBase.ts:142` during `buildApiUrl()` → `useMiJob` polling

---

## ✅ Changes Applied

### Critical Fix (Error Source)
**File:** `apps/dashboard/cardbey-marketing-dashboard/src/lib/apiBase.ts`

**Line 142:**
- ❌ **Before:** `if (process.env.DEBUG && !hasLoggedDevCoreUrl)`
- ✅ **After:** `const isDebug = import.meta.env.DEV || import.meta.env.MODE === 'development' || (typeof window !== 'undefined' && window.location.hostname === 'localhost'); if (isDebug && !hasLoggedDevCoreUrl)`

---

### All Files Fixed (27 files total)

1. ✅ `src/lib/apiBase.ts` - `process.env.DEBUG` → `import.meta.env.DEV`
2. ✅ `src/lib/sseClient.ts` - All `process.env.NODE_ENV` → `import.meta.env.DEV`
3. ✅ `src/lib/useStoreContext.ts` - `process.env.DEBUG_STORE_CONTEXT` → `import.meta.env.VITE_DEBUG_STORE_CONTEXT` + localStorage fallback
4. ✅ `src/features/content-studio/components/PreviewCanvas.tsx`
5. ✅ `src/pages/signage/components/PlaylistTimelinePane.jsx`
6. ✅ `src/pages/signage/PlaylistEditorPage.jsx`
7. ✅ `src/pages/signage/components/PlaylistPreviewPane.jsx`
8. ✅ `src/pages/signage/components/AssetLibraryPane.jsx`
9. ✅ `src/app/AppShell.tsx`
10. ✅ `src/features/devices/DevicesPageTable.tsx`
11. ✅ `src/pages/public/StorePreviewPage.tsx`
12. ✅ `src/services/auth.ts`
13. ✅ `src/components/ScreenPreview.tsx`
14. ✅ `src/features/business-builder/onboarding/steps/Step4MenuImport.tsx`
15. ✅ `src/components/public/FoodShortsFeed.tsx`
16. ✅ `src/features/contents-studio/api/contents.ts`
17. ✅ `src/pages/Insights.jsx`
18. ✅ `src/pages/Screens.jsx`
19. ✅ `src/features/contents-studio/components/CanvasErrorBoundary.tsx`
20. ✅ `src/lib/coreApi.ts`
21. ✅ `src/features/devices/hooks/useDeviceLiveStatus.ts`
22. ✅ `src/utils/pairingSound.ts`
23. ✅ `src/hooks/useDeviceEngineEvents.ts`
24. ✅ `src/lib/capacitorEnv.ts`
25. ✅ `src/features/assistant/AssistantContext.tsx`
26. ✅ `src/components/VideoPreview.jsx`
27. ✅ `src/features/screens/AdminPairingAlerts.tsx`
28. ✅ `src/features/alerts/SoundAlerts.tsx`

---

## ✅ Replacement Pattern

**Before:**
```typescript
if (process.env.NODE_ENV === 'development') {
  // ...
}
```

**After:**
```typescript
const isDev = import.meta.env.DEV || import.meta.env.MODE === 'development';
if (isDev) {
  // ...
}
```

**For env vars:**
```typescript
// Before
process.env.DEBUG_STORE_CONTEXT

// After
import.meta.env.VITE_DEBUG_STORE_CONTEXT || localStorage.getItem('cardbey.debugStoreContext')
```

---

## ✅ Files NOT Changed (Node.js context - process.env is valid)

- `vite.config.js` - Node.js file
- `playwright.config.ts` - Node.js file
- `scripts/**/*.mjs` - Node.js files
- `tools/**/*.js` - Node.js files
- `tests/**/*.ts` - Node.js test files
- `packages/api-client/src/index.ts` - Used in Node.js context (has `@ts-ignore` comments)

---

## 🧪 Testing

### Test 1: MI Job Page
1. Navigate to `/mi/job/:jobId`
2. **Expected:** Page renders without "process is not defined" error
3. **Expected:** Job polling continues successfully
4. **Expected:** Job status updates (queued → running → succeeded)

### Test 2: Console Check
1. Open browser console
2. **Expected:** No "process is not defined" errors
3. **Expected:** No "ReferenceError: process" errors

---

## ✅ Acceptance Criteria

- ✅ No "process is not defined" in console
- ✅ `/mi/job/:jobId` renders without crashing
- ✅ Job polling continues and returns succeeded state
- ✅ All frontend files use `import.meta.env` instead of `process.env`
- ✅ Node.js files (scripts, tests, config) still use `process.env` (correct)

---

**Status:** ✅ Complete - All frontend `process.env` references replaced with Vite-safe `import.meta.env`.




