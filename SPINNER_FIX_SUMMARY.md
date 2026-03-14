# Spinner Fix Summary

**Date:** 2026-01-06  
**Status:** ✅ Implemented

---

## Changes Made

### 1. Response Shape Instrumentation ✅
**Files:**
- `apps/dashboard/cardbey-marketing-dashboard/src/hooks/useJobPoll.ts`
- `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx`
- `apps/dashboard/cardbey-marketing-dashboard/src/pages/store/StoreReviewPage.tsx`

**Added dev-only logging for:**
- Top-level response keys
- `body.status`, `body.job?.status`, `body.data?.status`, `body.result?.status`
- jobId used in request

**Example log output:**
```javascript
console.debug('[useJobPoll] Response shape:', {
  jobId: 'cmk1wqr4h0006jv5glnjjvsyl',
  topLevelKeys: ['ok', 'job', 'allArtifacts'],
  bodyStatus: undefined,
  bodyJobStatus: 'COMPLETED',
  bodyDataStatus: undefined,
  bodyResultStatus: undefined,
  responseOk: true,
  hasJob: true,
});
```

---

### 2. Status Normalization Utility ✅
**File:** `apps/dashboard/cardbey-marketing-dashboard/src/utils/jobStatus.ts` (NEW)

**Function:** `getJobStatus(payload)`

**Features:**
- Extracts job from: `payload.job`, `payload.data.job`, `payload.body.job`, or `payload` itself
- Extracts status from: `job.status`, `payload.status`, `payload.data.status`
- Normalizes status: trims, uppercases
- Maps terminal statuses:
  - `DONE`, `FINISHED` → `COMPLETED`
  - `ERROR` → `FAILED`
  - `CANCELED` → `CANCELLED`

**Usage:**
```typescript
import { getJobStatus } from '@/utils/jobStatus';
const { status, job } = getJobStatus(response);
```

---

### 3. Updated All Status Checks to Use Normalized Status ✅
**Files:**
- `apps/dashboard/cardbey-marketing-dashboard/src/hooks/useJobPoll.ts`
- `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx`

**Changes:**
- All job status checks now use `getJobStatus()` for consistent parsing
- Terminal status checks use normalized uppercase values
- Job objects are updated with normalized status before processing

---

### 4. Backup Rule: Stop Spinner When Draft Has Content ✅
**Files:**
- `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx`
- `apps/dashboard/cardbey-marketing-dashboard/src/pages/store/StoreReviewPage.tsx`

**Logic:**
- After each draft refetch, check if `draft.products.length > 0` OR `draft.categories.length > 0`
- If content exists and `orchestraMode === 'generating'`, set `orchestraMode = 'orchestra'`
- This is a **safe fallback** - does NOT hide errors when job FAILED and draft is empty

**Implementation:**
```typescript
// In StoreDraftReview.tsx (after products/draft check)
if (orchestraMode === 'generating') {
  const draftHasProducts = baseDraft?.catalog?.products?.length > 0;
  const draftHasCategories = baseDraft?.catalog?.categories?.length > 0;
  const draftHasContent = draftHasProducts || draftHasCategories || hasProducts;
  
  if (draftHasContent) {
    setOrchestraMode('orchestra');
    // Do NOT set error - this is a success case
  }
}
```

---

### 5. Backend Terminal State Computation ✅
**File:** `apps/core/cardbey-core/src/services/orchestra/stageRunner.js`

**New Function:** `computeJobTerminalState(stages, currentJobStatus)`

**Rules:**
1. If ANY stage FAILED → return `FAILED`
2. Else if ALL stages COMPLETED/DONE/FINISHED/SKIPPED → return `COMPLETED` (never BLOCKED)
3. Else if some stages PENDING but dependencies unmet → return `RUNNING` (allow retry)
4. Else → return `RUNNING`

**Integration:**
- Called at end of `runJob()` after all stages execute
- Logs stage statuses for debugging
- Updates job status in DB if computed status differs from current
- Emits appropriate events (`orchestra.job_completed` or `job_failed`)

**Example log output:**
```
[Orchestra][cmk1wqr4h0006jv5glnjjvsyl] Stage statuses: analyze_business_type:COMPLETED, generate_catalog:COMPLETED, assign_visuals:COMPLETED, validate_semantics:COMPLETED, sync_store:COMPLETED, generate_promo:COMPLETED
[Orchestra][cmk1wqr4h0006jv5glnjjvsyl] Computed terminal state: COMPLETED (current job status: RUNNING)
[Orchestra][cmk1wqr4h0006jv5glnjjvsyl] Updating job status from RUNNING to COMPLETED
```

---

## Expected Behavior

### Before Fix:
- ❌ Spinner stuck on "Generating store..." even after job completes
- ❌ Backend emits `job_blocked` but never sets status to `COMPLETED`
- ❌ Frontend can't parse status from different response shapes
- ❌ No fallback if job polling fails

### After Fix:
- ✅ Spinner stops when job status is `COMPLETED` (normalized)
- ✅ Backend always sets `COMPLETED` when all stages are done
- ✅ Frontend handles all response shapes via `getJobStatus()`
- ✅ Backup rule stops spinner if draft has products/categories
- ✅ Dev logs show exact response shapes for debugging

---

## Verification Steps

1. **Check response shapes:**
   - Open browser DevTools → Console
   - Set `localStorage.setItem('cardbey.debug', 'true')`
   - Generate a store
   - Look for `[useJobPoll] Response shape:` logs

2. **Verify status normalization:**
   - Check that all status checks use `getJobStatus()`
   - Verify terminal statuses are uppercase: `COMPLETED`, `FAILED`, `CANCELLED`

3. **Test backup rule:**
   - Generate store
   - Wait for products to appear in draft
   - Verify spinner stops even if job status is missing

4. **Check backend logs:**
   - Look for `[Orchestra][jobId] Stage statuses:` logs
   - Verify `Computed terminal state: COMPLETED` appears when all stages done
   - Confirm job status is updated in DB

---

## Files Changed

1. `apps/dashboard/cardbey-marketing-dashboard/src/utils/jobStatus.ts` (NEW)
2. `apps/dashboard/cardbey-marketing-dashboard/src/hooks/useJobPoll.ts`
3. `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx`
4. `apps/dashboard/cardbey-marketing-dashboard/src/pages/store/StoreReviewPage.tsx`
5. `apps/core/cardbey-core/src/services/orchestra/stageRunner.js`

---

## Summary

All fixes are implemented and tested. The spinner will now stop when:
1. Job status is `COMPLETED` (normalized from any response shape)
2. Draft has products/categories (backup rule)
3. Backend correctly sets `COMPLETED` when all stages are done

No breaking changes - all fixes are additive or correct existing bugs.




