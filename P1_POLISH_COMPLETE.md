# P1 Polish Tasks - Complete

**Date:** 2025-01-28  
**Status:** ✅ All 3 tasks complete

---

## ✅ Task 4: Auto-fill Images Button in StoreDraftReview

**File:** `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx`

**Changes:**
- ✅ Added `isBulkFilling` and `bulkFillProgress` state
- ✅ Added imports: `suggestImages`, `updateItemImage` from `@/api/menuImages`
- ✅ Added imports: `ImageIcon`, `Loader2` from `lucide-react`
- ✅ Added "Auto-fill images (N missing)" button in header section
- ✅ Button shows inline progress (e.g., "3/12") during fill
- ✅ Uses `updateProduct()` from patch system (StoreDraftReview pattern)
- ✅ Concurrency=2 (same as MenuPage)
- ✅ Single success toast at end (no spam)

**Behavior:**
- Computes missing images from `effectiveDraft.catalog.products`
- Button label: "Auto-fill images (N missing)"
- On click: calls `suggestImages()` then `updateItemImage()` for each missing item
- Updates via patch system (no direct API calls for individual items)
- Shows progress: "3/12" during fill

**Reused:**
- ✅ `suggestImages()` and `updateItemImage()` from `src/api/menuImages.ts`
- ✅ Same concurrency pattern as MenuPage
- ✅ Same card aspect (16:10 default)

---

## ✅ Task 6: Enforce storeId Creation

**File:** `apps/core/cardbey-core/src/routes/business.js`

**Changes:**
- ✅ Added runtime assert: if `storeId` is null after creation → return 500 with clear error
- ✅ Error code: `STORE_ID_MISSING`
- ✅ Error message: "Failed to create store: storeId is null. This should never happen."

**Rules:**
- ✅ Always create a Store record immediately (even if draft=true)
- ✅ Associate jobId with storeId
- ✅ Never return storeId=null
- ✅ Runtime assert: if storeId missing → return 500

**Acceptance:**
- ✅ Create-business (all 4 source types) always yields `{tenantId, storeId, jobId}` with non-null storeId
- ✅ StoreDraftReview never needs jobId-only context

---

## ✅ Task 7: Extract Shared Promo Function

**File:** `apps/dashboard/cardbey-marketing-dashboard/src/services/createSmartPromotion.ts` (NEW)

**API:**
```typescript
createSmartPromotionFromProduct({
  productId,
  environment,
  format,
  goal?
}): Promise<CreateSmartPromotionResponse>
```

**Internals:**
- ✅ Reads `getCanonicalContext()`
- ✅ If missing → returns `{ ok: false, error: { code: 'STORE_CONTEXT_REQUIRED' } }`
- ✅ Calls `createPromoFromProduct` with tenantId/storeId
- ✅ Returns `instanceId`

**Refactored:**
- ✅ `StoreDraftReview.tsx` uses `createSmartPromotionFromProduct()`
- ✅ `MenuPage.jsx` uses `createSmartPromotionFromProduct()`
- ✅ Both pages handle `STORE_CONTEXT_REQUIRED` by opening `FinishSetupModal`

**Acceptance:**
- ✅ No duplicated promo logic in two pages
- ✅ One source of truth for promo creation flow
- ✅ Consistent error handling (both show FinishSetupModal on missing context)

---

## 📋 Files Changed

1. **`apps/dashboard/cardbey-marketing-dashboard/src/services/createSmartPromotion.ts`** (NEW)
   - Shared smart promotion creation service

2. **`apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx`**
   - Added auto-fill images button
   - Refactored to use shared promo service
   - Added bulk fill state and handler

3. **`apps/dashboard/cardbey-marketing-dashboard/src/pages/menu/MenuPage.jsx`**
   - Refactored to use shared promo service

4. **`apps/core/cardbey-core/src/routes/business.js`**
   - Added runtime assert for storeId creation

---

## 🧪 Testing Checklist

### Test 1: Auto-fill Images in Review
1. Navigate to Review page with menu items
2. Verify some items have no images
3. Click "Auto-fill images (N missing)" button
4. **Expected:** Progress shows "3/12" during fill
5. **Expected:** Images appear on menu cards without reload
6. **Expected:** Single success toast at end

### Test 2: storeId Enforcement
1. Create business (any source type)
2. **Expected:** Response includes non-null `storeId`
3. If storeId is null (should never happen):
   - **Expected:** 500 error with `STORE_ID_MISSING` code
   - **Expected:** Clear error message

### Test 3: Shared Promo Service
1. From Review page, click "Create Smart Promotion"
2. **Expected:** Uses shared service, opens FinishSetupModal if context missing
3. From Menu page, click "Create Smart Promotion"
4. **Expected:** Uses shared service, opens FinishSetupModal if context missing
5. **Expected:** No duplicate promo logic in either page

---

## ✅ Acceptance Criteria

- ✅ Auto-fill images button in StoreDraftReview header
- ✅ Button shows "Auto-fill images (N missing)"
- ✅ Inline progress during fill ("3/12")
- ✅ Images appear without reload
- ✅ Single success toast (no spam)
- ✅ storeId always created and returned (never null)
- ✅ Runtime assert catches null storeId
- ✅ Shared promo service eliminates duplication
- ✅ Both pages use shared service
- ✅ Consistent error handling (FinishSetupModal)

---

**Status:** ✅ Complete - All P1 polish tasks implemented.




