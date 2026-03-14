# Phase 1 JobId Polling Fixes Summary

**Date:** 2026-01-06  
**Status:** ✅ Implemented

---

## Changes Made

### 1. QuickStart Redirect Fix ✅
**File:** `apps/dashboard/cardbey-marketing-dashboard/src/lib/quickStart.ts`

- **Lines 605-609**: Robust jobId extraction from response (handles `body.jobId`, `body.data.jobId`, `body.job.id`)
- **Lines 609-612**: Added dev-only debug log: `console.debug("[QuickStart] started job", { storeId, jobId })`
- **Lines 816-820**: Redirect URL now conditionally includes jobId (falls back gracefully if missing)

**Diff:**
```diff
+    // CRITICAL: Extract jobId robustly from response (handle different response shapes)
+    const jobId = startResponse.jobId || 
+                  (startResponse as any).data?.jobId || 
+                  (startResponse as any).job?.id || 
+                  (startResponse as any).jobId;
+    const createdStoreId = startResponse.storeId || storeId;
+    const sseKey = startResponse.sseKey || `job:${jobId}`;
+    
+    // Dev-only debug log
+    if (typeof window !== 'undefined' && localStorage.getItem('cardbey.debug') === 'true') {
+      console.debug('[QuickStart] started job', { storeId: createdStoreId, jobId });
+    }
    
-    navigate(`/app/store/${createdStoreId}/review?mode=draft&jobId=${jobId}`);
+    // Navigate to store review with jobId in URL
+    // CRITICAL: Always include jobId if available (recovery will handle if missing)
+    const reviewUrl = jobId 
+      ? `/app/store/${createdStoreId}/review?mode=draft&jobId=${jobId}`
+      : `/app/store/${createdStoreId}/review?mode=draft`;
+    navigate(reviewUrl);
```

---

### 2. Review Page JobId Recovery ✅
**File:** `apps/dashboard/cardbey-marketing-dashboard/src/pages/store/StoreReviewPage.tsx`

- **Lines 150-186**: Added `resolveJobId()` helper function that:
  - Reads jobId from URL searchParams
  - If missing, recovers via `/api/mi/orchestra/job/by-store/:storeId`
  - Updates URL with `replaceState` to preserve jobId on refresh
  - Handles multiple response shapes: `{ ok:true, jobId }`, `{ ok:true, job:{ id } }`, `{ jobId }`

**Diff:**
```diff
+    // CRITICAL: Resolve jobId from URL or recover via by-store endpoint
+    const resolveJobId = async (storeIdParam: string): Promise<string | undefined> => {
+      // First, try URL search params
+      const urlJobId = searchParams.get('jobId');
+      if (urlJobId) {
+        return urlJobId;
+      }
+
+      // If missing, recover via by-store endpoint
+      try {
+        const recoveryResponse = await apiGET<{ 
+          ok: boolean; 
+          jobId?: string; 
+          job?: { id?: string };
+        }>(`/api/mi/orchestra/job/by-store/${storeIdParam}`);
+        
+        // Handle different response shapes
+        const recoveredJobId = recoveryResponse.jobId || 
+                               recoveryResponse.job?.id || 
+                               (recoveryResponse as any).jobId;
+        
+        if (recoveredJobId) {
+          // CRITICAL: Update URL with recovered jobId (replaceState to avoid navigation)
+          const newParams = new URLSearchParams(searchParams);
+          newParams.set('jobId', recoveredJobId);
+          setSearchParams(newParams, { replace: true });
+          
+          if (typeof localStorage !== 'undefined' && localStorage.getItem('cardbey.debug') === 'true') {
+            console.debug('[StoreReviewPage] Recovered jobId from by-store endpoint:', recoveredJobId);
+          }
+          
+          return recoveredJobId;
+        }
+      } catch (recoveryError) {
+        // Non-fatal: continue without jobId (will show error if needed)
+        if (typeof localStorage !== 'undefined' && localStorage.getItem('cardbey.debug') === 'true') {
+          console.warn('[StoreReviewPage] Failed to recover jobId via by-store endpoint:', recoveryError);
+        }
+      }
+
+      return undefined;
+    };

+    // Resolve jobId (async, but don't block context setting)
+    resolveJobId(storeId).then(resolvedJobId => {
+      // Update context with resolved jobId
+      setCanonicalContext({
+        storeId, // Use route storeId, not context
+        tenantId: '', // Will be set from API response if available
+        jobId: resolvedJobId,
+      });
+    });
```

---

### 3. StoreDraftReview JobId Recovery ✅
**File:** `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx`

- **Lines 727-765**: Enhanced jobId recovery logic:
  - First tries URL searchParams
  - Then tries by-store endpoint recovery
  - Updates URL with `replaceState` when recovered
  - Falls back to business.stylePreferences.activeJobId

