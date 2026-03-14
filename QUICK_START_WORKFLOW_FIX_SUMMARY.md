# Quick Start Workflow Fix Summary

## Root Causes

1. **Prisma Validation Error**: `generationStatus` field doesn't exist in Business model (already fixed in previous work - using `stylePreferences` JSON).

2. **unifiedJobProcessor Build Error**: No duplicate `uniqueCategories` found - likely already fixed or false positive.

3. **Intent=undefined in URL**: Frontend was not ensuring valid intent when navigating to review page.

4. **Empty State on Wrong Intent**: Review page was showing empty state when current intent tab had 0 items, even though "all" had items.

5. **Draft API Path Mismatch**: Frontend was calling `/api/store/:id/draft` but backend serves `/api/stores/:id/draft` (plural) and `/api/public/store/:id/draft`.

6. **Auth/Tenant Mismatch**: tenantId was not being persisted correctly after business creation, causing 403 errors on subsequent calls.

## What Changed

### Backend Changes

#### 1. **Added Intent Counts to Job Response** (`apps/core/cardbey-core/src/services/miGeneration.ts`)
   - Updated `getMiGenerationJob()` to compute `intentCounts` and `defaultIntent` when job is completed
   - Computes counts from products: `{ all, buy, eat, drink, discover }`
   - Default intent logic:
     - If query param intent provided and has items > 0 → use it
     - Else pick intent with highest count (excluding 'all')
     - Else 'all'
   - Added `generatedItemCount` field
   - Updated `GetMiJobResponse` interface to include new fields

#### 2. **Standardized Draft Endpoint** (`apps/core/cardbey-core/src/routes/stores.js`)
   - Added `GET /api/stores/:id/draft` endpoint (uses `optionalAuth`)
   - Returns same format as public endpoint: `{ ok: true, store, products, categories }`
   - Checks `lifecycleStage` from `stylePreferences` for locked stores (423 status)
   - Placed before `/:id` route to ensure correct matching

### Frontend Changes

#### 1. **Fixed Intent=undefined in URL** (`apps/dashboard/cardbey-marketing-dashboard/src/lib/flowNav.ts`)
   - Updated `goToStoreReview()` to always include valid intent
   - Priority: explicit intent > server defaultIntent > 'all'
   - Never sets `intent=undefined` in URL

#### 2. **Fixed Review Page Intent Handling** (`apps/dashboard/cardbey-marketing-dashboard/src/pages/store/StoreReviewPage.tsx`)
   - Added `useEffect` to remove `intent=undefined` from URL on mount
   - Ensures URL never contains `intent=undefined`

#### 3. **Auto-Switch to "All" if Current Intent Empty** (`apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx`)
   - Added logic to detect when current intent has 0 items but "all" has items
   - Automatically switches to "all" and shows toast: "Showing all items (no items in {IntentName} yet)"
   - Never clears catalog state just because one intent tab is empty

#### 4. **Use Server defaultIntent in Redirect** (`apps/dashboard/cardbey-marketing-dashboard/src/features/mi/ReviewStep.tsx`)
   - Updated redirect logic to use `job.defaultIntent` from backend response
   - Falls back to 'all' if not available
   - Never passes undefined intent

#### 5. **Updated useMiJob Hook** (`apps/dashboard/cardbey-marketing-dashboard/src/hooks/useMiJob.ts`)
   - Updated `MiJob` interface to include `defaultIntent`, `intentCounts`, `generatedItemCount`
   - Properly extracts and stores these fields from backend response

#### 6. **Standardized Draft API Calls** (`apps/dashboard/cardbey-marketing-dashboard/src/pages/store/StoreReviewPage.tsx`)
   - Authenticated users now try `/api/stores/:id/draft` first (unified endpoint)
   - Falls back to individual endpoints if needed
   - Public users use `/api/public/store/:id/draft`

