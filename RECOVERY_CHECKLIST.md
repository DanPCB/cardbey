# Recovery Checklist - Status Recovery from ~1pm Today

## ✅ Completed Changes (All Present)

### 1. Request Deduplication Enhancement (`api.ts`)
- ✅ Extended to ALL request methods (GET, POST, PUT, PATCH, DELETE)
- ✅ Same URL + body returns same promise
- ✅ Prevents DDoS from any screen
- **File:** `apps/dashboard/cardbey-marketing-dashboard/src/lib/api.ts`
- **Status:** Complete

### 2. usePoller Hook (`usePoller.ts`)
- ✅ Created shared polling hook
- ✅ Single setInterval per instance
- ✅ AbortController support
- ✅ Prevents overlapping requests
- **File:** `apps/dashboard/cardbey-marketing-dashboard/src/hooks/usePoller.ts`
- **Status:** Complete

### 3. StoreReviewPage Polling Fix
- ✅ Replaced manual polling with usePoller
- ✅ Polls draft at 2000ms only while `draft.status === 'generating'`
- ✅ Polls job at 2000ms only while `job.status` in RUNNING/STARTED
- ✅ Stops when `productsCount > 0` OR `job.status === 'COMPLETED'`
- ✅ Error status handling with Retry button
- ✅ Stable dependencies (storeId, generationRunId only)
- **File:** `apps/dashboard/cardbey-marketing-dashboard/src/pages/store/StoreReviewPage.tsx`
- **Status:** Complete

### 4. ProductSuggestions Fix
- ✅ Fetches ONCE on mount
- ✅ 10-second cooldown before refetch
- ✅ AbortController cleanup
- ✅ Stable dependencies
- **File:** `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/review/ProductSuggestions.tsx`
- **Status:** Complete

### 5. DraftStore Catalog Persistence (`seedCatalogService.ts`)
- ✅ Persists catalog to `DraftStore.preview` after generation
- ✅ Stores: catalog, products, categories, meta
- ✅ Matches by generationRunId
- **File:** `apps/core/cardbey-core/src/services/orchestrator/seedCatalogService.ts`
- **Status:** Complete

### 6. Sync-Store DraftStore Reading (`miRoutes.js`)
- ✅ Strategy 0: Reads from DraftStore.preview first (source of truth)
- ✅ Falls back to MiArtifact/ActivityEvent if needed
- ✅ Updates DraftStore status to 'ready' when productsWritten > 0
- ✅ Sets status to 'error' when catalog is empty
- **File:** `apps/core/cardbey-core/src/routes/miRoutes.js`
- **Status:** Complete

### 7. Detailed Logging for productsWritten=0
All 6 log lines present:
- ✅ `[SYNC_STORE_START]` - Logs jobId, storeId, generationRunId
- ✅ `[SYNC_STORE_NO_CATALOG_IN_DRAFT]` - DraftStore exists but no catalog
- ✅ `[SYNC_STORE_NO_DRAFT_STORE]` - No DraftStore found
- ✅ `[SYNC_STORE_PRODUCTS_EXTRACTION]` - Products extraction summary
- ✅ `[SYNC_STORE_PRODUCTS_WRITTEN]` - Final summary with skip reasons histogram
- ✅ `[SYNC_STORE_NO_PRODUCTS]` - No products extracted
- **File:** `apps/core/cardbey-core/src/routes/miRoutes.js`
- **Status:** Complete

### 8. Draft Endpoint Status Fields (`stores.js`)
- ✅ Returns `status`, `lastError`, `lastErrorAt` from DraftStore
- ✅ Included in both `draft.meta` and top-level response
- **File:** `apps/core/cardbey-core/src/routes/stores.js`
- **Status:** Complete

### 9. Error Status Handling (Frontend)
- ✅ Shows error UI when `draft.status === 'error'`
- ✅ Retry button triggers new generation with new generationRunId
- ✅ Stops polling on error
- **File:** `apps/dashboard/cardbey-marketing-dashboard/src/pages/store/StoreReviewPage.tsx`
- **Status:** Complete

## 🔍 Verification Steps

1. **Request Deduplication:**
   - Open browser console
   - Make same GET request multiple times rapidly
   - Should see `[API][DEDUPE] Reusing in-flight request` log

2. **Polling:**
   - Check StoreReviewPage - should poll at 2000ms intervals
   - Should stop when products appear or status changes
   - Check ProductSuggestions - should fetch once, then respect 10s cooldown

3. **Catalog Persistence:**
   - Run store generation
   - Check DraftStore.preview in database - should have catalog data
   - Check logs for `[SEED_CATALOG][DRAFT_STORE_UPDATED]`

4. **Sync-Store:**
   - Check logs for all 6 diagnostic log lines
   - Should read from DraftStore.preview first
   - Should update status to 'ready' when products written

5. **Error Handling:**
   - If catalog is empty, DraftStore status should be 'error'
   - Frontend should show error UI with Retry button

## 📝 Notes

- All files are saved and complete
- No TypeScript errors detected
- All imports are present
- Linter shows no errors

## 🚨 If Something is Missing

If you notice any missing pieces:
1. Check git status: `git status`
2. Check for uncommitted changes: `git diff`
3. Review this checklist against current code
4. Re-run linter: `npm run lint` (or equivalent)

---

## Database Migration: DraftStore status='failed' → 'error'

**Date:** 2025-01-XX  
**Reason:** Standardize error status to 'error' (not 'failed') for consistency

### Migration SQL

```sql
-- Update all DraftStore rows with status='failed' to status='error'
-- This ensures draft endpoint queries can find them
UPDATE "DraftStore" 
SET status = 'error', 
    "updatedAt" = NOW()
WHERE status = 'failed';

-- Verify migration
SELECT COUNT(*) as failed_count 
FROM "DraftStore" 
WHERE status = 'failed';
-- Expected: 0

-- Verify error rows have error field set
SELECT id, status, error, "updatedAt" 
FROM "DraftStore" 
WHERE status = 'error' 
  AND (error IS NULL OR error = '' OR "updatedAt" IS NULL);
-- Expected: 0 rows (all error rows should have error field and updatedAt)
```

### Rollback (if needed)

```sql
-- Rollback: Change 'error' back to 'failed' (not recommended)
UPDATE "DraftStore" 
SET status = 'failed'
WHERE status = 'error' 
  AND "updatedAt" >= '2025-01-XX';  -- Only rollback recent changes
```

### Post-Migration Cleanup

After migration completes and all code uses 'error':
1. Remove 'failed' from all `status: { in: [...] }` queries
2. Remove normalization logic in `stores.js` (line ~668)
3. Update this checklist to mark migration complete