**Diff:**
```diff
        if (!jobIdToUse) {
+         // CRITICAL: If jobId missing from URL (e.g., after refresh), recover via by-store endpoint
+         if (ctx.storeId && ctx.storeId !== 'none') {
+           try {
+             const recoveryResponse = await apiGET<{ ok: boolean; jobId?: string; job?: any }>(
+               `/api/mi/orchestra/job/by-store/${ctx.storeId}`
+             );
+             if (recoveryResponse.ok && recoveryResponse.jobId) {
+               jobIdToUse = recoveryResponse.jobId;
+               // CRITICAL: Update URL to include jobId (replaceState to avoid navigation)
+               const newParams = new URLSearchParams(searchParams);
+               newParams.set('jobId', jobIdToUse);
+               setSearchParams(newParams, { replace: true });
+               if (isDebug) {
+                 console.log('[StoreDraftReview] Recovered jobId from by-store endpoint:', jobIdToUse);
+               }
+             }
+           } catch (recoveryError) {
+             if (isDebug) {
+               console.warn('[StoreDraftReview] Failed to recover jobId via by-store endpoint:', recoveryError);
+             }
+           }
+         }
```

---

### 4. Polling Stop on COMPLETED/FAILED ✅
**File:** `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx`

- **Lines 505-560**: Enhanced terminal status handling:
  - Stops polling on COMPLETED/FAILED/BLOCKED/CANCELLED
  - On COMPLETED: refetches draft, exits "generating" mode, triggers onRefresh
  - On FAILED: shows error message, exits "generating" mode

**Diff:**
```diff
                  // CRITICAL: Stop polling immediately on terminal status
                  const TERMINAL_STATUSES = ['FAILED', 'COMPLETED', 'BLOCKED', 'CANCELLED'];
                  if (jobStatus && TERMINAL_STATUSES.includes(jobStatus)) {
                    if (isDebug) {
                      console.log('[StoreDraftReview] Job reached terminal status, stopping polling:', jobStatus);
                    }
                    // Close SSE connection if exists
                    if (typeof window !== 'undefined') {
                      const cleanup = (window as any).__jobSseCleanup?.get(jobId);
                      if (cleanup) {
                        cleanup();
                      }
                    }
                    
+                   // CRITICAL: If COMPLETED, refetch draft and exit generating mode
+                   if (jobStatus === 'COMPLETED') {
+                     // Refetch draft to get businessId and products
+                     try {
+                       const refreshedDraft = await apiGET<{
+                         ok: boolean;
+                         businessId?: string;
+                         ownerBusinessId?: string;
+                         generatedBusinessId?: string;
+                         [key: string]: any;
+                       }>(`/public/store/${draftStoreId}/draft`);
+                       
+                       const refreshedBusinessId = refreshedDraft?.businessId || 
+                                                    refreshedDraft?.ownerBusinessId || 
+                                                    refreshedDraft?.generatedBusinessId;
+                       
+                       if (refreshedBusinessId) {
+                         setBusinessId(refreshedBusinessId);
+                         setOrchestraMode('orchestra'); // Exit generating mode
+                         // Trigger onRefresh to reload draft with products
+                         if (onRefresh) {
+                           onRefresh();
+                         }
+                         if (isDebug) {
+                           console.log('[StoreDraftReview] Job COMPLETED - refetched draft and exited generating mode');
+                         }
+                       }
+                     } catch (refreshError) {
+                       if (isDebug) {
+                         console.warn('[StoreDraftReview] Failed to refetch draft after completion:', refreshError);
+                       }
+                     }
+                   }
+                   
+                   // CRITICAL: If FAILED, show error and exit generating mode
+                   if (jobStatus === 'FAILED') {
+                     const errorMessage = jobResponse?.job?.lastError || 
+                                         jobResponse?.job?.error || 
+                                         'Job failed';
+                     setOrchestraError(errorMessage);
+                     setOrchestraMode('legacy'); // Exit generating mode, show error
+                     if (isDebug) {
+                       console.log('[StoreDraftReview] Job FAILED - showing error:', errorMessage);
+                     }
+                   }
+                   
                    return;
                  }
```

---

### 5. Initial Job Fetch COMPLETED/FAILED Handling ✅
**File:** `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx`

- **Lines 785-803**: Added COMPLETED/FAILED handling when job is fetched initially (not just during polling)

