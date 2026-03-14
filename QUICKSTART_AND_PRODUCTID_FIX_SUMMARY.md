# QuickStart 404 and Product ID Missing Fix - Summary

**Date:** 2026-01-15  
**Status:** ✅ **PARTIALLY COMPLETE**

---

## Problem 1: QuickStart 404

**Symptom:** Frontend requests `POST /api/mi/orchestra/start` but backend returns 404.

**Root Cause:** The route `/api/mi/orchestra/start` does not exist in the backend at the rollback commit.

**Solution Applied:**
- Added `POST /api/mi/orchestra/start` endpoint to `apps/core/cardbey-core/src/routes/miRoutes.js`
- Endpoint creates an `OrchestratorTask` with `entryPoint = goal` (e.g., "build_store")
- Returns `{ ok: true, jobId, storeId?, sseKey }` matching frontend contract

**Files Changed:**
1. `apps/core/cardbey-core/src/routes/miRoutes.js`
   - Added PrismaClient import
   - Added `/orchestra/start` route handler

**Code Added:**
```javascript
router.post('/orchestra/start', requireAuth, async (req, res) => {
  // Validates goal and rawInput
  // Creates OrchestratorTask with status='queued'
  // Returns { ok: true, jobId, storeId?, sseKey }
});
```

---

## Problem 2: Product ID Missing on Quick Edit

**Symptom:** Clicking "Quick Edit" on product cards shows: "Cannot edit 'X': Product ID is missing"

**Root Cause:** Products from draft preview may have preview-only IDs that don't map to Product table rows. The Quick Edit handler expects `product.id` to be a valid Product table ID.

**Solution Needed:**
1. Normalize product IDs at data boundary (when draft products are loaded)
2. Map `product.productId ?? product.id` to ensure Quick Edit always has a valid ID
3. If no valid ID exists, disable Quick Edit with clear tooltip

**Status:** ⚠️ **IN PROGRESS** - Route added, but Product ID normalization still needed.

---

## Next Steps

### For QuickStart:
1. ✅ Route added
2. ⏳ Test endpoint: `curl -X POST http://localhost:3001/api/mi/orchestra/start -H "Content-Type: application/json" -d '{"goal":"build_store","rawInput":"Create a test store"}'`
3. ⏳ Verify frontend can create jobs and navigate to review page

### For Product ID:
1. ⏳ Find where draft products are loaded (`/api/stores/:id/draft`)
2. ⏳ Add normalization: `product.productId = product.productId ?? product.id ?? null`
3. ⏳ Update Quick Edit handler to check for valid productId before opening drawer
4. ⏳ Add fallback: disable Quick Edit if productId missing, show tooltip

---

## Files Changed

1. **`apps/core/cardbey-core/src/routes/miRoutes.js`**
   - Added PrismaClient import
   - Added `POST /orchestra/start` route handler

---

## Verification Checklist

- [ ] QuickStart endpoint returns 200 with `{ ok: true, jobId }`
- [ ] Frontend can create orchestra jobs via QuickStart
- [ ] Dashboard navigates to review page after job creation
- [ ] Product cards have valid productId for Quick Edit
- [ ] Quick Edit opens drawer for products with valid IDs
- [ ] Quick Edit is disabled (with tooltip) for preview-only products

---

**Fix Status:** QuickStart route added ✅ | Product ID normalization in progress ⏳





