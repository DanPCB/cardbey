# Phase 1 JobId Polling Fix Plan

**Date:** 2026-01-06  
**Issue:** Review page spinner never stops, polling uses storeId instead of jobId

---

## Problem Analysis

### Root Causes

1. **StoreReviewPage.tsx line 511**: Passes `jobId={storeId}` instead of actual `jobId` from searchParams
   - This causes `StoreDraftReview` to receive `storeId` as `jobId` prop
   - Polling then uses storeId instead of jobId

2. **Missing jobId recovery**: When user refreshes, if `jobId` is missing from URL, no recovery mechanism exists
   - Backend has `/api/mi/orchestra/job/by-store/:storeId` endpoint (needs verification)
   - Frontend doesn't use it to recover jobId

3. **Polling doesn't stop on COMPLETED**: Component checks terminal status but may not exit "generating" mode
   - `orchestraMode === 'generating'` persists even after job completes
   - Need to refetch draft and exit generating state

4. **URL doesn't preserve jobId**: After refresh, jobId may be lost from URL

---

## Files to Edit

### 1. `apps/dashboard/cardbey-marketing-dashboard/src/pages/store/StoreReviewPage.tsx`
   - **Line 511**: Fix `jobId={storeId}` → `jobId={searchParams.get('jobId') || undefined}`
   - **Line 155**: Already reads jobId from searchParams correctly

### 2. `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx`
   - **Line 676-694**: Add jobId recovery via `/api/mi/orchestra/job/by-store/:storeId` if jobId missing
   - **Line 500**: Ensure polling uses actual jobId (not storeId)
   - **Line 520-550**: After job COMPLETED, refetch draft and exit "generating" mode
   - **Line 3195-3208**: Exit "generating" mode when job completes

### 3. `apps/dashboard/cardbey-marketing-dashboard/src/lib/quickStart.ts`
   - **Line 809**: Already includes jobId in URL ✅
   - **Verify**: Response contains jobId (line 605)

---

## Step-by-Step Fix Plan

### Step 1: Fix StoreReviewPage to pass correct jobId

**File:** `apps/dashboard/cardbey-marketing-dashboard/src/pages/store/StoreReviewPage.tsx`

**Change:**
```diff
  // Use storeId as jobId for patch system (allows draft editing)
  return (
    <StoreDraftReview
-     jobId={storeId}
+     jobId={searchParams.get('jobId') || undefined}
      baseDraft={draft}
      onContinue={() => {
        // After publish, navigate to content studio or dashboard
        navigate(`/app/store/${storeId}`);
      }}
      onRefresh={handleRefresh}
    />
  );
```

**Why:** StoreReviewPage was incorrectly passing `storeId` as `jobId`, causing all polling to use the wrong identifier.

---

### Step 2: Add jobId recovery in StoreDraftReview

**File:** `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx`

**Location:** Around line 675-694 (where jobIdToUse is computed)

**Change:**
```diff
        // Step 2: Read activeJobId from response, jobId query param, or fetch from business
        const responseJobId = projectionJobId;
        const queryJobId = searchParams.get('jobId');
        let jobIdToUse = responseJobId || queryJobId;
        
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
+               console.log('[StoreDraftReview] Recovered jobId from by-store endpoint:', jobIdToUse);
+             }
+           } catch (recoveryError) {
+             console.warn('[StoreDraftReview] Failed to recover jobId via by-store endpoint:', recoveryError);
+           }
+         }
+         
          // Fallback: try to get from business
          try {
            const businessResponse = await apiGET('/auth/me');
            const stylePrefs = businessResponse?.user?.business?.stylePreferences;
            if (typeof stylePrefs === 'string') {
              const parsed = JSON.parse(stylePrefs);
              jobIdToUse = parsed?.activeJobId;
            } else if (stylePrefs?.activeJobId) {
              jobIdToUse = stylePrefs.activeJobId;
            }
          } catch (e) {
            console.warn('[StoreDraftReview] Failed to fetch business for activeJobId:', e);
          }
        }
```

**Why:** When user refreshes, jobId may be missing from URL. Recovery via by-store endpoint ensures polling uses correct jobId.

---