**Diff:**
```diff
            if (jobResponse.ok && jobResponse.job) {
              const job = jobResponse.job;
              setOrchestraJob(job);
              const artifacts = jobResponse.allArtifacts || [];
              setOrchestraArtifacts(artifacts);
              
+             // CRITICAL: If job is COMPLETED, exit generating mode and refetch draft
+             if (job.status === 'COMPLETED' && orchestraMode === 'generating') {
+               setOrchestraMode('orchestra');
+               // Refetch draft to get products
+               if (onRefresh) {
+                 onRefresh();
+               }
+               if (isDebug) {
+                 console.log('[StoreDraftReview] Job COMPLETED - exiting generating mode and refetching draft');
+               }
+             }
+             
+             // CRITICAL: If job is FAILED, show error and exit generating mode
+             if (job.status === 'FAILED' && orchestraMode === 'generating') {
+               const errorMessage = job.lastError || job.error || 'Job failed';
+               setOrchestraError(errorMessage);
+               setOrchestraMode('legacy');
+               if (isDebug) {
+                 console.log('[StoreDraftReview] Job FAILED - showing error:', errorMessage);
+               }
+             }
+              
              // AUTOMATIC SYNC: If job.status === 'READY_FOR_REVIEW' and products API returns emptyState
```

---

### 6. Regression Guard in useJobPoll ✅
**File:** `apps/dashboard/cardbey-marketing-dashboard/src/hooks/useJobPoll.ts`

- **Lines 304-318**: Added regression guard that warns if jobId === storeId

**Diff:**
```diff
        // Update last poll time BEFORE making request
        lastPollTimeRef.current = Date.now();
        
+       // CRITICAL: Regression guard - ensure jobId is not storeId
+       const jobIdToPoll = currentJobIdRef.current;
+       if (typeof window !== 'undefined' && localStorage.getItem('cardbey.debug') === 'true') {
+         // Check if jobId looks like a storeId (both are CUIDs, but we can warn if they match)
+         // This is a dev-only warning to catch regressions
+         const urlParams = new URLSearchParams(window.location.search);
+         const urlStoreId = window.location.pathname.match(/\/store\/([^\/]+)/)?.[1];
+         if (urlStoreId && jobIdToPoll === urlStoreId) {
+           console.warn('[Orchestra] jobId appears to be storeId, check URL params', { 
+             jobId: jobIdToPoll, 
+             storeId: urlStoreId 
+           });
+         }
+       }
+       
-       const response = await apiGET(`/api/mi/orchestra/job/${currentJobIdRef.current}`);
+       const response = await apiGET(`/api/mi/orchestra/job/${jobIdToPoll}`);
```

---

## Endpoints Used

- **GET `/api/mi/orchestra/job/:jobId`**: Fetch job status (used for polling)
- **GET `/api/mi/orchestra/job/by-store/:storeId`**: Recover jobId from storeId
- **GET `/public/store/:storeId/draft`**: Refetch draft after job completion

---

## Verification Checklist

✅ **Test 1: Generate store and verify jobId in URL**
- Click "Generate" in QuickStart
- Verify URL: `/app/store/{storeId}/review?mode=draft&jobId={jobId}`
- Verify jobId is NOT the same as storeId

✅ **Test 2: Refresh page and verify jobId recovery**
- Generate store (jobId in URL)
- Remove jobId from URL manually
- Refresh page
- Verify: jobId is recovered via by-store endpoint
- Verify: URL is updated with jobId (replaceState)

✅ **Test 3: Verify polling uses jobId (not storeId)**
- Open browser DevTools → Network tab
- Generate store
- Verify: `GET /api/mi/orchestra/job/{jobId}` (NOT `/api/mi/orchestra/job/{storeId}`)

✅ **Test 4: Verify polling stops on COMPLETED**
- Generate store
- Wait for job to complete
- Verify: Polling stops (no more GET requests)
- Verify: "Generating store..." spinner disappears
- Verify: Products are displayed

✅ **Test 5: Verify draft refetch after COMPLETED**
- Generate store
- Wait for job to complete
- Verify: Draft is refetched (check Network tab)
- Verify: Products appear in UI

---

## Summary

**Files Changed:**
1. `apps/dashboard/cardbey-marketing-dashboard/src/lib/quickStart.ts` (3 locations)
2. `apps/dashboard/cardbey-marketing-dashboard/src/pages/store/StoreReviewPage.tsx` (1 location)
3. `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx` (3 locations)
4. `apps/dashboard/cardbey-marketing-dashboard/src/hooks/useJobPoll.ts` (1 location)

**Key Fixes:**
1. ✅ QuickStart redirect includes jobId in URL
2. ✅ Review page recovers jobId via by-store endpoint if missing
3. ✅ Polling uses jobId (not storeId) - regression guard added
4. ✅ Polling stops on COMPLETED/FAILED
5. ✅ UI exits "generating" mode on COMPLETED/FAILED
6. ✅ Draft is refetched after job completion

**No breaking changes** - all fixes are additive or correct existing bugs.




