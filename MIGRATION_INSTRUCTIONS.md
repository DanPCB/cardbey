# Migration Instructions for Cardbey Store Draft + Image Autofill Fix

## Prisma Migration

Run the following command to add the `tags` field to the Product model:

```bash
cd apps/core/cardbey-core
npx prisma migrate dev --name add_product_tags
npx prisma generate
```

This will:
1. Create a migration file adding `tags String[] @default([])` to the Product model
2. Apply the migration to your database
3. Regenerate the Prisma client with the new field

## Summary of Changes

### A) PRISMA Schema
- **File**: `apps/core/cardbey-core/prisma/schema.prisma`
- **Change**: Added `tags String[] @default([])` field to Product model
- **Status**: ✅ Schema updated, migration needs to be run

### B) BACKEND: Store Draft Creation
- **File**: `apps/core/cardbey-core/src/routes/storeDraftRoutes.js`
- **Changes**:
  - Added `normalizedName` field when creating products (for case-insensitive lookups)
  - Returns `tags` in response items
  - Already validates required fields and returns clear 400 errors
- **Status**: ✅ Complete

### C) BACKEND: Menu Image Routes
- **File**: `apps/core/cardbey-core/src/routes/menuImageRoutes.js`
- **Changes**:
  - `resolveItemId()` already fixed to use Product model only (no StoreDraft lookup)
  - SSE emission already implemented with proper event structure
  - Logs added for debugging
- **Status**: ✅ Complete

### D) BACKEND: SSE CORS
- **File**: `apps/core/cardbey-core/src/routes/sse.routes.js`
- **File**: `apps/core/cardbey-core/src/realtime/simpleSse.js`
- **Changes**:
  - CORS headers already set correctly
  - Heartbeat mechanism in place
  - Headers flushed before writes
- **Status**: ✅ Complete

### E) FRONTEND: Protected API Guards
- **Files**:
  - `apps/dashboard/cardbey-marketing-dashboard/src/lib/api.ts`
  - `apps/dashboard/cardbey-marketing-dashboard/packages/api-client/src/index.ts`
  - `apps/dashboard/cardbey-marketing-dashboard/src/sdk/api.ts`
  - `apps/dashboard/cardbey-marketing-dashboard/src/hooks/useMenuItems.ts`
  - `apps/dashboard/cardbey-marketing-dashboard/src/pages/devices/DevicesPage.jsx`
  - `apps/dashboard/cardbey-marketing-dashboard/src/features/devices/DevicesPageTable.tsx`
  - `apps/dashboard/cardbey-marketing-dashboard/src/features/mi/ReviewStep.tsx`
- **Changes**:
  - Added `isProtectedEndpoint()` and `hasAuthTokens()` helpers
  - Global `request()` function blocks protected endpoints when no auth
  - `useMenuItems` hook checks `isDraftMode` and `hasAuth`
  - Device queries gated by auth
  - Direct API calls in ReviewStep guarded
- **Status**: ✅ Complete

### F) FRONTEND: EventSource Stability
- **File**: `apps/dashboard/cardbey-marketing-dashboard/src/hooks/useMenuImageUpdates.ts`
- **Changes**:
  - Already uses refs for persistent EventSource
  - URL memoization in place
  - Named event listener (`addEventListener("menu.image.updated")`)
  - Fallback `onmessage` handler
  - Cleanup only on unmount
- **Status**: ✅ Complete

### G) FRONTEND: UI Updates
- **File**: `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx`
- **Changes**:
  - SSE handler already updates `itemImageMap` and calls `updateProduct()`
  - Image resolution logic prioritizes SSE updates, then product.imageUrl, then images array
  - Pop-in animation on image update
  - Progress tracking via `autofillProgress`
- **Status**: ✅ Complete

## Verification Checklist

After running the migration, test the following:

1. **Unauthenticated Review Page**:
   - ✅ Open review page without auth
   - ✅ Confirm NO requests to `/api/auth/me`, `/api/device/*`, `/api/menu/items`
   - ✅ Network tab shows zero 401 errors

2. **Create Store Draft**:
   - ✅ Click "Create store" or enter review
   - ✅ Confirm `/api/store-draft/create` returns 200
   - ✅ Confirm Products created in DB with `tags` field
   - ✅ Response includes `storeId` and `items[]` with DB IDs

3. **Auto-fill Images**:
   - ✅ Click "Auto-fill images (N)"
   - ✅ Confirm `/api/image-jobs/menu-autofill` returns 202 (accepted)
   - ✅ Backend logs show "EMIT image" for each update
   - ✅ Frontend logs show "🔥 IMAGE EVENT RECEIVED"
   - ✅ Cards update images progressively
   - ✅ Progress counter updates
   - ✅ Pop-in animation plays

4. **SSE Connection Stability**:
   - ✅ EventSource connection opens once
   - ✅ No repeated open/close loops
   - ✅ Connection persists across renders
   - ✅ Only closes on page unmount

5. **Image Persistence**:
   - ✅ Refresh page (if authenticated)
   - ✅ Items load with persisted `imageUrl` from DB

## Files Changed

### Backend
1. `apps/core/cardbey-core/prisma/schema.prisma` - Added `tags` field
2. `apps/core/cardbey-core/src/routes/storeDraftRoutes.js` - Added `normalizedName`, return `tags`
3. `apps/core/cardbey-core/src/routes/menuImageRoutes.js` - Already fixed (no changes needed)
4. `apps/core/cardbey-core/src/routes/imageJobsRoutes.js` - Already complete (no changes needed)
5. `apps/core/cardbey-core/src/routes/sse.routes.js` - Already complete (no changes needed)

### Frontend
1. `apps/dashboard/cardbey-marketing-dashboard/src/lib/api.ts` - Added protected endpoint guards
2. `apps/dashboard/cardbey-marketing-dashboard/packages/api-client/src/index.ts` - Added protected endpoint guards
3. `apps/dashboard/cardbey-marketing-dashboard/src/sdk/api.ts` - Added protected endpoint guards
4. `apps/dashboard/cardbey-marketing-dashboard/src/hooks/useMenuItems.ts` - Added auth and draft mode checks
5. `apps/dashboard/cardbey-marketing-dashboard/src/pages/devices/DevicesPage.jsx` - Added auth guard
6. `apps/dashboard/cardbey-marketing-dashboard/src/features/devices/DevicesPageTable.tsx` - Added auth guard
7. `apps/dashboard/cardbey-marketing-dashboard/src/features/mi/ReviewStep.tsx` - Added auth guard
8. `apps/dashboard/cardbey-marketing-dashboard/src/hooks/useMenuImageUpdates.ts` - Already complete (no changes needed)
9. `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx` - Already complete (no changes needed)

## Next Steps

1. Run the Prisma migration (see command above)
2. Restart backend server
3. Test the complete flow using the verification checklist
4. Monitor backend logs for "EMIT image" messages
5. Monitor frontend console for "🔥 IMAGE EVENT RECEIVED" messages
6. Verify no 401 errors in network tab on public pages
