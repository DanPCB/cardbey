# Orchestra Resilience Fixes - 2026-01-15

## Goal
Make MI orchestra run endpoints resilient to missing service modules and ensure all handlers always respond with JSON.

## Issues Fixed

### 1. ✅ Safe Service Imports (P0)

**Problem:** `ERR_MODULE_NOT_FOUND` crashes when orchestrator service modules are missing.

**Solution:** Added `safeImport()` helper function that gracefully handles missing modules.

**Implementation:**
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

**Service Classification:**
- **REQUIRED** (return 501 if missing):
  - `planStoreService` - Required for QuickStart (creates store plan)
  - `seedCatalogService` - Required for QuickStart (produces DraftStore payload)
  
- **OPTIONAL** (skip if missing):
  - `storeHeroService` - Hero image is optional, job continues without it

**Files Changed:**
- ✅ Modified: `apps/core/cardbey-core/src/routes/miRoutes.js`
  - Added `safeImport()` helper (line ~14)
  - Replaced direct imports with `safeImport()` for all stage services
  - Added 501 responses for missing required services

---

### 2. ✅ Ensure /run ALWAYS Responds (P0)

**Problem:** Handler could exit without sending a response, causing "handler_did_not_respond" errors.

**Solution:** 
- Wrapped entire handler in try/catch
- Added `res.headersSent` checks before all responses
- Extracted handler to `handleOrchestraJobRun` function for reuse

**Response Guarantees:**
- **Success (200):** `{ ok: true, job: {...}, message: 'Job started' }`
- **Missing Required Service (501):** `{ ok: false, error: 'FEATURE_NOT_AVAILABLE', feature: '...', message: '...', jobId, stage, details }`
- **Generic Failure (500):** `{ ok: false, error: 'ORCHESTRA_RUN_FAILED', message: '...', jobId, stage, details }`

**Files Changed:**
- ✅ Modified: `apps/core/cardbey-core/src/routes/miRoutes.js`
  - Extracted handler to `handleOrchestraJobRun` function
  - Added `res.headersSent` checks
  - Ensured all code paths send a response

---

### 3. ✅ Fix Compat Forwarder Response (P0)

**Problem:** Compat route `POST /api/mi/orchestra/job/:jobId` was using router stack lookup which could fail with "next is not a function".

**Solution:** Changed to directly call the extracted `handleOrchestraJobRun` function.

**Implementation:**
```javascript
// For /run endpoint, call handler directly
if (targetPath === `/orchestra/job/${jobId}/run`) {
  req.params = { ...originalParams, jobId };
  return handleOrchestraJobRun(req, res, next);
}
```

**Files Changed:**
- ✅ Modified: `apps/core/cardbey-core/src/routes/miRoutes.js`
  - Changed compat route to use direct handler call for `/run`
  - Kept router stack lookup as fallback for `/sync-store`

---

### 4. ✅ Verification Logs (P1)

**Added Logging:**
- `[MI Orchestra] [RUN] Starting job {jobId}` - When /run begins
- `[MI Orchestra] Executing {stage} stage for job {jobId}` - When each stage starts
- `[miRoutes] Optional service missing: {label}` - When a service is missing
- `[MI Orchestra] [RUN] Job {jobId} run completed successfully, responding with 200` - On success
- `[MI Orchestra] [RUN] Job {jobId} failed after {elapsed}ms` - On failure with timing

**Files Changed:**
- ✅ Modified: `apps/core/cardbey-core/src/routes/miRoutes.js`
  - Added start/end logging with timing
  - Added stage execution logs
  - Added service missing warnings

---

## Response Shapes

### Success Response (200)
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

## Files Changed Summary

1. ✅ **Modified:** `apps/core/cardbey-core/src/routes/miRoutes.js`
   - Added `safeImport()` helper
   - Extracted `handleOrchestraJobRun` handler
   - Made all service imports safe
   - Added 501 responses for missing required services
   - Fixed compat route to use direct handler call
   - Added comprehensive logging

---

## Verification

### Test Missing Service
```bash
# Temporarily rename planStoreService.js
mv src/services/orchestrator/planStoreService.js src/services/orchestrator/planStoreService.js.bak

# Call /run endpoint
curl -X POST http://localhost:3001/api/mi/orchestra/job/<jobId>/run \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"generationRunId": "test-run-id"}'

# Should return 501 with FEATURE_NOT_AVAILABLE (not crash)
```

### Test Compat Route
```bash
# Call compat route
curl -X POST http://localhost:3001/api/mi/orchestra/job/<jobId> \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"generationRunId": "test-run-id"}'

# Should forward to /run and return same response (not "next is not a function")
```

### Test Normal Flow
```bash
# Call /run with all services available
curl -X POST http://localhost:3001/api/mi/orchestra/job/<jobId>/run \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"generationRunId": "test-run-id"}'

# Should return 200 with job object
```

---

## Status: ✅ **ALL FIXES COMPLETE**

All handlers now:
- ✅ Handle missing service modules gracefully
- ✅ Always send a JSON response
- ✅ Use proper error codes (501 for missing features, 500 for failures)
- ✅ Include comprehensive logging
- ✅ Work correctly in compat routes

The QuickStart → Review flow is now resilient to missing orchestrator services.

