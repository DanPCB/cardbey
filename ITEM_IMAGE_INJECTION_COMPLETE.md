# Item Image → Canvas Injection - Complete Implementation

## Summary

Implemented **idempotent image injection** that ensures item images always appear on the Content Studio canvas when creating Smart Promotions from catalog items.

## Implementation

### 1. Frontend: `createPromoDraftFromItem` Stores `sourceContext`
**File:** `apps/dashboard/cardbey-marketing-dashboard/src/services/createPromoDraftFromItem.ts`

- Stores `meta.sourceContext` with:
  - `type: 'catalogItem'`
  - `itemId`, `itemName`, `imageUrl` (normalized to absolute)
- Provides single source of truth for item context

### 2. Frontend: Content Studio Editor Idempotent Injection
**File:** `apps/dashboard/cardbey-marketing-dashboard/src/features/content-studio/pages/ContentStudioEditor.tsx`

- Checks `meta.sourceContext.imageUrl` after draft loading
- Only injects if image is missing (idempotent)
- Normalizes URL to absolute before injection
- Sets image in:
  - `scene1.promo.backgroundImageUrl` (primary)
  - `scene1.promo.imageUrl` (fallback)
  - `scene2.product.imageUrl` (product layer)
- Sets item name in headline/product name if missing
- Shows toast if item has no image

### 3. Backend: `/api/mi/promo/from-draft` Stores `sourceContext`
**File:** `apps/core/cardbey-core/src/routes/miRoutes.js`

- Extracts product image from multiple sources:
  - `product.imageUrl` (primary)
  - `product.images[0]` (fallback)
- Stores `sourceContext` in `metaData` when `productId` provided
- Also sets image in `scene1.promo.backgroundImageUrl` and `scene2.product.imageUrl`

## Flow

```
User clicks "Create Smart Promotion"
  ↓
createPromoDraftFromItem:
  - Extracts item data
  - Normalizes imageUrl to absolute
  - Creates draft with:
    * scene1.promo.backgroundImageUrl
    * scene2.product.imageUrl
    * meta.sourceContext
  ↓
Navigates to Content Studio
  ↓
Editor loads draft
  ↓
Idempotent injection:
  - Checks sourceContext.imageUrl
  - If exists AND no image in scene1/scene2
  - Normalizes URL to absolute
  - Injects into scene1 and scene2
  ↓
Image appears on canvas
```

## Files Changed

1. **`apps/dashboard/cardbey-marketing-dashboard/src/services/createPromoDraftFromItem.ts`**
   - Added `meta.sourceContext` storage

2. **`apps/dashboard/cardbey-marketing-dashboard/src/features/content-studio/pages/ContentStudioEditor.tsx`**
   - Added idempotent image injection with URL normalization

3. **`apps/core/cardbey-core/src/routes/miRoutes.js`**
   - Added `sourceContext` to `metaData`
   - Enhanced product image extraction
   - Sets image in `scene1.promo.backgroundImageUrl`

## Testing

✅ Item with image → image appears on canvas  
✅ Item without image → placeholder + toast  
✅ Refresh → image persists  
✅ Idempotent → only injects if missing  



















