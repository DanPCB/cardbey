# Store Create Workflow Implementation Summary

**Date:** January 1, 2026, 9:19 AM  
**Restore Point:** If results are unexpected, restore to this timestamp.

## Overview

Implemented a unified end-to-end store creation workflow:
1. **Unify Create → Review Destination**: All store creation entrypoints navigate to `/app/store/:storeId/review?mode=draft`
2. **Review v1**: Per-card fill, edit image, MI presence (already implemented)
3. **Publish + Promo → Content Studio**: Added publish endpoint and connected to content studio

## Files Changed

### Frontend (Dashboard)

1. **`apps/dashboard/cardbey-marketing-dashboard/src/pages/store/StoreReviewPage.tsx`** (NEW)
   - Canonical review page wrapper
   - Loads store data and converts to StoreDraft format
   - Route: `/app/store/:storeId/review?mode=draft`

2. **`apps/dashboard/cardbey-marketing-dashboard/src/App.jsx`**
   - Added route: `/app/store/:storeId/review` → `StoreReviewPage`
   - Imported `StoreReviewPage` component

3. **`apps/dashboard/cardbey-marketing-dashboard/src/components/orchestrated/CreateStoreWithAutofill.tsx`**
   - Updated to navigate to `/app/store/${storeId}/review?mode=draft` after creation

4. **`apps/dashboard/cardbey-marketing-dashboard/src/pages/onboarding/WelcomeCreateStore.tsx`**
   - Updated manual store creation to navigate to review page
   - Updated AI/OCR store creation to navigate to review page

5. **`apps/dashboard/cardbey-marketing-dashboard/src/api/storeDraft.ts`**
   - Added `publishStore()` function
   - Added `PublishStoreRequest` and `PublishStoreResponse` interfaces

6. **`apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx`**
   - Added `handlePublish()` function
   - Added publish button in sticky action bar
   - Added "Create Promo" CTA after publish
   - Added state: `isPublishing`, `isPublished`, `publishedStoreId`
   - Added `canPublish` validation logic
   - Imported `Sparkles` icon and `publishStore` function

### Backend (Core)

7. **`apps/core/cardbey-core/src/routes/stores.js`**
   - Added `POST /api/store/publish` endpoint
   - Validates store name and products
   - Sets `isActive = true` on Business
   - Emits SSE event `store.published` to `admin` and `store:<storeId>` channels
   - Returns `publishedStoreId` and `storefrontUrl`
   - Idempotent: returns existing if already published
   - Uses shared Prisma client via `getPrisma()` helper

8. **`apps/core/cardbey-core/src/routes/miRoutes.js`**
   - Enhanced error handling in `POST /api/mi/promo/from-product`
   - Added safe check for missing product
   - Returns 400 with clear message if product not found

## Routes

### New Routes
- `/app/store/:storeId/review?mode=draft` - Canonical review page

### Updated Routes
- All store creation flows now navigate to `/app/store/:storeId/review?mode=draft`

### API Endpoints

#### New
- `POST /api/store/publish`
  - Body: `{ storeId: string, publishOptions?: object }`
  - Response: `{ ok: true, publishedStoreId: string, storefrontUrl: string }`
  - Auth: Optional (works in draft mode)

#### Enhanced
- `POST /api/mi/promo/from-product` - Better error handling for missing products

## Key Features

### 1. Unified Creation Flow
- **Manual Store Creation**: Navigates to review page
- **AI Store Creation**: Navigates to review page
- **OCR Store Creation**: Navigates to review page
- **CreateStoreWithAutofill**: Navigates to review page

### 2. Publish Functionality
- **Validation**: Checks store name and at least one product with name+price
- **Idempotent**: Can be called multiple times safely
- **SSE Events**: Broadcasts `store.published` event
- **UI Feedback**: Shows loading state, success toast, and "Create Promo" CTA

### 3. Content Studio Integration
- After publish, shows "Create Promo" button
- Opens promo creation modal for first product
- Navigates to `/app/creative-shell/edit/:instanceId` after promo creation

## Testing Checklist (5 Steps)

1. **Create Store → Review**
   - [ ] Create store manually (WelcomeCreateStore)
   - [ ] Verify navigation to `/app/store/:storeId/review?mode=draft`
   - [ ] Verify store data loads correctly
   - [ ] Verify products are displayed

2. **Publish Store**
   - [ ] Click "Publish Store" button (should be enabled if store has name + products)
   - [ ] Verify loading state shows "Publishing..."
   - [ ] Verify success toast appears
   - [ ] Verify "Create Promo" button appears after publish

3. **Create Promo**
   - [ ] Click "Create Promo" button after publish
   - [ ] Verify promo creation modal opens
   - [ ] Select environment/format/goal
   - [ ] Verify navigation to content studio editor

4. **Draft Mode Guards**
   - [ ] Open review page in private window (no auth)
   - [ ] Verify no auth toasts appear
   - [ ] Verify protected endpoints are not called
   - [ ] Verify publish works (if storeId is available)

5. **Idempotency**
   - [ ] Publish store twice
   - [ ] Verify second publish returns existing publishedStoreId
   - [ ] Verify no errors occur

## Known Issues / Limitations

1. **Prisma Client**: `stores.js` still uses `new PrismaClient()` in some routes. The publish endpoint uses shared client via `getPrisma()` helper. Other routes should be migrated for consistency.

2. **StoreReviewPage**: Falls back to loading products via `/menu/items` if `/store/:storeId/draft` endpoint doesn't exist. This endpoint may need to be created.

3. **Content Studio Route**: Uses `/app/creative-shell/edit/:instanceId`. Verify this route exists and works correctly.

## Next Steps (Optional)

1. Create `/api/store/:storeId/draft` endpoint for loading draft data
2. Migrate all `stores.js` routes to use shared Prisma client
3. Add publish validation UI (show what's missing before publish)
4. Add storefront preview link after publish

## Restore Point

If results are unexpected, restore to: **January 1, 2026, 9:19 AM**


