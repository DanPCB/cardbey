# QuickStart Fix Summary - 2026-01-15

## Problem
QuickStart flow was failing with multiple 404 and 500 errors:
- 404: POST /api/mi/infer, POST /api/mi/start (old endpoints)
- 500: POST /api/mi/orchestra/infer
- 404: POST /api/mi/orchestra/job/:jobId (frontend expects this)
- 404: GET /api/stores/:storeId/draft and GET /api/public/store/:storeId/draft
- 404: GET /api/v2/flags

## Solution: Compatibility Shims + Error Handling

### 1. MI Routes Compatibility Shims

**File:** `apps/core/cardbey-core/src/routes/miRoutes.js`

Added compatibility routes that forward to canonical endpoints:

- `POST /api/mi/infer` → forwards to `POST /api/mi/orchestra/infer`
- `POST /api/mi/start` → forwards to `POST /api/mi/orchestra/start`
- `POST /api/mi/orchestra/job/:jobId` → forwards to `/run` or `/sync-store` based on request body

**Implementation:**
- Extracted `handleOrchestraInfer` as a reusable function
- Added compatibility routes at the end of the file (before export)
- Routes use router stack lookup to forward to canonical handlers
- Logs compatibility forwarding in development mode

### 2. Fixed 500 Error on /api/mi/orchestra/infer

**File:** `apps/core/cardbey-core/src/routes/miRoutes.js`

Improved error handling:
- Separated import error handling from plan generation errors
- Returns 503 for service unavailable (import failures)
- Returns 500 with typed error for plan generation failures
- Validates planResult exists before accessing plan property
- All errors are caught and return typed JSON responses (never throws)

### 3. Draft Endpoint Compatibility Routes

**File:** `apps/core/cardbey-core/src/routes/draftCompatRoutes.js` (NEW)

Created compatibility routes for draft access by storeId:
- `GET /api/stores/:storeId/draft` - authenticated or public access
- `GET /api/public/store/:storeId/draft` - explicitly public access

**Implementation:**
- Looks up drafts by `committedStoreId` (storeId)
- Supports optional `generationRunId` query parameter for draft scoping
- Returns latest draft if no generationRunId match found
- Returns draft in expected format matching canonical `/api/draft-store/:draftId` response

**Mounted in:** `apps/core/cardbey-core/src/server.js`
```javascript
app.use('/api', draftCompatRoutes);
```

### 4. Flags V2 Endpoint (Already Fixed)

**File:** `apps/core/cardbey-core/src/routes/flagsV2Routes.js` (Already exists)

- Always mounted (not optional)
- Returns stable response: `{ ok: true, flags: {...}, meta: {...} }`

---

## Canonical Endpoints

### MI Routes (mounted at `/api/mi`)
- ✅ `POST /api/mi/orchestra/infer` - canonical inference endpoint
- ✅ `POST /api/mi/orchestra/start` - canonical job start endpoint
- ✅ `GET /api/mi/orchestra/job/:jobId` - get job status
- ✅ `POST /api/mi/orchestra/job/:jobId/run` - run job
- ✅ `POST /api/mi/orchestra/job/:jobId/sync-store` - sync store after job

### Draft Store Routes (mounted at `/api/draft-store`)
- ✅ `GET /api/draft-store/:draftId` - get draft by draftId
- ✅ `POST /api/draft-store/:draftId/commit` - commit draft to store

### Compatibility Routes (mounted at `/api`)
- ✅ `GET /api/stores/:storeId/draft` - compatibility for storeId lookup
- ✅ `GET /api/public/store/:storeId/draft` - public compatibility route

---

## Testing Checklist

### Backend Endpoints
```bash
# Test compatibility shims
curl -X POST http://localhost:3001/api/mi/infer \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"rawInput": "Test business", "sourceType": "form"}'

curl -X POST http://localhost:3001/api/mi/start \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"goal": "build_store", "businessName": "Test Store"}'

# Test draft compatibility
curl http://localhost:3001/api/stores/:storeId/draft?generationRunId=...

curl http://localhost:3001/api/public/store/:storeId/draft?generationRunId=...

# Test flags
curl http://localhost:3001/api/v2/flags
```

### Frontend Flow
1. ✅ QuickStart → Generate → No 404s on `/api/mi/infer` or `/api/mi/start`
2. ✅ Review page loads → No 404s on `/api/stores/:storeId/draft`
3. ✅ Flags load → No 404s on `/api/v2/flags`
4. ✅ Job polling works → No 404s on `/api/mi/orchestra/job/:jobId`

---

## Files Modified

1. ✅ `apps/core/cardbey-core/src/routes/miRoutes.js`
   - Extracted `handleOrchestraInfer` function
   - Added compatibility routes: `/infer`, `/start`, `/orchestra/job/:jobId`
   - Improved error handling in `/orchestra/infer`

2. ✅ `apps/core/cardbey-core/src/routes/draftCompatRoutes.js` (NEW)
   - Compatibility routes for draft access by storeId

3. ✅ `apps/core/cardbey-core/src/server.js`
   - Added import for `draftCompatRoutes`
   - Mounted at `/api`

4. ✅ `apps/core/cardbey-core/src/routes/flagsV2Routes.js` (Already exists)
   - Always mounted, returns stable flags response

---

## Next Steps (Frontend)

1. **Fix Frontend Import Paths** (TODO)
   - Verify SoftAuthPrompt path
   - Verify useGatekeeper path
   - Verify draftHero path

2. **Fix Frontend API Base Resolution** (TODO)
   - Ensure SSE uses absolute URLs
   - Ensure all API calls use canonical resolver

---

## Status: ✅ **BACKEND COMPLETE**

All backend compatibility shims are in place. The QuickStart flow should now work end-to-end without 404/500 errors.

**Remaining:** Frontend import path fixes and API base resolution (separate task).

