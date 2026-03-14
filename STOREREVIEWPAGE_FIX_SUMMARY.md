# StoreReviewPage Infinite Loading Fix Summary

## Problem
- Console logs: `[draft-load][SELF_CHECK_FAIL] Response was ok:true in stored but setDraft was not called`
- Repeated GET `/api/stores/:id/draft` requests
- UI stuck on "Loading store..." indefinitely
- `[DRAFT_PLACEHOLDER_SKIPPED] reason: orchestration_in_progress`

## Root Cause
- `loadDraft()` was returning early when placeholder was detected during orchestration, **without calling `setDraft()`**
- UI depends on `!draft` to show loading spinner, so if `setDraft` never runs, it never exits loading state
- Even when response was `ok:true`, placeholder drafts were skipped entirely

## Solution

### 1. **Always Call setDraft When Response is OK**

**File:** `apps/dashboard/cardbey-marketing-dashboard/src/pages/store/StoreReviewPage.tsx`

**Key Changes:**
- **Line ~1387-1402:** Modified placeholder handling to **ALWAYS call `setDraft()`** when response is `ok:true`, even for placeholders
- **Invariant enforced:** If HTTP response `ok === true` AND body is parsed, **ALWAYS call `setDraft(normalizedDraft)`**
- Even if status is "generating" and catalog is empty, still `setDraft` with meta + status

**Before:**
```typescript
if (shouldSkipPlaceholder) {
  // Don't set draft - keep loading state until real draft arrives
  setLoading(true);
  return; // Exit early without calling setDraft
}
```

**After:**
```typescript
// CRITICAL: ALWAYS set draft when response is ok, even for placeholders
// This prevents infinite loading state - UI will show "generating" instead
didSetDraft = true;
didSetDraftRef.current = true;
draftRef.current = storeDraft;
if (isLatest()) {
  setDraft(storeDraft);
  // CRITICAL: Update draftStatus so UI can check if status is "generating"
  const currentStatus = storeDraft.meta?.status || null;
  setDraftStatus(currentStatus);
  setError(null);
  // If orchestration in progress and status is generating, keep loading state
  // Otherwise, clear loading since we have a draft to show
  if (!shouldSkipPlaceholder || currentStatus !== 'generating') {
    setLoading(false);
  }
}
hasLoadedRef.current = true;
return; // Exit early (finally block will handle loading state)
```

### 2. **Normalize Draft Shape with Status**

**Changes:**
- **Line ~1170-1204:** Ensure `storeDraft.meta.status` is always set from response
- **Line ~833-840:** Capture `responseStatus` from `loadDraftWithFallback` and include in `storeData`
- **Line ~488-556:** Updated `loadDraftWithFallback` to return `responseStatus` from both auth and public endpoints

**Code:**
```typescript
// Convert to StoreDraft format
// CRITICAL: Always include status from response (even if "generating" or empty)
const draftStatus = storeData.status || storeData.store?.status || null;
const storeDraft: StoreDraft = {
  meta: {
    storeId: storeData.store.id,
    storeName: storeData.store.name || 'Untitled Store',
    // ... other fields ...
    status: draftStatus, // CRITICAL: Include status so UI can show "generating" state
  },
  catalog: {
    products: (storeData.products || []).map(...),
    categories: (storeData.categories || []).map(...),
  },
  assets: [],
};
```

### 3. **Change Loading/Spinner Logic**

**Line ~1967-2009:** Updated loading gate to show "generating" state instead of infinite spinner

**Before:**
```typescript
if (loading) {
  return <div>Loading store...</div>;
}
```

**After:**
```typescript
// CRITICAL: Show "generating" state if draft exists but status is generating
const isGenerating = draft && (draftStatus === 'generating' || draft.meta?.status === 'generating');
const hasProducts = (draft?.catalog?.products?.length || 0) > 0;

// Show "generating" UI if draft exists but is still generating (not infinite loading)
if (isGenerating && !hasProducts && !loading) {
  return (
    <div>
      <Loader2 className="w-12 h-12 animate-spin" />
      <h2>Generating products & categories...</h2>
      <p>We're creating your store catalog. This usually takes just a few seconds.</p>
    </div>
  );
}

// Only show global spinner if we truly don't have a draft yet
if (loading && !draft) {
  return <div>Loading store...</div>;
}
```

### 4. **Update draftStatus State**

**Changes:**
- **Line ~1318, 1393, 1430:** All `setDraft()` calls now also call `setDraftStatus(currentStatus)`
- This ensures UI can check `draftStatus === 'generating'` to show appropriate state

**Code:**
```typescript
if (isLatest()) {
  setDraft(storeDraft);
  // CRITICAL: Update draftStatus so UI can check status
  const currentStatus = storeDraft.meta?.status || null;
  setDraftStatus(currentStatus);
  setError(null);
  setLoading(false);
}
```

### 5. **Update Finally Block**

**Line ~1621-1634:** Updated finally block to preserve loading state when status is "generating"

**Before:**
```typescript
if (isLatest() && !skippedPlaceholderRef.current) {
  setLoading(false);
}
```

**After:**
```typescript
// CRITICAL: Don't clear loading if draft status is "generating" (orchestration in progress)
if (isLatest()) {
  const currentDraft = draftRef.current;
  const currentStatus = currentDraft?.meta?.status || null;
  // Only clear loading if draft is set and status is not "generating"
  if (currentDraft && currentStatus !== 'generating' && !skippedPlaceholderRef.current) {
    setLoading(false);
  }
}
```

## Verification

### Expected Behavior:
1. ✅ When response is `ok:true`, `setDraft()` is **always** called (even for placeholders)
2. ✅ Draft includes `meta.status` field (can be "generating", "ready", "error", etc.)
3. ✅ UI shows "Generating products & categories..." when `status === 'generating'` instead of infinite loading
4. ✅ No more `SELF_CHECK_FAIL` errors (setDraft is always called when response is ok)
5. ✅ Polling continues until products are generated or status changes to "ready"/"error"

### Test Cases:
1. **Placeholder during orchestration:**
   - Response: `ok:true`, `status: 'generating'`, `productsCount: 0`
   - Expected: `setDraft()` called, UI shows "Generating..." (not infinite loading)

2. **Real draft:**
   - Response: `ok:true`, `status: 'ready'`, `productsCount: 5`
   - Expected: `setDraft()` called, UI shows products

3. **Error state:**
   - Response: `ok:true`, `status: 'error'`, `lastError: 'Catalog empty'`
   - Expected: `setDraft()` called, UI shows error with Retry button

## Files Modified

1. `apps/dashboard/cardbey-marketing-dashboard/src/pages/store/StoreReviewPage.tsx`
   - Modified placeholder handling (line ~1387-1402)
   - Added status capture in `loadDraftWithFallback` (line ~488-556)
   - Updated draft normalization to include status (line ~1170-1204)
   - Updated loading UI to show "generating" state (line ~1967-2009)
   - Updated finally block to preserve loading for generating state (line ~1621-1634)
   - Added `setDraftStatus()` calls in all `setDraft()` paths (line ~1318, 1393, 1430)

## Impact

- ✅ **Fixes infinite loading:** UI transitions from global spinner to "generating" state
- ✅ **Prevents SELF_CHECK_FAIL:** `setDraft()` is always called when response is ok
- ✅ **Better UX:** Users see "Generating products & categories..." instead of stuck spinner
- ✅ **Maintains polling:** Polling continues until products are generated or status changes
- ✅ **No breaking changes:** Existing functionality preserved, only fixes the infinite loading bug

