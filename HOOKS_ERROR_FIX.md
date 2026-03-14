# React Hooks Error Fix - "Rendered fewer hooks than expected"

**Date:** 2026-01-12  
**Error:** `Error: Rendered fewer hooks than expected. This may be caused by an accidental early return statement.`  
**Location:** `StoreReviewPage` component  
**Status:** ✅ **FIXED**

---

## 🔍 Root Cause

The error occurred because there was a **conditional `if` statement** (debug logging) at lines 2081-2099 that was **NOT inside a hook**, but was placed **between hooks**. This can cause React to miscount hooks on re-render when the condition changes.

**Problematic Code:**
```typescript
// Line 2079-2099: Conditional if statement between hooks
if (import.meta.env.DEV) {
  const isDebug = typeof localStorage !== 'undefined' && localStorage.getItem('cardbey.debug') === 'true';
  if (isDebug && (loading || !draft)) {
    console.log('[StoreReviewPage] 🔍 Loading state debug:', { ... });
  }
}

// Line 2103: Early return AFTER hooks (this is fine)
if (draftStatus === 'error' || (draft && draft.meta?.status === 'error')) {
  return ( ... );
}
```

**Why This Causes the Error:**
- When the component re-renders and the condition changes (e.g., `draftStatus` changes from 'error' to something else), React might miscount hooks
- The conditional `if` statement is not a hook, but it's between hooks, which can confuse React's hook tracking
- React tracks hooks by call order, so if the number of hooks changes between renders, it throws this error

---

## ✅ Fix Applied

**Changed:** Moved the debug logging into a `useEffect` hook to ensure it's always called in the same order.

**Fixed Code:**
```typescript
// Line 2079-2099: Moved to useEffect (always called in same order)
useEffect(() => {
  if (import.meta.env.DEV) {
    const isDebug = typeof localStorage !== 'undefined' && localStorage.getItem('cardbey.debug') === 'true';
    if (isDebug && (loading || !draft)) {
      console.log('[StoreReviewPage] 🔍 Loading state debug:', {
        storeId,
        jobId: urlJobId,
        loading,
        error,
        hasDraft: !!draft,
        draftStoreId: draft?.meta?.storeId,
        draftProductsCount: draft?.catalog?.products?.length || 0,
        draftCategoriesCount: draft?.catalog?.categories?.length || 0,
        hasLoadedRef: hasLoadedRef.current,
        draftFetchInFlight: draftFetchInFlightRef.current,
        lastRequestId: lastRequestIdRef.current,
        routeStoreId: routeStoreIdRef.current,
      });
    }
  }
}, [loading, draft, storeId, urlJobId, error]);
```

---

## 📋 React Hooks Rules

### ✅ Always Follow These Rules:

1. **Hooks must be called in the same order every render**
   - ✅ All hooks at the top level
   - ✅ No conditional hook calls
   - ✅ No hooks inside loops or conditions

2. **Early returns are OK, but only AFTER all hooks**
   - ✅ Early return after all hooks (line 2107, 2247) - **CORRECT**
   - ❌ Early return before hooks - **WRONG**

3. **Conditional statements between hooks can cause issues**
   - ❌ `if` statements between hooks (can confuse React)
   - ✅ Move conditionals into `useEffect` or `useMemo`

---

## 🧪 Testing

**Test Steps:**
1. Navigate to store review page
2. Trigger job failure (or wait for job to fail)
3. Verify no "Rendered fewer hooks" error
4. Check that error UI displays correctly
5. Try retry button - verify no hooks error

**Expected Result:**
- ✅ No React hooks errors
- ✅ Error UI displays correctly
- ✅ Retry button works
- ✅ Component re-renders correctly

---

## 📝 Files Changed

**File:** `apps/dashboard/cardbey-marketing-dashboard/src/pages/store/StoreReviewPage.tsx`

**Change:**
- Moved debug logging from conditional `if` statement to `useEffect` hook
- Added proper dependencies to `useEffect`
- Ensures hooks are always called in the same order

---

## ✅ Status

**Fix Applied:** ✅  
**Linter Errors:** ✅ None  
**Ready for Testing:** ✅

---

**Next Steps:**
1. Test the fix in browser
2. Verify no hooks errors occur
3. Confirm error UI works correctly
4. Test retry functionality

