# Auto-fill Images "Item not found" Fix

## Problem

`POST /api/menu/images/suggest` returns `ok:true` but `failed[]` contains `{ itemId:"prod_...", error:"Item not found" }` for all items. Frontend was sending client-side IDs (`prod_*`) instead of DB menu item IDs.

## Root Causes

1. **Draft Products Use `prod_*` IDs**: Products in `StoreDraftReview` come from `effectiveDraft.catalog.products`, which are draft products with temporary `prod_*` IDs, not database IDs.

2. **Backend Requires DB IDs**: The backend `resolveItemId` function can handle `prod_*` IDs by looking them up in StoreDraft, but only if:
   - The items are persisted in the database, OR
   - The items exist in the latest StoreDraft JSON

3. **Missing Context**: `storeId`/`tenantId` might not be present in canonical context.

## Solution

### 1. Fetch DB Products and Match by Name

When products have `prod_*` IDs:
- Fetch actual DB products from `/api/menu/items`
- Match draft products to DB products by name
- Use DB product IDs for the suggest API call
- Map DB IDs back to draft IDs for local state updates

### 2. Validate Context

- Check `storeId` and `tenantId` are present before making API calls
- Show `FinishSetupModal` if context is missing
- Block the call with a user-friendly message

### 3. Handle Draft-Only Items

- If items don't have DB matches, show warning message
- Skip items that can't be matched
- Continue with items that have DB IDs

### 4. Debug Logging

- Log item counts, updated/failed counts
- Log first 3 failed reasons (gated by `localStorage.cardbey.debug === 'true'`)

## Files Changed

### `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx`

**Changes:**
1. Added `apiGET` import
2. Enhanced auto-fill images handler:
   - Validates `storeId` and `tenantId` are present
   - Detects draft products (`prod_*` IDs)
   - Fetches DB products from `/api/menu/items` and matches by name
   - Uses DB IDs for API call
   - Maps DB IDs back to draft IDs for local updates
   - Shows appropriate error messages
   - Adds debug logging

**Key Logic:**
```typescript
// 1. Validate context
if (!storeId || !tenantId) {
  toast('Store ID is required...', 'error');
  setFinishSetupOpen(true);
  return;
}

// 2. Detect draft products
const hasDraftIds = missingImageProducts.some(p => p.id?.startsWith('prod_'));

// 3. Fetch DB products and match
if (hasDraftIds) {
  const menuRes = await apiGET(`/api/menu/items?tenantId=${tenantId}&storeId=${storeId}`);
  const dbItems = menuRes?.data?.items || [];
  
  // Match by name
  itemsToSuggest = missingImageProducts.map(draftProduct => {
    const dbProduct = dbItems.find(dbItem => 
      dbItem.name?.toLowerCase().trim() === draftProduct.name?.toLowerCase().trim()
    );
    return dbProduct ? { ...draftProduct, dbId: dbProduct.id } : draftProduct;
  });
}

// 4. Use DB IDs for API call
const itemsForSuggest = itemsToSuggest
  .filter(p => p.dbId || !p.id?.startsWith('prod_'))
  .map(p => ({
    itemId: p.dbId || p.id, // Use DB ID if available
    name: p.name || 'Item',
    tags: p.tags || [],
    price: p.price || p.priceV1?.amount || undefined,
  }));

// 5. Map DB IDs back to draft IDs for local updates
const dbIdToDraftIdMap = new Map<string, string>();
itemsToSuggest.forEach(draftProduct => {
  if (draftProduct.dbId) {
    dbIdToDraftIdMap.set(draftProduct.dbId, draftProduct.id);
  }
});

// 6. Update local state using draft IDs
const draftProductId = dbIdToDraftIdMap.get(item.itemId) || item.itemId;
updateProduct(draftProductId, { imageUrl: item.imageUrl });
```

## Debug Logging

When `localStorage.cardbey.debug === 'true'`, logs:
- Total items count
- Items with DB IDs count
- `storeId` and `tenantId`
- First 3 item IDs being sent
- Updated/failed counts
- First 3 failed reasons

## Acceptance Criteria

✅ **Context Validation:**
- If `storeId` missing → shows error toast + `FinishSetupModal`
- If `tenantId` missing → shows error toast + `FinishSetupModal`
- Blocks API call if context missing

✅ **DB ID Resolution:**
- Detects `prod_*` IDs in draft products
- Fetches DB products from `/api/menu/items`
- Matches draft products to DB products by name
- Uses DB product IDs for API call

✅ **Draft-Only Items:**
- Shows warning if items can't be matched to DB
- Skips unmatched items
- Continues with matched items

✅ **Local State Updates:**
- Maps DB IDs back to draft IDs
- Updates local patch state correctly
- Shows progress and completion messages

✅ **Debug Logging:**
- Logs item counts and context
- Logs failed reasons (gated by debug flag)
- No console spam in production

## Testing Checklist

1. **Test with Draft Products (`prod_*` IDs):**
   - Create store from URL/form
   - Go to Review page
   - Click "Auto-fill images (N missing)"
   - ✅ Should fetch DB products and match by name
   - ✅ Should use DB IDs for API call
   - ✅ Should update local state correctly

2. **Test with Missing Context:**
   - Clear `localStorage.cardbey.ctx.*`
   - Go to Review page
   - Click "Auto-fill images"
   - ✅ Should show error toast
   - ✅ Should show `FinishSetupModal`

3. **Test with Mixed Products:**
   - Some products have DB IDs, some have `prod_*` IDs
   - ✅ Should handle both correctly
   - ✅ Should only suggest images for products with DB IDs or matches

4. **Test Debug Logging:**
   - Set `localStorage.cardbey.debug = 'true'`
   - Click "Auto-fill images"
   - ✅ Should see debug logs in console
   - ✅ Should see failed reasons if any

## Expected Behavior

**Before Fix:**
- All items fail with "Item not found"
- `failed[]` contains all `prod_*` IDs

**After Fix:**
- Items with DB matches succeed
- Items without DB matches are skipped with warning
- Local state updates correctly
- Debug logs show what's happening




