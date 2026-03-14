# Fix Pack Implementation Report

**Date:** 2025-01-XX  
**PR:** Single PR implementing all fixes from "Draft Pipeline Deep Scan – Final Report"

---

## Files Changed

### 1. `apps/core/cardbey-core/src/services/draftStore/draftStoreService.js`

**Changes:**
- Line 61: Changed `status: 'failed'` → `status: 'error'` + added `updatedAt: new Date()`
- Line 191: Changed `status: 'failed'` → `status: 'error'` + added `updatedAt: new Date()`
- Line 216: Changed `status: 'failed'` → `status: 'error'` + added `updatedAt: new Date()`
- Line 218: Changed `draft.status = 'failed'` → `draft.status = 'error'`

**Why:**
- Standardizes error status to 'error' (not 'failed')
- Ensures `updatedAt` is always set when marking as error (required for `lastErrorAt` in response)
- Makes DraftStore rows findable by draft endpoint queries (which filter by 'error', not 'failed')

---

### 2. `apps/core/cardbey-core/src/routes/draftStore.js`

**Changes:**
- Line 187-189: Added DraftStore row update when generation fails
- Changed `status = 'failed'` → `status = 'error'`
- Added `prisma.draftStore.update()` call to persist error state to database
- Added error logging

**Why:**
- **CRITICAL FIX:** Previously only set local variable `status='failed'` but never updated database
- Database row stayed `status='generating'` → UI polled forever
- Now database is updated → draft endpoint returns `status='error'` → UI stops polling

**Code added:**
```javascript
// CRITICAL: Update DraftStore row with error state (not just local variable)
try {
  await prisma.draftStore.update({
    where: { id: draft.id },
    data: {
      status: 'error',
      error: genError.message || String(genError),
      updatedAt: new Date(),
    },
  });
} catch (updateError) {
  console.error(`[DraftStore] Failed to update draft ${draft.id} to error state:`, updateError);
}
```

---

### 3. `apps/core/cardbey-core/src/routes/stores.js`

**Changes:**
- Line 521, 562: Added `'failed'` to status filter (temporary, for backward compatibility)
- Line 634-640: Added normalization: `if (draftStatus === 'failed') draftStatus = 'error'`
- Line 665-696: Enhanced error field validation with warning logs
- Line 717: Added `lookupMode` to response (for debugging)

**Why:**
- **Backward compatibility:** Existing DraftStore rows with `status='failed'` are found and normalized
- **Error invariants:** Always ensures `lastError` and `lastErrorAt` are non-null when `status='error'`
- **Debugging:** `lookupMode` helps diagnose why `draftFound` changes

**Key invariant enforcement:**
```javascript
if (draftStatus === 'error') {
  // Always synthesize lastError if null
  if (!lastError || lastError.trim() === '') {
    lastError = "Catalog generation failed (no error details recorded). Check server logs.";
  }
  // Always set lastErrorAt with fallbacks
  lastErrorAt = draftScope?.updatedAt?.toISOString() 
    || draftScope?.createdAt?.toISOString() 
    || new Date().toISOString();
}
```

---

### 4. `apps/core/cardbey-core/src/routes/miRoutes.js`

**Changes:**
- Line 62, 1645, 2149, 3083: Added `'failed'` to status filters (temporary)
- Line 3139-3148: Enhanced sync-store error response with `details` object and `isTerminal` flag

**Why:**
- **Backward compatibility:** Find existing DraftStore rows with `status='failed'`
- **Better error response:** Frontend can distinguish terminal errors from retryable errors
- **Debugging:** `details` object includes context (hasCatalogOutput, taskStatus, etc.)

**Enhanced response:**
```javascript
return res.status(400).json({
  ok: false,
  code: 'CATALOG_EMPTY',
  error: 'CATALOG_EMPTY',
  message: errorMessage,
  storeId,
  jobId,
  generationRunId: generationRunId || null,
  productsWritten: 0,
  imagesWritten: 0,
  details: {
    hasCatalogOutput: !!catalogOutput,
    taskStatus: task.status,
    foundStageName: foundStageName || null,
    isTerminal: true,  // Signal: stop polling
  },
});
```

---

### 5. `RECOVERY_CHECKLIST.md`

**Changes:**
- Added database migration section with SQL script
- Added rollback instructions
- Added post-migration cleanup checklist

**Why:**
- Documents required migration to update existing `status='failed'` rows
- Provides verification queries
- Ensures migration is tracked and reversible

---

## Summary of Changes

### Status Standardization
- ✅ All new error states use `status='error'` (not 'failed')
- ✅ All error states set `error` field and `updatedAt` timestamp
- ✅ Legacy `status='failed'` rows are normalized to 'error' in draft endpoint

