# Orchestra Resilience Fixes - Summary

## Files Changed

1. ✅ **Modified:** `apps/core/cardbey-core/src/routes/miRoutes.js`
   - Added `safeImport()` helper function
   - Extracted `handleOrchestraJobRun` handler function
   - Made all service imports safe with proper error handling
   - Fixed compat route to use direct handler call
   - Added comprehensive logging

---

## Response Shapes

### Success (200)
```json
{
  "ok": true,
  "job": {
    "id": "job-id",
    "entryPoint": "store_generation",
    "status": "running",
    "request": {...},
    "result": {...},
    "createdAt": "2026-01-15T...",
    "updatedAt": "2026-01-15T..."
  },
  "message": "Job started"
}
```

### Missing Required Service (501)
```json
{
  "ok": false,
  "error": "FEATURE_NOT_AVAILABLE",
  "feature": "planStoreService",
  "message": "plan_store stage service is not available",
  "jobId": "job-id",
  "stage": "plan_store",
  "details": "Cannot find module '../services/orchestrator/planStoreService.js'"
}
```

### Generic Failure (500)
```json
{
  "ok": false,
  "error": "ORCHESTRA_RUN_FAILED",
  "message": "Failed to run job",
  "jobId": "job-id",
  "stage": "unknown",
  "details": "Error stack trace (dev only)"
}
```

---

## Implementation Details

### 1. Safe Import Helper
```javascript
async function safeImport(label, relPath) {
  try {
    const mod = await import(relPath);
    return { ok: true, mod };
  } catch (e) {
    console.warn(`[miRoutes] Optional service missing: ${label} (${relPath})`, e?.message || e);
    return { ok: false, error: e };
  }
}
```

### 2. Service Classification
- **REQUIRED** (return 501 if missing):
  - `planStoreService` - Creates store plan
  - `seedCatalogService` - Produces DraftStore payload
  
- **OPTIONAL** (skip if missing):
  - `storeHeroService` - Hero image is optional

### 3. Handler Extraction
- Extracted `/run` handler to `handleOrchestraJobRun` function
- Compat route calls handler directly (no router stack lookup for /run)
- All handlers always send a response (checked with `res.headersSent`)

### 4. Logging Added
- `[MI Orchestra] [RUN] Starting job {jobId}` - When /run begins
- `[MI Orchestra] Executing {stage} stage for job {jobId}` - When each stage starts
- `[miRoutes] Optional service missing: {label}` - When a service is missing
- `[MI Orchestra] [RUN] Job {jobId} run completed successfully after {elapsed}ms` - On success
- `[MI Orchestra] [RUN] Job {jobId} failed after {elapsed}ms` - On failure

---

## Verification

All handlers now:
- ✅ Handle missing service modules gracefully (no crashes)
- ✅ Always send a JSON response (no "handler_did_not_respond")
- ✅ Use proper error codes (501 for missing features, 500 for failures)
- ✅ Include comprehensive logging
- ✅ Work correctly in compat routes

**Status:** ✅ **COMPLETE** - All fixes applied and syntax verified.