#### 7. **TenantId Persistence** (`apps/dashboard/cardbey-marketing-dashboard/src/lib/quickStart.ts`, `apps/dashboard/cardbey-marketing-dashboard/src/services/createBusiness.ts`)
   - Both `quickStartCreateJob` and `startCreateBusiness` call `setCanonicalContext()` with `tenantId`
   - This ensures tenantId is available for subsequent API calls
   - Context is set immediately after successful business creation

## Files Modified

### Backend
- `apps/core/cardbey-core/src/services/miGeneration.ts` - Added intentCounts/defaultIntent computation
- `apps/core/cardbey-core/src/routes/stores.js` - Added `/api/stores/:id/draft` endpoint

### Frontend
- `apps/dashboard/cardbey-marketing-dashboard/src/lib/flowNav.ts` - Fixed intent=undefined issue
- `apps/dashboard/cardbey-marketing-dashboard/src/pages/store/StoreReviewPage.tsx` - Remove intent=undefined from URL, use unified draft endpoint
- `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx` - Auto-switch to "all" if current intent empty
- `apps/dashboard/cardbey-marketing-dashboard/src/features/mi/ReviewStep.tsx` - Use server defaultIntent in redirect
- `apps/dashboard/cardbey-marketing-dashboard/src/hooks/useMiJob.ts` - Handle new backend fields

## How to Verify Locally

### 1. Test Form Creation (No Empty Store)
```bash
# Start backend
cd apps/core/cardbey-core
npm run dev

# Start frontend
cd apps/dashboard/cardbey-marketing-dashboard
npm run dev
```

**Steps:**
1. Navigate to `/features` (Quick Start page)
2. Select "Form" option
3. Fill in:
   - Business Name: "Union Road Florist"
   - Business Type: "Florist"
   - Location: "Melbourne"
4. Click "Generate"
5. **Expected**: 
   - Job is created successfully
   - Navigate to `/mi/job/:jobId`
   - When job completes, redirects to `/app/store/:storeId/review?mode=draft&intent=all` (or valid intent, NOT undefined)
   - Products appear immediately (no flicker to empty)
   - If initial intent tab is empty, auto-switches to "all" with toast

### 2. Test Intent Handling
**Steps:**
1. Create a store via Form
2. Navigate to review page
3. **Expected**:
   - URL never contains `intent=undefined`
   - If current intent has 0 items, auto-switches to "all"
   - Catalog never disappears (always shows items in "all" tab)

### 3. Test Draft Endpoint
```bash
# Test authenticated endpoint
curl -H "Authorization: Bearer <token>" http://localhost:3001/api/stores/<storeId>/draft

# Test public endpoint
curl http://localhost:3001/api/public/store/<storeId>/draft
```

**Expected**: Both return `{ ok: true, store, products, categories }` with products array populated.

### 4. Test Tenant Persistence
**Steps:**
1. Create store via Form (in private window, no auth)
2. Check browser console for API calls
3. **Expected**: 
   - No 403 errors on draft fetch
   - `tenantId` is set in canonical context after creation
   - Subsequent calls use correct tenant context

## Runtime Assertions

### Backend
- `GET /api/mi/job/:jobId` returns `defaultIntent` and `intentCounts` for completed jobs
- `GET /api/stores/:id/draft` returns products count > 0 for generated stores
- `lifecycleStage` in `stylePreferences` must be one of: `'generating'`, `'ready'`, `'failed'`, `'configuring'`, `'live'`

### Frontend
- URL never contains `intent=undefined`
- If current intent has 0 items but "all" has items, auto-switch to "all"
- Never clear catalog state when switching intent tabs
- `tenantId` is persisted in canonical context after business creation

## Notes

- **No Prisma Migration Required**: Using existing `stylePreferences` JSON field for lifecycle tracking.
- **Backward Compatible**: Old stores without `lifecycleStage` default to `'configuring'` or `'live'` based on `isActive`.
- **Intent Defaults**: All generated products default to 'buy' intent if no intent tags are present.


