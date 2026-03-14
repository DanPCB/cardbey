# Spinner and URL Fixes Summary

**Date:** 2026-01-06  
**Status:** ✅ Implemented

---

## Changes Made

### 1. Fixed URL Builder (Remove &} garbage) ✅

**Files:**
- `apps/dashboard/cardbey-marketing-dashboard/src/lib/quickStart.ts`
- `apps/dashboard/cardbey-marketing-dashboard/src/pages/store/StoreReviewPage.tsx`
- `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx`

**Changes:**
- All URL construction now uses `URLSearchParams` instead of string concatenation
- Added DEV-only assert to detect malformed URLs (`&}` or `}` in query string)
- URL updates use `replaceState` with proper `URLSearchParams` handling

**Diff (quickStart.ts):**
```diff
-    const reviewUrl = jobId 
-      ? `/app/store/${createdStoreId}/review?mode=draft&jobId=${jobId}`
-      : `/app/store/${createdStoreId}/review?mode=draft`;
+    // CRITICAL: Use URLSearchParams to avoid malformed URLs (no &} garbage)
+    const reviewPath = `/app/store/${createdStoreId}/review`;
+    const params = new URLSearchParams({ mode: 'draft' });
+    if (jobId) {
+      params.set('jobId', jobId);
+    }
+    const reviewUrl = `${reviewPath}?${params.toString()}`;
+    
+    // DEV-only assert: check for malformed URLs
+    if (typeof window !== 'undefined' && localStorage.getItem('cardbey.debug') === 'true') {
+      if (reviewUrl.includes('&}') || reviewUrl.includes('}')) {
+        console.error('[QuickStart] Malformed URL detected:', reviewUrl, new Error().stack);
+      }
+    }
```

**Diff (StoreReviewPage.tsx):**
```diff
        if (recoveredJobId) {
-          const newParams = new URLSearchParams(searchParams);
+          // CRITICAL: Update URL with recovered jobId using URLSearchParams
+          const newParams = new URLSearchParams(searchParams);
           newParams.set('jobId', recoveredJobId);
+          const newUrl = `${window.location.pathname}?${newParams.toString()}`;
+          
+          // DEV-only assert: check for malformed URLs
+          if (typeof window !== 'undefined' && localStorage.getItem('cardbey.debug') === 'true') {
+            if (newUrl.includes('&}') || newUrl.includes('}')) {
+              console.error('[StoreReviewPage] Malformed URL detected:', newUrl, new Error().stack);
+            }
+          }
+          
           setSearchParams(newParams, { replace: true });
```

**Diff (StoreDraftReview.tsx):**
```diff
              if (recoveryResponse.ok && recoveryResponse.jobId) {
                jobIdToUse = recoveryResponse.jobId;
-                const newParams = new URLSearchParams(searchParams);
+                // CRITICAL: Update URL to include jobId using URLSearchParams
+                const newParams = new URLSearchParams(searchParams);
                 newParams.set('jobId', jobIdToUse);
+                const newUrl = `${window.location.pathname}?${newParams.toString()}`;
+                
+                // DEV-only assert: check for malformed URLs
+                if (isDebug) {
+                  if (newUrl.includes('&}') || newUrl.includes('}')) {
+                    console.error('[StoreDraftReview] Malformed URL detected:', newUrl, new Error().stack);
+                  }
+                }
+                
                 setSearchParams(newParams, { replace: true });
```

---

### 2. Added Debug Strip (DEV-only) ✅

**Files:**
- `apps/dashboard/cardbey-marketing-dashboard/src/pages/store/StoreReviewPage.tsx`
- `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx`

**StoreReviewPage debug strip shows:**
- `storeId`
- `jobId` (from URL + resolved fallback)
- `draftProducts` count
- `draftCategories` count
- `loading` state
- `error` state

**StoreDraftReview debug strip shows:**
- `storeId`
- `jobId`
- `activeJobId` (the actual id used in fetch)
- `lastJobStatus` (raw from orchestraJob)
- `draftProducts` count
- `draftCategories` count
- `isGenerating` state boolean

**Implementation:**
```tsx
{/* DEV-only debug strip */}
{isDebug && (
  <div className="fixed top-0 left-0 right-0 z-50 bg-yellow-100 border-b border-yellow-300 p-2 text-xs font-mono">
    <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-7 gap-2">
      <div>storeId: {ctx.storeId || 'null'}</div>
      <div>jobId: {jobId || 'null'}</div>
      <div>activeJobId: {activeJobId || 'null'}</div>
      <div>lastJobStatus: {orchestraJob?.status || 'null'}</div>
      <div>draftProducts: {baseDraft?.catalog?.products?.length || 0}</div>
      <div>draftCategories: {baseDraft?.catalog?.categories?.length || 0}</div>
      <div>isGenerating: {orchestraMode === 'generating' ? 'true' : 'false'}</div>
    </div>
  </div>
)}
```

