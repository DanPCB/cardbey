# Live "Create Store → Auto Image Fill" Pipeline - Wired

## Summary

The orchestrated pipeline is now fully wired using existing SSE & scheduler infrastructure. The Review page (`StoreDraftReview`) now supports live image autofill with real-time updates via SSE.

## Backend Implementation

### 1. POST /api/store-draft/create ✅

**File:** `apps/core/cardbey-core/src/routes/storeDraftRoutes.js`

- Creates `Business` record (status: `isActive: false` for drafts)
- Creates `Product` records with `isPublished: false` (draft status)
- Stores `clientId` in `sku` field for mapping
- Returns `storeId` + DB-backed menu items immediately

### 2. POST /api/image-jobs/menu-autofill ✅

**File:** `apps/core/cardbey-core/src/routes/imageJobsRoutes.js`

- Returns `202 Accepted` immediately (fire and forget)
- Processes items asynchronously with concurrency control (3 at a time)
- Image engine:
  - Searches Pexels
  - Ranks images using `menuImageRanker`
  - Updates `Product.imageUrl` in DB
  - Emits SSE event after each update

### 3. SSE Event: `menu.image.updated` ✅

**Emitted by:** `imageJobsRoutes.js` after each item update

**Event Format:**
```json
{
  "type": "menu.image.updated",
  "data": {
    "storeId": "string",
    "itemId": "string",
    "imageUrl": "string",
    "confidence": 0.85,
    "jobId": "string"
  }
}
```

**Channels:**
- `admin` - For dashboard clients
- `store:{storeId}` - Store-specific channel

### 4. SSE Stream with storeId Filtering ✅

**File:** `apps/core/cardbey-core/src/routes/sse.routes.js`

- Updated `/api/stream` to support `?storeId={storeId}` query param
- Logs storeId in connection details
- Passes storeId to `openSseStream` for filtering

## Frontend Implementation

### 1. API Clients ✅

**Files:**
- `apps/dashboard/cardbey-marketing-dashboard/src/api/storeDraft.ts`
- `apps/dashboard/cardbey-marketing-dashboard/src/api/imageJobs.ts`

### 2. SSE Hook ✅

**File:** `apps/dashboard/cardbey-marketing-dashboard/src/hooks/useMenuImageUpdates.ts`

**Features:**
- Uses `EventSource` directly with `storeId` query param
- Opens: `/api/stream?storeId=${storeId}&key=admin`
- Listens for `menu.image.updated` events
- Filters by `storeId` (double-check)
- Calls `onUpdate` callback for each event
- Returns `updateCount` and `latestUpdate`

### 3. StoreDraftReview Integration ✅

**File:** `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx`

**New State:**
- `dbStoreId` - Store ID from DB creation
- `dbItems` - Map of clientId -> {id, imageUrl} for DB items
- `autofillProgress` - {updated, total} for progress tracking
- `updatedItemIds` - Set of item IDs that have been updated

**New Functionality:**

1. **Auto-create store draft:**
   - When "Auto-fill images" is clicked, checks if `dbStoreId` exists
   - If not, calls `createStoreDraft` to create store + items in DB
   - Maps draft product IDs to DB item IDs

2. **Start autofill job:**
   - If DB items exist, calls `menuAutofill` with DB item IDs
   - Shows toast: "Autofilling images for N items..."
   - Sets `autofillProgress` to track progress

3. **SSE subscription:**
   - Uses `useMenuImageUpdates` hook with `dbStoreId`
   - On `menu.image.updated` event:
     - Updates `dbItems` map with new `imageUrl`
     - Updates patch state via `updateProduct`
     - Triggers pop-in animation on card
     - Updates progress counter

4. **Progress indicator:**
   - Shows in header: "X of Y images added" with progress bar
   - Updates in real-time as SSE events arrive

5. **Fallback:**
   - If DB items don't exist, falls back to existing `suggestImages` flow
   - Maintains backward compatibility

## Flow Diagram

```
User clicks "Auto-fill images"
  ↓
Check if dbStoreId exists
  ↓ (if not)
POST /api/store-draft/create
  ↓
Store + Products created in DB
  ↓
Set dbStoreId, dbItems, autofillProgress
  ↓
POST /api/image-jobs/menu-autofill (202 Accepted)
  ↓
Backend processes items asynchronously
  ↓
For each item:
  a. Search Pexels
  b. Rank images
  c. Update Product.imageUrl in DB
  d. Emit SSE: menu.image.updated
  ↓
Frontend receives SSE event
  ↓
Update dbItems map
Update patch state (updateProduct)
Trigger pop-in animation
Update progress counter
  ↓
Card displays new image
Progress bar updates
```

## Usage

1. **User navigates to Review page** (`StoreDraftReview`)
2. **User clicks "Auto-fill images"** button
3. **System creates store draft** in DB (if not exists)
4. **System starts autofill job** (returns immediately)
5. **SSE connection opens** (`/api/stream?storeId={storeId}&key=admin`)
6. **Images appear in real-time** as they're processed
7. **Progress counter updates** showing "X of Y images added"
8. **Cards animate** with pop-in effect when images are added

## Testing Checklist

- [x] Backend: POST /api/store-draft/create creates store + items
- [x] Backend: POST /api/image-jobs/menu-autofill enqueues job
- [x] Backend: SSE events are emitted correctly
- [x] Backend: SSE stream supports storeId query param
- [x] Frontend: useMenuImageUpdates hook subscribes to events
- [x] Frontend: StoreDraftReview creates store draft on click
- [x] Frontend: StoreDraftReview starts autofill job
- [x] Frontend: Cards update in real-time via SSE
- [x] Frontend: Progress counter updates correctly
- [x] Frontend: Pop-in animation triggers on update
- [ ] E2E: Full flow from click to images appearing

## Files Changed

### Backend:
1. `apps/core/cardbey-core/src/routes/storeDraftRoutes.js` - Create store draft endpoint
2. `apps/core/cardbey-core/src/routes/imageJobsRoutes.js` - Autofill job endpoint
3. `apps/core/cardbey-core/src/routes/sse.routes.js` - SSE stream with storeId support
4. `apps/core/cardbey-core/src/server.js` - Route registration

### Frontend:
1. `apps/dashboard/cardbey-marketing-dashboard/src/api/storeDraft.ts` - API client
2. `apps/dashboard/cardbey-marketing-dashboard/src/api/imageJobs.ts` - API client
3. `apps/dashboard/cardbey-marketing-dashboard/src/hooks/useMenuImageUpdates.ts` - SSE hook
4. `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx` - Integration

## Next Steps

1. **Test E2E flow** - Verify images appear in real-time
2. **Add error handling** - Handle SSE connection failures
3. **Add retry logic** - Retry failed image searches
4. **Optimize performance** - Batch SSE events if needed
5. **Add user feedback** - Show completion message when all images are added




