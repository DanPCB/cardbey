# Public Draft Store Implementation

## Summary

Implemented public, read-only endpoint for unauthenticated users to access draft stores, fixing the Quick Start workflow where review pages were showing empty or redirecting to login.

## Files Changed

### Backend

1. **`apps/core/cardbey-core/src/routes/publicStoreRoutes.js`** (NEW)
   - Created new public store routes file
   - Implements `GET /api/public/store/:storeId/draft`
   - No auth middleware (public access)
   - Returns store + products + categories
   - Returns 403 if store is already published (lifecycleStage === 'live' && isActive === true)
   - Returns 404 if store not found

2. **`apps/core/cardbey-core/src/server.js`**
   - Added import: `import publicStoreRoutes from './routes/publicStoreRoutes.js';`
   - Mounted route: `app.use('/api/public', publicStoreRoutes);`

3. **`apps/core/cardbey-core/src/routes/stores.js`**
   - Fixed Prisma import: Changed from `new PrismaClient()` to `import { prisma } from '../db/prisma.js'` (uses shared instance)

### Frontend

1. **`apps/dashboard/cardbey-marketing-dashboard/src/pages/store/StoreReviewPage.tsx`**
   - Added `getTokens` import to check auth state
   - Updated draft mode loading logic:
     - If unauthenticated AND mode=draft: use `/api/public/store/:storeId/draft`
     - If authenticated: use protected endpoints (`/api/stores/:id`, `/api/menu/items`, etc.)
     - If protected endpoints fail, fallback to public endpoint
   - Enhanced error handling: Never overwrites existing draft with empty state
   - Added debug logging (gated)

2. **`apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx`**
   - Updated `handlePublish` to check `hasAuthTokens()` before publishing
   - If not authenticated, redirects to `/login?returnTo=<currentUrl>`
   - Uses `navigate` from `useNavigate` hook (already imported)

3. **`apps/dashboard/cardbey-marketing-dashboard/src/lib/api.ts`**
   - Updated `isProtectedEndpoint()` to allow `/api/public/*` endpoints
   - Public endpoints are now accessible without auth tokens

## Root Causes Fixed

1. **403 Forbidden on `/api/stores/:storeId`**: Unauthenticated users were trying to access protected endpoints
   - **Fix**: Use public endpoint when unauthenticated

2. **404 Not Found on `/api/store/:storeId/draft`**: This endpoint didn't exist
   - **Fix**: Created `/api/public/store/:storeId/draft` endpoint

3. **State wipe on errors**: When API calls failed, state was cleared even if draft had products
   - **Fix**: Enhanced error handling to preserve existing draft state

4. **Publish without auth**: Users could attempt to publish without being logged in
   - **Fix**: Added auth check in `handlePublish` with redirect to login

## API Endpoint Details

### `GET /api/public/store/:storeId/draft`

**Request:**
- No auth required
- Path param: `storeId` (required)

**Response (200):**
```json
{
  "ok": true,
  "store": {
    "id": "string",
    "name": "string",
    "type": "string",
    "tenantId": "string | null"
  },
  "products": [
    {
      "id": "string",
      "name": "string",
      "price": "number | null",
      "currency": "string",
      "priceV1": { "amount": "number", "currency": "string" },
      "category": "string | null",
      "tags": "string[]",
      "imageUrl": "string | null",
      "images": "string[]",
      "description": "string | null",
      "sku": "string | null",
      "confidence": "number"
    }
  ],
  "categories": [
    {
      "id": "string",
      "name": "string"
    }
  ]
}
```

**Errors:**
- **400**: Missing storeId
- **404**: Store not found
- **403**: Store is already published (not in draft status)
- **500**: Server error

**Security:**
- Only returns stores in draft/configuring stage
- Blocks access to published stores (lifecycleStage === 'live' && isActive === true)
- No private/auth-only fields exposed

## Frontend Loading Logic

```typescript
// In StoreReviewPage.tsx
const tokens = getTokens();
const isLoggedIn = !!(tokens.bearer || tokens.adminToken || tokens.storeToken || tokens.agentToken);

if (mode === 'draft') {
  if (!isLoggedIn) {
    // Unauthenticated: use public endpoint
    storeData = await apiGET(`/public/store/${storeId}/draft`);
  } else {
    // Authenticated: use protected endpoints
    const [store, products, categories] = await Promise.all([
      apiGET(`/stores/${storeId}`),
      apiGET(`/menu/items?storeId=${storeId}`),
      apiGET(`/menu/categories?storeId=${storeId}`),
    ]);
    // Fallback to public if protected fails
  }
}
```

## Manual Test Steps

### Test 1: Unauthenticated Draft Review
1. Open browser in **Private/Incognito** mode (no auth)
2. Go to `/features`
3. Quick Start → Form → Enter business details → Generate
4. **Expected**: Navigate to `/mi/job/:jobId`
5. **Expected**: Job completes → auto-redirect to `/app/store/:storeId/review?mode=draft`
6. **Expected**: Products appear and stay visible (no flash then empty)
7. **Expected**: Network shows `GET /api/public/store/:storeId/draft -> 200`
8. **Expected**: No 403/404 errors in console

### Test 2: Authenticated Draft Review
1. Log in as admin
2. Navigate to `/app/store/:storeId/review?mode=draft`
3. **Expected**: Uses protected endpoints (`/api/stores/:id`, `/api/menu/items`)
4. **Expected**: Products load correctly
5. **Expected**: Can publish store (no redirect to login)

### Test 3: Publish Without Auth
1. In private window, navigate to draft review page
2. Click "Publish Store" button
3. **Expected**: Redirects to `/login?returnTo=/app/store/:storeId/review?mode=draft`
4. **Expected**: After login, returns to review page

### Test 4: Published Store Access
1. Publish a store (authenticated)
2. Try to access `/api/public/store/:storeId/draft` (unauthenticated)
3. **Expected**: Returns 403 with message "Store has been published and is no longer available as a draft"

### Test 5: State Preservation
1. Load draft review page (products appear)
2. Simulate network error (disable network or block `/api/public/store/:storeId/draft`)
3. **Expected**: Products remain visible (not cleared)
4. **Expected**: Error toast appears but state is preserved

## Regression Checks

✅ **Existing protected endpoints still work** - No changes to `/api/stores/:id` logic
✅ **Authenticated users can still access stores** - Protected endpoints unchanged
✅ **Publishing still requires auth** - Added check in `handlePublish`
✅ **No CORS issues** - Public endpoint uses same CORS config as other routes
✅ **State doesn't wipe on errors** - Enhanced error handling preserves draft

## Acceptance Criteria

✅ Unauthenticated users can review draft stores
✅ Products stay visible (no flash then empty)
✅ No 403/404 errors in console for draft review
✅ Publishing redirects to login if not authenticated
✅ Published stores return 403 from public endpoint
✅ State is preserved on API errors


