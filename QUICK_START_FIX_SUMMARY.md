# Quick Start Workflow Fix Summary

## Root Causes

1. **Prisma Validation Error (500)**: The `Business` model does not have `generationStatus` or `lastGeneratedAt` fields, but the code was trying to set them during store creation and job completion.

2. **Draft Endpoint Mismatch**: Frontend was calling `/api/store/:id/draft` (singular) but backend only had `/api/public/store/:id/draft`. No unified endpoint for authenticated users.

3. **State Wipe on Errors**: Frontend was clearing product state when API calls failed (403/404), causing the "products appear then disappear" bug.

4. **Tenant Consistency**: Store creation was working, but the response format needed verification.

## What Changed

### Backend Changes

#### 1. **Removed Prisma Field References** (`apps/core/cardbey-core/src/routes/business.js`)
   - Removed `generationStatus: 'generating'` from `prisma.business.create()`
   - Now uses `stylePreferences` JSON with `lifecycleStage: 'generating'` instead
   - Updated store lock/unlock logic to use `stylePreferences` JSON

#### 2. **Updated MI Generation Services** (`apps/core/cardbey-core/src/services/miGeneration.ts`)
   - Replaced all `generationStatus` updates with `stylePreferences` JSON updates
   - Changed `generationStatus: 'complete'` → `lifecycleStage: 'ready'` in JSON
   - Changed `generationStatus: 'failed'` → `lifecycleStage: 'failed'` in JSON
   - Stores `lastGeneratedAt` as ISO string in JSON instead of DB field
   - Updated in 3 places: `processFormJob()`, `processOcrJob()`, `processUrlJob()`, and `markJobFailed()`

#### 3. **Added Unified Draft Endpoint** (`apps/core/cardbey-core/src/routes/stores.js`)
   - Added `GET /api/stores/:id/draft` (uses `optionalAuth` - works for both authenticated and public)
   - Returns same format as public endpoint: `{ ok: true, store, products, categories }`
   - Checks `lifecycleStage` from `stylePreferences` to detect locked stores (423 status)
   - Placed before `/:id` route to ensure correct matching

#### 4. **Updated Public Store Routes** (`apps/core/cardbey-core/src/routes/publicStoreRoutes.js`)
   - Fixed syntax error in category derivation loop
   - Updated to check `lifecycleStage` from `stylePreferences` instead of `generationStatus`

### Frontend Changes

#### 1. **Updated StoreReviewPage** (`apps/dashboard/cardbey-marketing-dashboard/src/pages/store/StoreReviewPage.tsx`)
   - Authenticated users now try `/api/stores/:id/draft` first (new unified endpoint)
   - Falls back to individual endpoints if draft endpoint fails
   - Non-draft mode also tries draft endpoint first
   - **Critical**: Added guards to prevent state wipe on errors:
     - If current draft has products and new payload is empty, ignore update
     - If all endpoints fail but existing draft has products, keep existing state
     - Only set error if truly no data exists

## How to Verify Locally

### 1. Test Form Creation (No 500 Error)
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
5. **Expected**: No 500 error in console. Job is created successfully.

### 2. Test Review Page (No Empty State Flicker)
**Steps:**
1. After job completes, navigate to `/app/store/:storeId/review?mode=draft`
2. **Expected**: Products appear and stay visible (no flicker to empty)
3. Check browser console: No 403/404 errors that cause state wipe

### 3. Test Draft Endpoint
```bash
# Test authenticated endpoint
curl -H "Authorization: Bearer <token>" http://localhost:3001/api/stores/<storeId>/draft

# Test public endpoint (no auth)
curl http://localhost:3001/api/public/store/<storeId>/draft
```

**Expected**: Both return `{ ok: true, store, products, categories }` with products array populated.

### 4. Test Generation Lock
**Steps:**
1. Create a new store via Form
2. Immediately navigate to review page (while job is still running)
3. **Expected**: See "Store is currently being generated" message (423 status)
4. Wait for job to complete
5. Refresh page
6. **Expected**: Products appear

## Runtime Assertions

### Backend
- `POST /api/business/create` must not throw Prisma validation errors
- `GET /api/stores/:id/draft` must return `products.length > 0` for generated stores
- `lifecycleStage` in `stylePreferences` must be one of: `'generating'`, `'ready'`, `'failed'`, `'configuring'`, `'live'`

### Frontend
- If `draft.catalog.products.length > 0` and new fetch returns empty, ignore update
- Never set `products = []` on API error if existing draft has products
- Always preserve last known good state

## Files Modified

### Backend
- `apps/core/cardbey-core/src/routes/business.js`
- `apps/core/cardbey-core/src/services/miGeneration.ts`
- `apps/core/cardbey-core/src/routes/stores.js` (new draft endpoint)
- `apps/core/cardbey-core/src/routes/publicStoreRoutes.js`

### Frontend
- `apps/dashboard/cardbey-marketing-dashboard/src/pages/store/StoreReviewPage.tsx`

## Notes

- **No Prisma Migration Required**: We're using existing `stylePreferences` JSON field, not adding new DB columns.
- **Backward Compatible**: Old stores without `lifecycleStage` in `stylePreferences` will default to `'configuring'` or `'live'` based on `isActive`.
- **Tenant Consistency**: `business.create` already returns `{ tenantId, storeId, jobId }` correctly. Frontend stores these in canonical context.

## Next Steps (Optional)

1. Add integration test for `POST /api/business/create` → `GET /api/stores/:id/draft` flow
2. Add E2E test for Form creation → Review page → Products visible
3. Consider adding `lifecycleStage` as a proper DB field in future migration (currently using JSON for speed)


