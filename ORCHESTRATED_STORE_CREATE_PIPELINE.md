# Orchestrated "Create Store → Live Autofill Images" Pipeline

## Overview

This implementation provides an orchestrated pipeline that:
1. Creates store draft + menu items in DB immediately
2. Renders cards from returned DB items immediately (with `imageUrl: null`)
3. Opens SSE subscription for `menu.image.updated` events
4. Updates cards in real-time as images are added
5. Shows progress counter (updated/total)
6. Adds pop-in animation for updated cards

## Backend Implementation

### 1. POST /api/store-draft/create

**File:** `apps/core/cardbey-core/src/routes/storeDraftRoutes.js`

**Purpose:** Create store draft + menu items in DB from normalized JSON

**Request:**
```json
{
  "tenantId": "string (optional, inferred from auth)",
  "storeName": "string",
  "storeType": "string (optional)",
  "items": [
    {
      "clientId": "string (temporary client-side ID)",
      "name": "string",
      "price": "number (optional)",
      "tags": ["string"],
      "intent": "string (optional)",
      "aspect": "string (optional)",
      "category": "string (optional)"
    }
  ]
}
```

**Response:**
```json
{
  "ok": true,
  "storeId": "string",
  "items": [
    {
      "id": "string (DB id)",
      "clientId": "string (original client-side ID)",
      "name": "string",
      "price": "number",
      "imageUrl": null
    }
  ]
}
```

**Features:**
- Creates `Business` record if user doesn't have one
- Creates `Product` records for each item
- Stores `clientId` in `sku` field for mapping
- Returns DB IDs immediately for rendering

### 2. POST /api/image-jobs/menu-autofill

**File:** `apps/core/cardbey-core/src/routes/imageJobsRoutes.js`

**Purpose:** Enqueue/run job that finds images, uploads assets, and attaches `imageUrl` to menu items

**Request:**
```json
{
  "storeId": "string",
  "itemIds": ["string"],
  "items": [
    {
      "itemId": "string",
      "name": "string (optional)",
      "tags": ["string"],
      "category": "string (optional)",
      "aspect": "string (optional)"
    }
  ]
}
```

**Response:**
```json
{
  "ok": true,
  "jobId": "string",
  "totalItems": 3
}
```

**Features:**
- Returns `202 Accepted` immediately (fire and forget)
- Processes items asynchronously with concurrency control (3 at a time)
- Searches Pexels for images
- Ranks images using `menuImageRanker`
- Updates `Product` records with `imageUrl`
- Emits SSE events for each update

### 3. SSE Event: `menu.image.updated`

**Emitted by:** `imageJobsRoutes.js` after each item update

**Event Data:**
```json
{
  "storeId": "string",
  "itemId": "string",
  "imageUrl": "string",
  "confidence": 0.85,
  "jobId": "string"
}
```

**Channels:**
- `admin` - For dashboard clients
- `store:{storeId}` - Store-specific channel

**Usage:**
```javascript
broadcastSse('admin', 'menu.image.updated', eventData);
broadcastSse(`store:${storeId}`, 'menu.image.updated', eventData);
```

## Frontend Implementation

### 1. API Clients

**Files:**
- `apps/dashboard/cardbey-marketing-dashboard/src/api/storeDraft.ts`
- `apps/dashboard/cardbey-marketing-dashboard/src/api/imageJobs.ts`

**Functions:**
- `createStoreDraft(request)` - Creates store draft + menu items
- `menuAutofill(request)` - Starts image autofill job

### 2. SSE Hook

**File:** `apps/dashboard/cardbey-marketing-dashboard/src/hooks/useMenuImageUpdates.ts`

**Usage:**
```typescript
const { updateCount, latestUpdate } = useMenuImageUpdates({
  storeId: 'store-id',
  onUpdate: (event) => {
    // Handle image update
    console.log('Image added:', event.itemId, event.imageUrl);
  },
  enabled: true,
});
```

**Features:**
- Subscribes to `menu.image.updated` events
- Filters by `storeId` if provided
- Calls `onUpdate` callback for each event
- Returns `updateCount` and `latestUpdate`

### 3. Orchestrated Component

**File:** `apps/dashboard/cardbey-marketing-dashboard/src/components/orchestrated/CreateStoreWithAutofill.tsx`

**Usage:**
```tsx
<CreateStoreWithAutofill
  storeName="My Store"
  storeType="Restaurant"
  items={[
    {
      clientId: 'item-1',
      name: 'Pizza',
      price: 12.99,
      tags: ['italian', 'pizza'],
      aspect: '16:10',
    },
  ]}
  onSuccess={(storeId) => {
    console.log('Store created:', storeId);
  }}
  onError={(error) => {
    console.error('Error:', error);
  }}
/>
```

**Features:**
- Auto-starts creation on mount
- Renders cards immediately (with loading placeholders)
- Subscribes to SSE events
- Updates cards in real-time
- Shows progress counter
- Adds pop-in animation for updated cards
- Handles errors gracefully

## Flow Diagram

```
1. User triggers create
   ↓
2. POST /api/store-draft/create
   ↓
3. Store + Products created in DB
   ↓
4. Return {storeId, items[]} immediately
   ↓
5. Frontend renders cards (imageUrl: null)
   ↓
6. POST /api/image-jobs/menu-autofill (202 Accepted)
   ↓
7. Backend processes items asynchronously
   ↓
8. For each item:
   a. Search Pexels
   b. Rank images
   c. Update Product.imageUrl
   d. Emit SSE event "menu.image.updated"
   ↓
9. Frontend receives SSE event
   ↓
10. Update card with imageUrl
    ↓
11. Trigger pop-in animation
    ↓
12. Update progress counter
```

## Integration Points

### Existing Create Store Flow

The orchestrated pipeline can be integrated into existing flows:

1. **Features Page** (`FeaturesPage.tsx`):
   - Replace `startCreateBusiness` with `createStoreDraft`
   - Use `CreateStoreWithAutofill` component
   - Navigate to review page after creation

2. **Quick Start** (`QuickStart.tsx`):
   - Use `createStoreDraft` for immediate DB creation
   - Show `CreateStoreWithAutofill` for live updates
   - Navigate to review page when complete

3. **Store Draft Review** (`StoreDraftReview.tsx`):
   - Can use `useMenuImageUpdates` hook for real-time updates
   - Update existing cards as images are added

## Testing Checklist

- [ ] Create store draft with items
- [ ] Verify items are created in DB immediately
- [ ] Verify cards render with loading placeholders
- [ ] Verify autofill job starts
- [ ] Verify SSE events are received
- [ ] Verify cards update in real-time
- [ ] Verify progress counter updates
- [ ] Verify pop-in animation triggers
- [ ] Verify error handling works
- [ ] Verify multiple stores don't interfere

## Future Enhancements

1. **Retry Logic:**
   - Retry failed image searches
   - Queue failed items for later processing

2. **Batch Processing:**
   - Process items in larger batches
   - Optimize Pexels API usage

3. **Image Quality:**
   - Allow user to reject images
   - Provide manual image selection

4. **Progress Persistence:**
   - Save progress to DB
   - Resume on page reload

5. **Store-Specific SSE Channel:**
   - Use `store:{storeId}` channel for better isolation
   - Support multiple stores simultaneously




