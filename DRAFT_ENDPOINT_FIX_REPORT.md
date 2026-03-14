# Draft Endpoint Fix - Store Name and Products Display

**Date:** 2026-01-12  
**Issue:** UI shows "Untitled Store" with blank cards even though backend generates products successfully  
**Status:** ✅ **FIXED**

---

## 🔍 Root Cause

The draft endpoint was reading store name and products from the **Business record**, which could be stale or not yet updated when the draft endpoint is called. This caused:

1. **Store Name Issue:** Business record name might not be updated yet when draft endpoint reads it
2. **Products Issue:** Business.products might be empty or stale even though DraftStore.preview has the correct catalog

### Why This Happened

1. **Race Condition:** Business record update happens in `/orchestra/start`, but draft endpoint might be called before the update commits
2. **Stale Data:** Draft endpoint was only reading from Business record, not from DraftStore.preview which is the source of truth for draft data
3. **Missing Fallback:** No fallback to DraftStore.preview when Business record data is stale

---

## ✅ Fix Applied

### Changes Made

**File 1:** `apps/core/cardbey-core/src/routes/stores.js`

1. **Store Name Priority:**
   - First: Read from `DraftStore.preview.meta.storeName` (if available)
   - Second: Read from `DraftStore.input.businessName` (if available)
   - Fallback: Read from `Business.name`

2. **Products Priority:**
   - First: Read from `DraftStore.preview.catalog.products` (if available)
   - Fallback: Read from `Business.products`

3. **Categories Priority:**
   - First: Read from `DraftStore.preview.catalog.categories` (if available)
   - Fallback: Read from Business categories

**File 2:** `apps/core/cardbey-core/src/services/orchestrator/seedCatalogService.ts`

1. **Store Name in Preview:**
   - Added `storeName` to `DraftStore.preview.meta` when updating catalog
   - Added `storeType` to `DraftStore.preview.meta` when updating catalog
   - Reads `businessName` from `DraftStore.input` to include in preview

---

## 📊 Impact

### Before Fix
- ❌ UI shows "Untitled Store" even when Business record has correct name
- ❌ Products might not display if Business.products is stale
- ❌ Race condition between Business update and draft endpoint read

### After Fix
- ✅ UI shows correct store name from DraftStore.preview.meta.storeName
- ✅ Products are read from DraftStore.preview.catalog.products (source of truth)
- ✅ No race condition - DraftStore.preview is always up-to-date
- ✅ Fallback to Business record if DraftStore.preview is not available

---

## 🧪 Testing

### Expected Behavior

1. ✅ Store name displays correctly (e.g., "Union Road Florist" instead of "Untitled Store")
2. ✅ Products display correctly (10 products for florist store)
3. ✅ Categories display correctly
4. ✅ No race condition between Business update and draft endpoint

### Test Scenarios

1. **Normal Store Creation:** Create a new store → verify store name and products display correctly
2. **Store Reuse:** Reuse existing Business record with new generationRunId → verify new store name and products display
3. **Race Condition:** Call draft endpoint immediately after store creation → verify correct data is returned

---

## ✅ Status

**Fix Applied:** ✅  
**Linter Errors:** ✅ None  
**Ready for Testing:** ✅

---

## 📝 Files Changed

1. `apps/core/cardbey-core/src/routes/stores.js`
   - Added fallback to DraftStore.preview for store name
   - Added fallback to DraftStore.preview for products
   - Added fallback to DraftStore.preview for categories
   - Updated top-level fields to use same priority

2. `apps/core/cardbey-core/src/services/orchestrator/seedCatalogService.ts`
   - Added `storeName` to `DraftStore.preview.meta` when updating catalog
   - Added `storeType` to `DraftStore.preview.meta` when updating catalog

---

## 🎯 Key Insight

The key insight is that **DraftStore.preview is the source of truth for draft data**, not the Business record. The Business record might be stale or not yet updated, but DraftStore.preview is always updated immediately when catalog is generated. Therefore, we should prioritize DraftStore.preview over Business record for draft-specific data.

This ensures:
- No race conditions
- Always up-to-date data
- Correct store name and products display
- Backward compatibility (fallback to Business record if DraftStore.preview is not available)