### Error Field Guarantees
- ✅ Draft endpoint **always** returns non-null `lastError` and `lastErrorAt` when `status='error'`
- ✅ Fallback messages synthesized if error field is missing
- ✅ Warning logs when fallbacks are used (helps identify data issues)

### Database Persistence
- ✅ `draftStore.js` now persists error state to database (not just local variable)
- ✅ All error paths update DraftStore row with `status='error'`, `error`, `updatedAt`

### Response Contracts
- ✅ Draft endpoint includes `lookupMode` for debugging
- ✅ Sync-store error response includes `details` object and `isTerminal` flag
- ✅ All error responses include `code`, `error`, `message` fields

---

## Verification Checklist

### SQL Verification

```sql
-- 1. Check for DraftStore rows with status='failed' (should be 0 after migration)
SELECT COUNT(*) as failed_count 
FROM "DraftStore" 
WHERE status = 'failed';
-- Expected: 0 (after running migration)

-- 2. Check for DraftStore rows with status='error' but missing error field
SELECT id, status, error, "updatedAt" 
FROM "DraftStore" 
WHERE status = 'error' 
  AND (error IS NULL OR error = '' OR "updatedAt" IS NULL);
-- Expected: 0 rows (all error rows should have error field and updatedAt)

-- 3. Verify all error rows have updatedAt set
SELECT id, status, error, "updatedAt" 
FROM "DraftStore" 
WHERE status = 'error' 
  AND "updatedAt" IS NULL;
-- Expected: 0 rows
```

### API Verification

```bash
# 1. Test draft endpoint returns lastError when status='error'
STORE_ID="your-store-id"
TOKEN="your-token"

curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3001/api/stores/$STORE_ID/draft" | jq '.status, .lastError, .lastErrorAt, .lookupMode'

# Expected output:
# "error"
# "sync-store: Catalog empty (0 products written)"  (or similar, non-null)
# "2025-01-XXT..."  (ISO timestamp, non-null)
# "exact" | "latest" | "none"

# 2. Test sync-store error response includes details
JOB_ID="your-job-id"
GEN_RUN_ID="gen-..."

curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"generationRunId\":\"$GEN_RUN_ID\"}" \
  "http://localhost:3001/api/mi/orchestra/job/$JOB_ID/sync-store" | jq '.ok, .code, .details'

# Expected (if catalog empty and job finished):
# false
# "CATALOG_EMPTY"
# { "hasCatalogOutput": false, "taskStatus": "completed", "isTerminal": true, ... }
```

### Code Verification

```bash
# 1. Verify no 'failed' status in DraftStore updates (except legacy normalization)
grep -r "status.*'failed'" apps/core/cardbey-core/src/services/draftStore/
grep -r "status.*'failed'" apps/core/cardbey-core/src/routes/draftStore.js
# Expected: Only comments or normalization code, no actual 'failed' assignments

# 2. Verify all error paths set updatedAt
grep -A 5 "status.*'error'" apps/core/cardbey-core/src/services/draftStore/draftStoreService.js
grep -A 5 "status.*'error'" apps/core/cardbey-core/src/routes/draftStore.js
# Expected: All show updatedAt: new Date()
```

---

## Migration Steps

1. **Run database migration:**
   ```sql
   UPDATE "DraftStore" 
   SET status = 'error', 
       "updatedAt" = NOW()
   WHERE status = 'failed';
   ```

2. **Verify migration:**
   ```sql
   SELECT COUNT(*) FROM "DraftStore" WHERE status = 'failed';
   -- Expected: 0
   ```

3. **Deploy code changes** (this PR)

4. **Monitor logs** for normalization warnings:
   - `[DRAFT_ENDPOINT] Found legacy status='failed'` (should decrease over time)

5. **After 1 week:** Remove 'failed' from all queries and normalization logic

---

## Risk Assessment

**Low Risk:**
- All changes are additive or defensive
- Backward compatibility maintained (includes 'failed' in queries)
- Error invariants enforced with fallbacks
- No breaking changes to API contracts

**Testing Recommended:**
- Test draft endpoint with existing `status='failed'` rows (should normalize)
- Test draft endpoint with `status='error'` rows missing error field (should synthesize)
- Test sync-store error response (should include details)

---

## Next Steps

1. ✅ Code changes complete
2. ⏳ Run database migration
3. ⏳ Deploy to staging
4. ⏳ Verify with test cases
5. ⏳ Deploy to production
6. ⏳ Monitor for normalization warnings
7. ⏳ Remove 'failed' from queries after 1 week

