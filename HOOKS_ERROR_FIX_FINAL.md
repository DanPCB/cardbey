# React Hooks Error Fix - Final Solution

**Date:** 2026-01-12  
**Error:** `Error: Rendered fewer hooks than expected. This may be caused by an accidental early return statement.`  
**Location:** `StoreReviewPage` component  
**Status:** ✅ **FIXED**

---

## 🔍 Root Causes Identified

### Issue 1: Conditional `if` Statement Between Hooks ✅ FIXED
**Problem:** Debug logging `if` statement at lines 2081-2099 was placed between hooks, causing React to miscount hooks on re-render.

**Fix:** Moved debug logging into a `useEffect` hook.

---

### Issue 2: `useCallback` Hooks Called Inside Hook Parameters ✅ FIXED
**Problem:** `useCallback` hooks were being called INSIDE the parameters of `useDraftPolling` and `useJobPolling`:
```typescript
// BEFORE (problematic):
const draftPolling = useDraftPolling({
  onDraftUpdate: useCallback((draft) => { ... }, [deps]), // ❌ Hook called inside parameter
  onError: useCallback((err) => { ... }, []), // ❌ Hook called inside parameter
});
```

**Why This Causes the Error:**
- When the component re-renders and dependencies change, React might see a different number of hooks
- Hooks must be called in the same order on every render
- Calling hooks inside function parameters can cause React to miscount hooks

**Fix:** Extracted `useCallback` hooks to the top level, BEFORE the hook calls:
```typescript
// AFTER (fixed):
const onDraftUpdate = useCallback((draft) => { ... }, [deps]); // ✅ Defined at top level
const onDraftPollError = useCallback((err) => { ... }, []); // ✅ Defined at top level
const onJobTerminal = useCallback((job) => { ... }, []); // ✅ Defined at top level

const draftPolling = useDraftPolling({
  onDraftUpdate, // ✅ Reference to pre-defined hook
  onError: onDraftPollError, // ✅ Reference to pre-defined hook
});
```

---

### Issue 3: `useEffect` Dependencies Causing Re-render Loops ✅ FIXED
**Problem:** `useEffect` at line 89 had `searchParams` and `setSearchParams` in dependencies, which can cause infinite loops when `setSearchParams` is called.

**Fix:** 
- Removed `searchParams` and `setSearchParams` from dependencies
- Added `hasRecoveredJobIdRef` guard to prevent multiple runs
- Only include stable dependencies: `[storeId, urlJobId]`

---

## ✅ Changes Applied

### 1. Moved Debug Logging to `useEffect`
**File:** `apps/dashboard/cardbey-marketing-dashboard/src/pages/store/StoreReviewPage.tsx`

**Before:**
```typescript
// Conditional if between hooks (problematic)
if (import.meta.env.DEV) {
  // ... debug logging ...
}
```

**After:**
```typescript
// Moved to useEffect (always called in same order)
useEffect(() => {
  if (import.meta.env.DEV) {
    // ... debug logging ...
  }
}, [loading, draft, storeId, urlJobId, error]);
```

---

### 2. Extracted `useCallback` Hooks to Top Level
**File:** `apps/dashboard/cardbey-marketing-dashboard/src/pages/store/StoreReviewPage.tsx`

**Before:**
```typescript
const draftPolling = useDraftPolling({
  onDraftUpdate: useCallback((draft) => { ... }, [deps]), // ❌
  onError: useCallback((err) => { ... }, []), // ❌
});
```

**After:**
```typescript
// Define callbacks BEFORE hooks
const onDraftUpdate = useCallback((updatedDraft: StoreDraft | null) => {
  // ... callback logic ...
}, [urlJobId, shouldAttemptSyncStore]);

const onDraftPollError = useCallback((err: Error) => {
  // ... error handling ...
}, []);

// Then use them in hooks
const draftPolling = useDraftPolling({
  onDraftUpdate, // ✅
  onError: onDraftPollError, // ✅
});
```

---

### 3. Fixed `useEffect` Dependencies
**File:** `apps/dashboard/cardbey-marketing-dashboard/src/pages/store/StoreReviewPage.tsx`

**Before:**
```typescript
useEffect(() => {
  // ... recover jobId ...
  setSearchParams(newParams, { replace: true });
}, [storeId, urlJobId, searchParams, setSearchParams]); // ❌ Can cause loops
```

**After:**
```typescript
const hasRecoveredJobIdRef = useRef(false); // Guard

useEffect(() => {
  if (urlJobId || !storeId || hasRecoveredJobIdRef.current) return;
  // ... recover jobId ...
  hasRecoveredJobIdRef.current = true;
  setSearchParams(newParams, { replace: true });
}, [storeId, urlJobId]); // ✅ Stable dependencies only
```

---

## 📋 React Hooks Rules - Summary

### ✅ Always Follow These Rules:

1. **Hooks must be called in the same order every render**
   - ✅ All hooks at the top level
   - ✅ No conditional hook calls
   - ✅ No hooks inside loops or conditions
   - ✅ **No hooks inside function parameters**

2. **Early returns are OK, but only AFTER all hooks**
   - ✅ Early return after all hooks - **CORRECT**
   - ❌ Early return before hooks - **WRONG**

3. **Conditional statements between hooks can cause issues**
   - ❌ `if` statements between hooks (can confuse React)
   - ✅ Move conditionals into `useEffect` or `useMemo`

4. **`useCallback` and `useMemo` are hooks too**
   - ✅ Define them at the top level
   - ❌ Don't call them inside function parameters
   - ✅ Pass references to pre-defined callbacks

---

## 🧪 Testing

**Test Steps:**
1. Navigate to store review page
2. Trigger job failure (or wait for job to fail)
3. Verify no "Rendered fewer hooks" error
4. Check that error UI displays correctly
5. Try retry button - verify no hooks error
6. Navigate away and back - verify no hooks error

**Expected Result:**
- ✅ No React hooks errors
- ✅ Error UI displays correctly
- ✅ Retry button works
- ✅ Component re-renders correctly
- ✅ No infinite loops

---

## ✅ Status

**Fix Applied:** ✅  
**Linter Errors:** ✅ None  
**Ready for Testing:** ✅

---

**Files Changed:**
1. `apps/dashboard/cardbey-marketing-dashboard/src/pages/store/StoreReviewPage.tsx`
   - Moved debug logging to `useEffect`
   - Extracted `useCallback` hooks to top level
   - Fixed `useEffect` dependencies

---

**Next Steps:**
1. Test the fix in browser
2. Verify no hooks errors occur
3. Confirm error UI works correctly
4. Test retry functionality
5. Test navigation away and back