### Step 3: Stop polling and exit "generating" mode on COMPLETED

**File:** `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx`

**Location 1:** Around line 500-550 (pollForBusinessId function)

**Change:**
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
+                     // Refetch draft to get businessId
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
+                       }
+                     } catch (refreshError) {
+                       console.warn('[StoreDraftReview] Failed to refetch draft after completion:', refreshError);
+                     }
+                   }
                    return;
                  }
```

**Location 2:** Around line 707-720 (after jobResponse.ok check)

**Change:**
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
+             }
+              
              // AUTOMATIC SYNC: If job.status === 'READY_FOR_REVIEW' and products API returns emptyState
              if (job.status === 'READY_FOR_REVIEW' && isEmptyState) {
```

**Why:** When job completes, component must exit "generating" mode and refetch draft to show products.

---

### Step 4: Ensure useJobPoll stops on COMPLETED

**File:** `apps/dashboard/cardbey-marketing-dashboard/src/hooks/useJobPoll.ts`

**Status:** ✅ Already implemented correctly
- Line 319: Checks `TERMINAL_STATUSES.includes(job.status)`
- Line 173-216: `handleJobProgress` stops on terminal status
- Line 338-343: Stops scheduling next poll if terminal

**No changes needed** - hook already handles terminal status correctly.

---

## Edge Cases

### Edge Case 1: User refreshes before jobId is in URL
**Scenario:** User clicks "Generate" but refreshes before navigation completes
**Fix:** Recovery via by-store endpoint (Step 2)

### Edge Case 2: jobId in URL but job doesn't exist
**Scenario:** User manually edits URL with invalid jobId
**Fix:** Backend returns 404, frontend should show error (already handled)

### Edge Case 3: Multiple jobs for same storeId
**Scenario:** User generates store multiple times
**Fix:** by-store endpoint returns latest job (backend behavior)

### Edge Case 4: Job completes but draft not yet synced
**Scenario:** Job status is COMPLETED but products not in draft yet
**Fix:** Refetch draft after COMPLETED (Step 3) - may need retry logic

### Edge Case 5: SSE connected but job completes
**Scenario:** SSE stream is active when job completes
**Fix:** SSE handler already closes connection on terminal status (line 663-675 in quickStart.ts)

---

## Verification Checklist

### Test 1: Generate store and verify jobId in URL
```bash
# 1. Click "Generate" in QuickStart
# 2. Verify URL: /app/store/{storeId}/review?mode=draft&jobId={jobId}
# 3. Verify jobId is NOT the same as storeId
```

### Test 2: Refresh page and verify jobId recovery
```bash
# 1. Generate store (jobId in URL)
# 2. Remove jobId from URL manually
# 3. Refresh page
# 4. Verify: jobId is recovered via by-store endpoint
# 5. Verify: URL is updated with jobId (replaceState)
```

### Test 3: Verify polling uses jobId (not storeId)
```bash
# 1. Open browser DevTools → Network tab
# 2. Generate store
# 3. Verify: GET /api/mi/orchestra/job/{jobId} (NOT /api/mi/orchestra/job/{storeId})
```

### Test 4: Verify polling stops on COMPLETED
```bash
# 1. Generate store
# 2. Wait for job to complete
# 3. Verify: Polling stops (no more GET requests)
# 4. Verify: "Generating store..." spinner disappears
# 5. Verify: Products are displayed
```

### Test 5: Verify draft refetch after COMPLETED
```bash
# 1. Generate store
# 2. Wait for job to complete
# 3. Verify: Draft is refetched (check Network tab)
# 4. Verify: Products appear in UI
```

---

## Summary

**Files Changed:**
1. `apps/dashboard/cardbey-marketing-dashboard/src/pages/store/StoreReviewPage.tsx` (1 line)
2. `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx` (3 locations)

**Key Fixes:**
1. ✅ Pass correct jobId from URL (not storeId)
2. ✅ Recover jobId via by-store endpoint if missing
3. ✅ Stop polling on COMPLETED/FAILED
4. ✅ Exit "generating" mode and refetch draft on COMPLETED
5. ✅ Update URL with recovered jobId (replaceState)

**No breaking changes** - all fixes are additive or correct existing bugs.




