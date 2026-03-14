# Navigation to Content Studio Editor - Fix Summary

## Problem
After clicking "Create Smart Promotion" and confirming the modal, the UI remained on the store review page and never opened the Content Studio editor, even though the backend POST `/api/mi/promo/from-draft` succeeded.

## Root Cause
The handler was using a "local-first" approach:
1. Created local draft first
2. Navigated immediately with local draft
3. Synced to backend in background (non-blocking)

This meant the backend response was ignored, and navigation happened with a local instanceId instead of the backend's instanceId.

## Solution
Changed to **backend-first** approach:
1. Call backend POST `/api/mi/promo/from-draft` (primary flow)
2. Wait for response
3. Validate response has `instanceId`
4. Navigate to editor using `editorUrl` from response (or build it)
5. Show error toast on failure

## Changes Made

### 1. Updated `handleSmartUpgradeConfirm` Handler
**File:** `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx`

**Before:**
- Created local draft first
- Navigated immediately
- Backend sync in background

**After:**
- Calls `createPromoFromDraft()` (backend API) first
- Validates response has `instanceId`
- Uses `editorUrl` from backend response if available
- Falls back to building URL if backend doesn't provide `editorUrl`
- Navigates immediately on success
- Shows error toast on failure
- Closes modal on success

**Key Changes:**
```typescript
// CRITICAL: Call backend POST /api/mi/promo/from-draft FIRST (primary flow)
const backendResult = await createPromoFromDraft({
  storeId: finalStoreId,
  ...(jobId && !finalStoreId && { jobId }),
  productId: selectedProductForPromo,
  environment: params.environment,
  format: params.format,
  goal: params.goal,
});

// CRITICAL: Validate response - must have instanceId
if (!backendResult.ok || !backendResult.instanceId) {
  const errorMessage = backendResult.error?.message || 'Failed to create promo: missing instanceId';
  toast(errorMessage, 'error');
  setIsEmbedding(false);
  return; // Keep modal open for retry
}

// CRITICAL: Compute target URL - prefer editorUrl from backend
const targetUrl = backendResult.editorUrl || buildContentStudioUrl({
  instanceId: backendResult.instanceId,
  // ... other params
});

// Navigate to editor route (reuses existing Content Studio editor)
navigate(targetUrl);
```

### 2. Enhanced Modal Button Loading State
**File:** `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/review/SmartContentUpgradeModal.tsx`

**Changes:**
- Button now shows loading spinner and "Creating..." text when `isLoading` is true
- Button is disabled during loading to prevent double submits

**Before:**
```typescript
<Button disabled={!hasValidContext}>
  Create Smart Object
</Button>
```

**After:**
```typescript
<Button disabled={!hasValidContext || isLoading}>
  {isLoading ? (
    <>
      <span className="animate-spin mr-2">⏳</span>
      Creating...
    </>
  ) : (
    Create Smart Object
  )}
</Button>
```

### 3. Enhanced Error Handling
**File:** `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx`

**Changes:**
- Explicit error handling for backend failures
- Shows toast with error message
- Keeps modal open for retry
- Clears loading state on error

### 4. Debug Logging
**File:** `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx`

**Changes:**
- Added debug log when calling backend
- Added debug log with instanceId, promoId, editorUrl, targetUrl after success
- Gated by `localStorage.getItem('cardbey.debug') === 'true'`

## Route Confirmation

The Content Studio editor route is:
- **Path:** `/app/creative-shell/edit/:instanceId`
- **Component:** `ContentStudioEditor`
- **File:** `apps/dashboard/cardbey-marketing-dashboard/src/features/content-studio/pages/CreativeShell.tsx` (line 24)

This route is already defined and working. No new route needed.

## Image Injection Status

The image injection is already implemented in `ContentStudioEditor.tsx`:
- Checks `meta.sourceContext.imageUrl` after draft loading
- Only injects if image is missing (idempotent)
- Sets `backgroundFit: 'cover'` explicitly
- Sets `_imageInjected` flag to prevent re-injection
- Persists draft after injection

The backend also includes `sourceContext` in the response, so the image will be injected automatically when the editor opens.

## Flow After Fix

```
User clicks "Create Smart Promotion"
  ↓
Modal opens (environment/format/goal selection)
  ↓
User clicks "Create Smart Object"
  ↓
Button shows loading state (disabled)
  ↓
POST /api/mi/promo/from-draft (backend)
  ↓
Backend returns 200 with { instanceId, promoId, editorUrl, sourceContext }
  ↓
Frontend validates response
  ↓
Compute targetUrl (prefer editorUrl from backend)
  ↓
Close modal
  ↓
Navigate to /app/creative-shell/edit/:instanceId
  ↓
Content Studio Editor opens
  ↓
Image injection runs (from sourceContext)
  ↓
Canvas shows product image immediately
```

## Acceptance Tests

✅ **Test 1: Successful Creation**
- Click "Create Smart Promotion" on product card
- Select environment/format/goal in modal
- Click "Create Smart Object"
- Button shows "Creating..." and is disabled
- Network: POST `/api/mi/promo/from-draft` returns 200
- Browser URL changes to `/app/creative-shell/edit/<instanceId>`
- Content Studio opens with editor (canvas view)
- Product image appears on canvas

✅ **Test 2: Error Handling**
- Trigger a backend error (e.g., invalid storeId)
- Toast shows error message
- Modal stays open (allows retry)
- Button is re-enabled

✅ **Test 3: Loading State**
- Click "Create Smart Object"
- Button immediately shows loading state
- Button is disabled during request
- Cannot click multiple times

## Files Changed

1. ✅ `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx`
   - Changed to backend-first approach
   - Added response validation
   - Added error handling with toast
   - Added debug logging
   - Removed local-first approach

2. ✅ `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/review/SmartContentUpgradeModal.tsx`
   - Enhanced button to show loading state
   - Disabled button during loading

3. ✅ `apps/dashboard/cardbey-marketing-dashboard/src/features/content-studio/pages/ContentStudioEditor.tsx`
   - Image injection already implemented (no changes needed)

## Deliverables

### Modified Files and Lines

1. **`apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx`**
   - Lines ~1354-1481: Changed from local-first to backend-first approach
   - Removed local draft creation
   - Added backend API call as primary flow
   - Added response validation
   - Added error handling

2. **`apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/review/SmartContentUpgradeModal.tsx`**
   - Lines ~302-308: Enhanced button with loading state

### Route Confirmation

- **Route:** `/app/creative-shell/edit/:instanceId`
- **Component:** `ContentStudioEditor`
- **File:** `apps/dashboard/cardbey-marketing-dashboard/src/features/content-studio/pages/CreativeShell.tsx` (line 24)
- **Status:** ✅ Already exists, no changes needed

### Image Injection Status

- **Status:** ✅ Already implemented
- **File:** `apps/dashboard/cardbey-marketing-dashboard/src/features/content-studio/pages/ContentStudioEditor.tsx` (lines ~337-475)
- **Features:**
  - Idempotent injection (only once)
  - Sets `backgroundFit: 'cover'`
  - Persists draft after injection
  - Uses `_imageInjected` flag to prevent re-injection



















