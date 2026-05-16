# Store Routing Refactor - Implementation Summary

## Overview

Unified routing and guards for all store creation workflows (Quick Start, Template, Dashboard) to ensure all flows point to the same Store/Business entity and prevent duplicate store creation.

## Files Changed

### Frontend

1. **`apps/dashboard/cardbey-marketing-dashboard/src/lib/storeContext.ts`** (NEW)
   - Store context resolver with priority algorithm
   - localStorage helpers for `cardbey.lastStoreId`
   - `resolveStoreContext()` function
   - `getNextRouteForStore()` routing helper

2. **`apps/dashboard/cardbey-marketing-dashboard/src/lib/nextRoute.ts`** (NEW)
   - Routing helper functions
   - `getContinuationRoute()`, `getOverviewRoute()`

3. **`apps/dashboard/cardbey-marketing-dashboard/src/routes/guards/RequireAuth.tsx`** (NEW)
   - Auth guard component
   - Redirects to `/login?returnTo=...` if not authenticated

4. **`apps/dashboard/cardbey-marketing-dashboard/src/routes/guards/RequireStoreContext.tsx`** (NEW)
   - Store context resolver guard
   - Resolves store context and redirects to appropriate route
   - Handles storeId/businessId from URL params

5. **`apps/dashboard/cardbey-marketing-dashboard/src/routes/guards/RequireStoreAccess.tsx`** (NEW)
   - Store access verification guard
   - Ensures user has access to specific store

### Backend

6. **`apps/core/cardbey-core/src/routes/stores.js`**
   - Added `GET /api/store/context` endpoint
   - Added `GET /api/store/:id/context` endpoint
   - Updated store creation to include metadata (creationOrigin, lifecycleStage)
   - Metadata stored in `stylePreferences` JSON field (temporary until meta field migration)

7. **`apps/core/cardbey-core/src/server.js`**
   - Added route mounting for `/api/store` (singular) to support context endpoints

## Implementation Details

### Store Context Resolution Algorithm

1. If URL has `storeId` (query or param), use it
2. Else if URL has `businessId`, fetch store for businessId
3. Else check localStorage key `cardbey.lastStoreId` (fallback)
4. If still none, call `GET /api/store/context` to get user's most recent/active store
5. If no stores exist, route to dashboard "Create store" entry

### Metadata Storage

Currently using `stylePreferences` JSON field to store:
- `creationOrigin`: 'quick_start' | 'template' | 'dashboard'
- `lifecycleStage`: 'generated' | 'configuring' | 'live'
- `createdAt`: ISO timestamp

**Note:** This is a temporary solution. A proper migration should add a `meta` JSON field to the Business model.

### Routing Logic

- **Live store**: `/business/${businessId}/overview`
- **Generated/Configuring**: `/onboarding/business?storeId=${storeId}&source=${creationOrigin}`
- **No store**: `/dashboard/create`

## Next Steps (Remaining Tasks)

1. **Update onboarding to be storeId-driven**
   - Modify `BusinessOnboardingWizard` to read `storeId` from query params
   - Load store data for that storeId
   - Update same store record (never create new)

2. **Update Quick Start flow**
   - After `Generate`, save `storeId` to localStorage
   - Navigate to preview with storeId
   - "Continue Setup" should use storeId

3. **Update Template flow**
   - After instantiate, save `storeId` to localStorage
   - Navigate to continuation route with storeId

4. **Add redirects for old routes**
   - `/business/setup/continue` without storeId → resolve and redirect
   - `/dashboard` empty → resolve and redirect

5. **Add logging/debug tools**
   - Dev-only logs for resolved storeId/businessId
   - Log origin + lifecycle
   - Log chosen redirect route

## Testing Checklist

- [ ] Quick Start -> Preview -> Continue Setup -> Dashboard shows same store
- [ ] Template -> Preview -> Continue Setup -> Dashboard shows same store
- [ ] Dashboard create -> creates new store and routes into onboarding
- [ ] Logged out access -> returns to correct place after login
- [ ] Switching language doesn't break routing

## API Endpoints

### `GET /api/store/context`
Get store context for current user (most recent/active store)

**Query params:**
- `businessId` (optional): Get context for specific business

**Response:**
```json
{
  "ok": true,
  "storeId": "cmj4avaku0000jvbohg39rsvw",
  "businessId": "cmj4avaku0000jvbohg39rsvw",
  "creationOrigin": "quick_start",
  "lifecycleStage": "configuring",
  "requiredNextStep": "continue_setup",
  "isOwner": true,
  "store": {
    "id": "cmj4avaku0000jvbohg39rsvw",
    "name": "My Store",
    "slug": "my-store",
    "isActive": false
  }
}
```

### `GET /api/store/:id/context`
Get store context for a specific store ID

**Response:** Same as above

## Notes

- Guards use stable dependencies to prevent infinite loops
- Store context is memoized to avoid unnecessary re-renders
- localStorage is only used as fallback, not primary source
- All redirects use `replace` to avoid polluting history

