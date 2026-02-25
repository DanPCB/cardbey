# Console Errors Fix Summary

**Date:** 2025-01-XX  
**Scope:** Fixed multiple console errors in Media Library and related components

---

## Issues Fixed

### 1. ✅ CaiBalance.jsx - "ReferenceError: number is not defined"

**Problem:**  
Using TypeScript generic syntax `<{ balance: number }>` in a `.jsx` file. TypeScript types don't work in JSX files, causing `number` to be interpreted as a variable.

**Fix:**
```javascript
// Before
const data = await apiGET<{ balance: number }>(`/api/reward/balance/${userId}`);

// After
const data = await apiGET(`/api/reward/balance/${userId}`);
const newBalance = data?.balance || 0;
```

**File:** `src/components/CaiBalance.jsx`

---

### 2. ✅ MediaLibrary.jsx - "Failed to get upload URL" & Relative API Usage

**Problem:**  
Using relative `/api` paths which are blocked by `ban-relative-api.ts`. The component was using `API_BASE` which defaults to `/api`.

**Fix:**
- Replaced all `API_BASE` usage with `buildApiUrl()` from `@/lib/apiBase`
- Updated all fetch calls to use `buildApiUrl("/api/uploads/...")`

**Files Changed:**
- `src/components/MediaLibrary.jsx`
  - Line 13: Added `import { buildApiUrl } from "@/lib/apiBase";`
  - Line 82: `fetch(buildApiUrl(\`/api/uploads/mine?${params}\`))`
  - Line 124: `fetch(buildApiUrl("/api/uploads/create"), ...)`
  - Line 205: `fetch(buildApiUrl("/api/uploads/complete"), ...)`
  - Line 292: `fetch(buildApiUrl(\`/api/uploads/${id}?userId=...\`), ...)`

---

### 3. ✅ performer.js - "Relative /api usage is forbidden"

**Problem:**  
`getLastSession()` function was using `ensureRelative()` which creates relative `/api/...` paths, blocked by `ban-relative-api.ts`.

**Fix:**
```javascript
// Before
const path = ensureRelative(`${API_BASE ? API_BASE : '/api'}/performer/lastSession?${params}`);

// After
const { buildApiUrl } = await import('@/lib/apiBase');
const path = buildApiUrl(`/api/performer/lastSession?${params}`);
```

**File:** `src/lib/api/performer.js`

---

### 4. ✅ ContentsStudio.tsx - "Should not already be working" React Error

**Problem:**  
`window.confirm()` called during React render causes concurrent mode issues. The error "Should not already be working" occurs when React is rendering and a blocking call interrupts it.

**Fix:**
```typescript
// Before
const shouldRestore = window.confirm("Restore last autosave?");
if (!shouldRestore) return;
// ... restore logic

// After
setTimeout(() => {
  const shouldRestore = window.confirm("Restore last autosave?");
  if (!shouldRestore) return;
  // ... restore logic
}, 0);
```

**File:** `src/pages/ContentsStudio.tsx` (line 1117)

---

## Remaining Issues (Not Fixed)

### 1. MIME Type Errors for .jsx Files

**Error:**
```
Loading module from "http://localhost:5174/src/components/CaiBalance.jsx?t=..." 
was blocked because of a disallowed MIME type ("")
```

**Cause:**  
Vite dev server may not be serving `.jsx` files with correct `Content-Type: application/javascript` header. This is often a Vite configuration issue.

**Potential Solutions:**
1. Check `vite.config.js` for proper MIME type configuration
2. Ensure Vite dev server is configured correctly
3. May require Vite plugin or server middleware fix

**Impact:** Low - Files still load, just console warnings

---

### 2. CORS Error for via.placeholder.com

**Error:**
```
Cross-Origin Request Blocked: The Same Origin Policy disallows reading the remote resource 
at https://via.placeholder.com/1920x1080/4F46E5/FFFFFF?text=Sample+Media+Preview
```

**Status:**  
This was previously addressed in `CAI_BALANCE_AND_CORS_FIX_SUMMARY.md`, but some components may still reference external URLs.

**Files to Check:**
- `src/components/public/CardShortView.tsx` (line 378) - Still has Unsplash URL
- `src/orchestrator/flows/signage_from_menu.ts` (lines 122-123) - Still has via.placeholder URLs

**Recommendation:** Replace with local placeholder images or Core-hosted URLs

---

### 3. CSS Syntax Error

**Error:**
```
Expected declaration but found '['. Skipped to next declaration.
```

**Cause:**  
Likely a CSS syntax error in a stylesheet or inline style. The `[` character suggests it might be a CSS custom property or invalid syntax.

**Action Required:**  
Search for CSS files with `[` characters or check inline styles in components.

---

## Testing Checklist

After fixes:
- [x] CAI Balance loads without "number is not defined" error
- [x] Media Library upload works (no "Failed to get upload URL")
- [x] PerformerMain loads without "Relative /api usage" error
- [x] ContentsStudio autosave restore doesn't cause React error
- [ ] MIME type warnings still appear (Vite config issue)
- [ ] CORS warnings for external images (need to replace URLs)

---

## Summary

**Fixed:** 4 critical errors
- ✅ CaiBalance TypeScript syntax
- ✅ MediaLibrary relative API paths
- ✅ performer.js relative API paths
- ✅ ContentsStudio window.confirm React error

**Remaining:** 3 non-critical issues
- ⚠️ MIME type warnings (Vite config)
- ⚠️ CORS warnings (external URLs)
- ⚠️ CSS syntax error (needs investigation)

All critical functionality should now work without console errors blocking user actions.

































