# Unified Quick Start Flow Implementation

## Summary

Unified all 4 Quick Start options (Form, Voice/Chat, OCR, Website/Link) into ONE canonical flow and fixed the "products appear then quickly become empty" bug.

## Changes Made

### 1. Unified Quick Start Service (`src/lib/quickStart.ts`)

**Created:** `quickStartCreateJob()` function that:
- Wraps `createBusinessJob()` API
- Sets canonical context (jobId, storeId, tenantId)
- Navigates to `/mi/job/:jobId` (canonical bridge route)
- Handles all 4 source types (form, voice, ocr, url)

**Single Source of Truth:**
- All Quick Start options now use `quickStartCreateJob()`
- Navigation always goes: Quick Start → `/mi/job/:jobId` → `/app/store/:storeId/review?mode=draft`

### 2. Updated FeaturesPage (`src/pages/public/FeaturesPage.tsx`)

**Changed:**
- Replaced direct `createBusinessJob()` call with `quickStartCreateJob()`
- Removed manual context setting and navigation (handled by service)
- All 4 options (Form, Voice, OCR, URL) now use the same flow

### 3. Fixed StoreReviewPage (`src/pages/store/StoreReviewPage.tsx`)

**Root Cause:** Page was reloading data when auth context changed, causing empty overwrites.

**Fixes:**
- Added `routeStoreIdRef` to track route `storeId` as single source of truth
- Added `hasLoadedRef` to prevent multiple loads
- Only load data once per route `storeId`
- Never overwrite draft state with empty data
- Guard: Only update state if route `storeId` matches current route

**Key Changes:**
```typescript
// Route storeId is SINGLE SOURCE OF TRUTH
routeStoreIdRef.current = storeId;

// Only load once per route storeId
if (hasLoadedRef.current && routeStoreIdRef.current === storeId) {
  return; // Already loaded
}

// Never overwrite with empty state
if (storeDraft.catalog.products.length > 0 || !hasLoadedRef.current) {
  setDraft(storeDraft);
  hasLoadedRef.current = true;
}
```

### 4. Fixed StoreDraftReview (`src/features/storeDraft/StoreDraftReview.tsx`)

**Root Cause:** Component was using `contextStoreId` from `getCanonicalContext()`, which changes when auth initializes.

**Fixes:**
- Route `storeId` (from `baseDraft.meta.storeId`) is now PRIMARY source
- Never use `contextStoreId` as primary (only as fallback if route missing)
- All `effectiveStoreId` calculations now prioritize `routeStoreId`

**Key Changes:**
```typescript
// Route storeId is PRIMARY source
const routeStoreId = baseDraft.meta?.storeId || baseDraft.storeId;
// Only use context if route missing
const contextStoreId = routeStoreId ? null : (context?.storeId || null);

// All effectiveStoreId calculations:
const effectiveStoreId = dbStoreId || routeStoreId || baseDraft.meta?.storeId || baseDraft.storeId;
```

### 5. Updated ReviewStep (`src/features/mi/ReviewStep.tsx`)

**Changed:**
- Redirect to store review now includes `source` query param
- Uses `goToStoreReview()` helper with source type

### 6. Updated flowNav (`src/lib/flowNav.ts`)

**Changed:**
- `goToStoreReview()` now accepts `source` parameter
- Adds `source` to query string for tracking

## Flow Diagram

```
Quick Start (Form/Voice/OCR/URL)
  ↓
quickStartCreateJob()
  ↓
POST /api/business/create
  ↓
{ jobId, storeId, tenantId }
  ↓
setCanonicalContext()
  ↓
goToJob() → /mi/job/:jobId
  ↓
ReviewStep polls /api/mi/job/:jobId
  ↓
status === 'completed' && storeId exists
  ↓
goToStoreReview() → /app/store/:storeId/review?mode=draft&jobId=:jobId&source=:sourceType
  ↓
StoreReviewPage loads data using route storeId (SINGLE SOURCE OF TRUTH)
  ↓
StoreDraftReview renders with baseDraft (never overwrites with empty)
```

## Testing Checklist

1. **Form Quick Start:**
   - ✅ Click Generate → navigates to `/mi/job/:jobId`
   - ✅ Job progresses: queued → running → completed
   - ✅ Auto-redirects to `/app/store/:storeId/review?mode=draft`
   - ✅ Products appear and remain stable (no empty wipe)

2. **Website/URL Quick Start:**
   - ✅ Same flow as Form
   - ✅ Products remain stable

3. **Voice/Chat Quick Start:**
   - ✅ Same flow as Form
   - ✅ Products remain stable

4. **OCR Quick Start:**
   - ✅ Same flow as Form
   - ✅ Products remain stable

5. **Hard Refresh on Review Page:**
   - ✅ Loads products using route `storeId`
   - ✅ Products remain stable even if auth context changes
   - ✅ No empty overwrites

6. **Private Window (No Auth):**
   - ✅ No forced login redirect
   - ✅ Products load and remain stable
   - ✅ No auth warning toasts

## Acceptance Criteria

✅ All 4 Quick Start options use `quickStartCreateJob()`  
✅ All navigate to `/mi/job/:jobId` first  
✅ All redirect to `/app/store/:storeId/review?mode=draft` when job completes  
✅ Route `storeId` is single source of truth (never overwritten by context)  
✅ Products appear and remain stable (no empty wipe after 1-3 seconds)  
✅ Hard refresh on review page loads and remains stable  
✅ No CORS errors, no login redirects in private window

## Files Changed

1. `apps/dashboard/cardbey-marketing-dashboard/src/lib/quickStart.ts` (NEW)
2. `apps/dashboard/cardbey-marketing-dashboard/src/pages/public/FeaturesPage.tsx`
3. `apps/dashboard/cardbey-marketing-dashboard/src/pages/store/StoreReviewPage.tsx`
4. `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx`
5. `apps/dashboard/cardbey-marketing-dashboard/src/features/mi/ReviewStep.tsx`
6. `apps/dashboard/cardbey-marketing-dashboard/src/lib/flowNav.ts`