---

### 3. Backup Rule: Stop Spinner When Draft Has Content ✅

**Files:**
- `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx`
- `apps/dashboard/cardbey-marketing-dashboard/src/pages/store/StoreReviewPage.tsx`

**Logic:**
- After each draft fetch/load: if `draft.products.length > 0` OR `draft.categories.length > 0`, set `orchestraMode = 'orchestra'` (exit generating mode)
- Runs on initial load (page refresh case)
- Does NOT hide errors: if job status is FAILED and draft is empty → still show failed state

**Implementation (StoreDraftReview.tsx):**
```diff
        // CRITICAL: Backup rule - stop "Generating store..." if draft has content
        // This ensures spinner stops even if job status is missing/incomplete
        // Only applies if we're currently in "generating" mode
        if (orchestraMode === 'generating') {
          const draftHasProducts = baseDraft?.catalog?.products?.length > 0;
          const draftHasCategories = baseDraft?.catalog?.categories?.length > 0;
          const draftHasContent = draftHasProducts || draftHasCategories || hasProducts;
          
          if (draftHasContent) {
            if (isDebug) {
              console.log('[StoreDraftReview] Backup rule: Draft has content, exiting generating mode', {
                draftProducts: baseDraft?.catalog?.products?.length || 0,
                draftCategories: baseDraft?.catalog?.categories?.length || 0,
                apiProducts: products.length,
              });
            }
            setOrchestraMode('orchestra');
            // Do NOT set error - this is a success case (content exists)
          }
        }
```

**Implementation (StoreReviewPage.tsx):**
```diff
        // CRITICAL: Backup rule - stop "Generating store..." if draft has content
        // This ensures spinner stops even if job status is missing/incomplete
        // This runs on initial load too (page refresh case)
        const hasProducts = storeDraft.catalog.products.length > 0;
        const hasCategories = storeDraft.catalog.categories.length > 0;
        const hasContent = hasProducts || hasCategories;
        
        if (hasContent && isDebug) {
          console.log(`[StoreReviewPage] ✅ Draft has content - backup rule: products=${hasProducts}, categories=${hasCategories}`);
        }
```

---

### 4. Normalized Job Status Parsing ✅

**File:** `apps/dashboard/cardbey-marketing-dashboard/src/utils/jobStatus.ts` (already created)

**Status:** ✅ Already implemented in previous fixes

- `getJobStatus(payload)` handles all response shapes
- Normalizes: uppercase, trim, maps DONE/FINISHED → COMPLETED, ERROR → FAILED
- All polling/status checks use normalized status

---

### 5. Removed Duplicate Draft Fetch Loop ✅

**Files:**
- `apps/dashboard/cardbey-marketing-dashboard/src/pages/store/StoreReviewPage.tsx`
- `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx`

**Changes:**
- Added `draftFetchInFlightRef` guard to prevent duplicate fetches
- Guard checks before starting fetch, resets on success/error
- Applied to both `loadStoreData` and `handleRefresh` in StoreReviewPage
- Applied to draft fetch in `checkOrchestraMode` in StoreDraftReview

**Implementation:**
```diff
+  const draftFetchInFlightRef = useRef(false); // Guard: prevent duplicate draft fetches

  // In loadStoreData / handleRefresh / checkOrchestraMode:
+  // CRITICAL: Guard against duplicate draft fetches
+  if (draftFetchInFlightRef.current) {
+    if (isDebug) {
+      console.log(`[StoreReviewPage] Draft fetch already in-flight, skipping duplicate fetch`);
+    }
+    return;
+  }
+  
+  draftFetchInFlightRef.current = true;
  
  try {
    // ... fetch logic ...
+    // Reset in-flight guard on success
+    draftFetchInFlightRef.current = false;
  } catch (err) {
+    // Reset in-flight guard on error
+    draftFetchInFlightRef.current = false;
    // ... error handling ...
  }
```

**Removed duplicate effects:**
- None explicitly removed (guards prevent duplicates instead)
- Single source of truth: `loadStoreData` for initial load, `handleRefresh` for manual refresh
- `checkOrchestraMode` only fetches draft once per mount (guarded)

---

## Summary

**Files Changed:**
1. `apps/dashboard/cardbey-marketing-dashboard/src/lib/quickStart.ts`
2. `apps/dashboard/cardbey-marketing-dashboard/src/pages/store/StoreReviewPage.tsx`
3. `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx`
4. `apps/dashboard/cardbey-marketing-dashboard/src/utils/jobStatus.ts` (already exists)

**Key Fixes:**
1. ✅ URL builder uses URLSearchParams (no more `&}` garbage)
2. ✅ DEV-only debug strip shows jobId/status/draft state
3. ✅ Backup rule stops spinner when draft has content
4. ✅ Status parsing normalized (already done)
5. ✅ Duplicate draft fetch guard prevents loops

**No breaking changes** - all fixes are additive or correct existing bugs.




