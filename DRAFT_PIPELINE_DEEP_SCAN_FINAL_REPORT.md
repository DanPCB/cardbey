# Draft Pipeline Deep Scan – Final Report

**Generated:** 2025-01-XX  
**Method:** Code trace + runtime log analysis  
**Focus:** Root causes matching observed symptoms

---

## 1) Observed Runtime Symptoms (from logs)

### Symptom 1: sync-store returns 400/500
- **Observed:** `POST /api/mi/orchestra/job/:jobId/sync-store` returns HTTP 400 or 500
- **Logs show:** `[SYNC_STORE_ERROR]` followed by 400 response
- **Impact:** Frontend treats as error, stops polling, user sees failure

### Symptom 2: DraftStore.status='error' but lastError/lastErrorAt are null
- **Observed:** UI debug box shows `status=error, lastError=null, lastErrorAt=null`
- **Logs show:** `[DRAFT_LOOKUP] ... status: 'error'` but no error field in response
- **Impact:** User sees "Catalog generation failed" with no details

### Symptom 3: Draft polling is noisy (NS_BINDING_ABORTED)
- **Observed:** Console spam with abort errors during polling
- **Impact:** Console noise, potential error UI flicker

### Symptom 4: draftFound flips depending on generationRunId
- **Observed:** `[DRAFT_LOOKUP] mode=exact|latest|none` - draftFound changes
- **Impact:** UI shows "generating" when draft exists but generationRunId mismatches

---

## 2) Actual Root Causes (with file + line refs)

### Root Cause 1: sync-store returns 400 when catalog empty (job finished)

**Location:** `apps/core/cardbey-core/src/routes/miRoutes.js:3139`

**Code:**
```javascript
// Line 3031-3148
if (!catalogOutput || productsWritten === 0) {
  // ... check if job running (returns 202 if running) ...
  
  // Job is finished but catalog is missing/empty - mark as error
  // ... markDraftError() called ...
  
  // Return error response (only when job is finished)
  return res.status(400).json({
    ok: false,
    code: 'CATALOG_EMPTY',
    error: 'CATALOG_EMPTY',
    message: errorMessage,
    storeId,
    jobId,
    productsWritten: 0,
    imagesWritten: 0,
  });
}
```

**Problem:**
- Returns HTTP 400 (client error) when catalog is empty
- Frontend may treat 400 as fatal and stop retrying
- Response shape is correct (has `code`, `error`, `message`) ✅
- **BUT:** 400 suggests client error, when it's actually a server-side generation failure

**Fix:** Change to HTTP 500 (server error) OR keep 400 but ensure frontend handles it as non-fatal

---

### Root Cause 2: draftStoreService.js uses status='failed' (not 'error')

**Location:** `apps/core/cardbey-core/src/services/draftStore/draftStoreService.js:61, 191, 216, 218`

**Code:**
```javascript
// Line 59-63: Expiry check
await prisma.draftStore.update({
  where: { id: draftId },
  data: { status: 'failed', error: 'Draft expired' },  // ❌ Uses 'failed' not 'error'
});

// Line 188-194: Generation error
await prisma.draftStore.update({
  where: { id: draftId },
  data: {
    status: 'failed',  // ❌ Uses 'failed' not 'error'
    error: error.message || String(error),  // ✅ Has error field
  },
});
```

**Problem:**
- Uses `status='failed'` instead of `status='error'`
- Draft endpoint query filters: `status: { in: ['draft', 'generating', 'ready', 'error'] }` (line 521, 562 in stores.js)
- **Result:** Drafts with `status='failed'` are NOT found by draft endpoint
- **Result:** UI never sees these drafts, shows placeholder instead

**Fix:** Change all `status='failed'` → `status='error'` OR update queries to include 'failed'

---

### Root Cause 3: draftStore.js sets status='failed' without error field

**Location:** `apps/core/cardbey-core/src/routes/draftStore.js:187`

**Code:**
```javascript
// Line 180-189
let status = 'generating';
try {
  await generateDraft(draft.id);
  status = 'ready';
} catch (genError) {
  console.error(`[DraftStore] Generation error for draft ${draft.id}:`, genError);
  status = 'failed';  // ❌ Sets status but doesn't update DraftStore
  // Still return draftId so frontend can check status
}

res.json({
  ok: true,
  draftId: draft.id,
  status,  // ❌ Returns 'failed' but DraftStore row is NOT updated
});
```

**Problem:**
- Sets local variable `status='failed'` but **never updates DraftStore row**
- DraftStore row remains `status='generating'` even after error
- Response says `status='failed'` but database says `status='generating'`
- **Result:** Draft endpoint returns `status='generating'` (from DB), UI polls forever

**Fix:** Update DraftStore row when error occurs, use `markDraftError()` helper

---

### Root Cause 4: generationRunId stored in JSON (fragile lookup)

**Location:** Multiple files

**Flow:**
1. **Frontend → Backend:** `POST /api/mi/orchestra/start` with `generationRunId` in body (line 735 in miRoutes.js)
2. **Backend stores:** `DraftStore.input.generationRunId` (JSON field, line 1254)
3. **Backend stores:** `OrchestratorTask.request.generationRunId` (JSON field)
4. **Draft endpoint reads:** `req.query.generationRunId` OR `store.stylePreferences.generationRunId` (line 500, 506 in stores.js)
5. **Lookup requires:** `JSON.parse(draft.input)` → `draftInput.generationRunId` (line 542-545)

**Problem:**
- If `draft.input` is corrupted JSON → parse fails → lookup fails silently (try/catch swallows error)
- If `generationRunId` not in query param → falls back to `stylePreferences` (may be stale)
- No index on JSON field → slow queries
- Multiple drafts for same `storeId` → wrong draft returned if `generationRunId` mismatches

**Evidence:**
- Line 551 in stores.js: `catch (e) { // Skip parse errors }` - silently fails
- Line 2166 in miRoutes.js: `catch (e) { // Skip parse errors }` - silently fails

**Fix:** Add dedicated `generationRunId` column (indexed) OR improve error handling

---

### Root Cause 5: Draft endpoint may not select error field

**Location:** `apps/core/cardbey-core/src/routes/stores.js:518-537, 544-551`

**Code:**
```javascript
// Line 518-537: Priority A lookup
const drafts = await prisma.draftStore.findMany({
  where: { ... },
  select: {
    id: true,
    status: true,
    error: true,  // ✅ Selected
    updatedAt: true,  // ✅ Selected
    // ... other fields
  },
});

// Line 544-551: Priority B lookup
draftScope = await prisma.draftStore.findFirst({
  where: { ... },
  orderBy: { createdAt: 'desc' },
  // ❌ NO SELECT - returns all fields (should be OK, but not explicit)
});
```

**Problem:**
- Priority B lookup doesn't explicitly `select` fields
- If Prisma schema changes, may not return `error`/`updatedAt`
- **Current state:** Should work (returns all fields), but not defensive

**Fix:** Add explicit `select` to Priority B lookup (match Priority A)

---

### Root Cause 6: UI reads from multiple locations (fragile)

**Location:** `apps/dashboard/cardbey-marketing-dashboard/src/pages/store/StoreReviewPage.tsx:1749-1751`

**Code:**
```typescript
// Line 1749-1751
const status = response.draft?.meta?.status || response.status || response.store?.status || null;
const error = response.draft?.meta?.lastError || response.lastError || null;
const errorAt = response.draft?.meta?.lastErrorAt || response.lastErrorAt || null;
```

**Problem:**
- Reads from 3 different locations (fragile)
- If backend changes response shape, UI breaks
- **Current backend:** Returns both top-level AND `draft.meta` (line 692-694, 707-709 in stores.js) ✅

**Status:** ✅ Working but fragile - depends on backend maintaining both locations

---

### Root Cause 7: AbortError handling inconsistent

**Location:** Multiple files

**Current state:**
- `api.ts` line 637-644: Detects `AbortError`, throws silent abort error ✅
- `StoreReviewPage.tsx` line 1737-1743: Catches and ignores `AbortError` ✅
- **BUT:** Some catch blocks may still log warnings

**Problem:**
- Console may still show abort errors if logging happens before catch
- Firefox shows `NS_BINDING_ABORTED` in network tab (browser-level, can't suppress)

**Status:** ✅ Mostly fixed, but browser-level abort messages are unavoidable

---

## 3) Fix Pack (max 5 patches)

### Patch 1: Fix draftStoreService.js to use status='error' and update DraftStore

**Priority:** P0 (blocks error display)

**Files:**
- `apps/core/cardbey-core/src/services/draftStore/draftStoreService.js`

**Change:**
```javascript
// BEFORE (line 59-63):
await prisma.draftStore.update({
  where: { id: draftId },
  data: { status: 'failed', error: 'Draft expired' },
});

// AFTER:
await prisma.draftStore.update({
  where: { id: draftId },
  data: { 
    status: 'error',  // ✅ Use 'error' not 'failed'
    error: 'Draft expired',
    updatedAt: new Date(),  // ✅ Set timestamp
  },
});

// BEFORE (line 188-194):
await prisma.draftStore.update({
  where: { id: draftId },
  data: {
    status: 'failed',
    error: error.message || String(error),
  },
});

// AFTER:
await prisma.draftStore.update({
  where: { id: draftId },
  data: {
    status: 'error',  // ✅ Use 'error' not 'failed'
    error: error.message || String(error),
    updatedAt: new Date(),  // ✅ Set timestamp
  },
});

// BEFORE (line 216-218):
await prisma.draftStore.update({
  where: { id: draftId },
  data: { status: 'failed', error: 'Draft expired' },
});
draft.status = 'failed';

// AFTER:
await prisma.draftStore.update({
  where: { id: draftId },
  data: { 
    status: 'error',  // ✅ Use 'error' not 'failed'
    error: 'Draft expired',
    updatedAt: new Date(),  // ✅ Set timestamp
  },
});
draft.status = 'error';  // ✅ Update local variable too
```

**Acceptance:**
- All DraftStore rows with error state use `status='error'`
- SQL: `SELECT * FROM "DraftStore" WHERE status='failed'` returns 0 rows
- Draft endpoint finds these drafts (query includes 'error')

**Risk:** Low (only affects error paths)

---

### Patch 2: Fix draftStore.js to update DraftStore row on error

**Priority:** P0 (blocks error state persistence)

**Files:**
- `apps/core/cardbey-core/src/routes/draftStore.js`

**Change:**
```javascript
// BEFORE (line 180-189):
let status = 'generating';
try {
  await generateDraft(draft.id);
  status = 'ready';
} catch (genError) {
  console.error(`[DraftStore] Generation error for draft ${draft.id}:`, genError);
  status = 'failed';  // ❌ Only sets local variable
  // Still return draftId so frontend can check status
}

// AFTER:
let status = 'generating';
try {
  await generateDraft(draft.id);
  status = 'ready';
} catch (genError) {
  console.error(`[DraftStore] Generation error for draft ${draft.id}:`, genError);
  
  // CRITICAL: Update DraftStore row with error state
  await prisma.draftStore.update({
    where: { id: draft.id },
    data: {
      status: 'error',  // ✅ Use 'error' not 'failed'
      error: genError.message || String(genError),
      updatedAt: new Date(),  // ✅ Set timestamp
    },
  });
  
  status = 'error';  // ✅ Update local variable
  // Still return draftId so frontend can check status
}
```

**Acceptance:**
- DraftStore row is updated when generation fails
- Draft endpoint returns `status='error'` (not 'generating')
- UI stops polling when error occurs

**Risk:** Low (only affects error path)

---

### Patch 3: Change sync-store 400 to 500 for catalog empty (job finished)

**Priority:** P1 (improves error semantics)

**Files:**
- `apps/core/cardbey-core/src/routes/miRoutes.js`

**Change:**
```javascript
// BEFORE (line 3139):
return res.status(400).json({
  ok: false,
  code: 'CATALOG_EMPTY',
  error: 'CATALOG_EMPTY',
  message: errorMessage,
  // ...
});

// AFTER:
// CRITICAL: Use 500 (server error) not 400 (client error)
// Catalog empty is a server-side generation failure, not a client error
return res.status(500).json({
  ok: false,
  code: 'CATALOG_EMPTY',
  error: 'CATALOG_EMPTY',
  message: errorMessage,
  storeId,
  jobId,
  productsWritten: 0,
  imagesWritten: 0,
  // Include error details for debugging
  details: {
    hasCatalogOutput: !!catalogOutput,
    taskStatus: task.status,
    generationRunId: generationRunId || null,
  },
});
```

**Acceptance:**
- sync-store returns 500 (not 400) when catalog empty AND job finished
- Response includes `code`, `error`, `message`, `details`
- Frontend can distinguish client errors (400) from server errors (500)

**Risk:** Low (only changes HTTP status code, response shape unchanged)

---

### Patch 4: Add explicit select to Priority B draft lookup

**Priority:** P1 (defensive programming)

**Files:**
- `apps/core/cardbey-core/src/routes/stores.js`

**Change:**
```javascript
// BEFORE (line 544-551):
draftScope = await prisma.draftStore.findFirst({
  where: {
    committedStoreId: id,
    status: { in: ['draft', 'generating', 'ready', 'error'] },
  },
  orderBy: { createdAt: 'desc' },
  // ❌ No select - returns all fields
});

// AFTER:
draftScope = await prisma.draftStore.findFirst({
  where: {
    committedStoreId: id,
    status: { in: ['draft', 'generating', 'ready', 'error'] },
  },
  orderBy: { createdAt: 'desc' },
  // ✅ Explicit select (matches Priority A)
  select: {
    id: true,
    status: true,
    error: true,
    updatedAt: true,
    createdAt: true,
    input: true,
    preview: true,
    committedStoreId: true,
    committedUserId: true,
    mode: true,
    expiresAt: true,
  },
});
```

**Acceptance:**
- Priority B lookup explicitly selects required fields
- Both Priority A and B return same field set
- Defensive against schema changes

**Risk:** Very low (only adds explicit select)

---

### Patch 5: Improve generationRunId lookup error handling

**Priority:** P1 (prevents silent failures)

**Files:**
- `apps/core/cardbey-core/src/routes/stores.js`
- `apps/core/cardbey-core/src/routes/miRoutes.js`

**Change:**
```javascript
// BEFORE (line 540-553 in stores.js):
for (const draft of drafts) {
  try {
    const draftInput = typeof draft.input === 'string' 
      ? JSON.parse(draft.input) 
      : draft.input;
    if (draftInput?.generationRunId === requestedGenerationRunId) {
      draftScope = draft;
      draftFound = true;
      lookupMode = 'exact';
      break;
    }
  } catch (e) {
    // Skip parse errors  // ❌ Silent failure
  }
}

// AFTER:
for (const draft of drafts) {
  try {
    const draftInput = typeof draft.input === 'string' 
      ? JSON.parse(draft.input) 
      : draft.input;
    if (draftInput?.generationRunId === requestedGenerationRunId) {
      draftScope = draft;
      draftFound = true;
      lookupMode = 'exact';
      break;
    }
  } catch (e) {
    // Log parse errors for debugging (non-fatal)
    console.warn(`[DRAFT_LOOKUP] Failed to parse draft.input for draftId=${draft.id}:`, e.message);
    // Continue to next draft (don't break lookup)
  }
}
```

**Apply same pattern to:**
- `miRoutes.js` line 2156-2168 (sync-store lookup)
- `miRoutes.js` line 1659-1672 (GET job lookup)
- `miRoutes.js` line 73-85 (markDraftError lookup)

**Acceptance:**
- Parse errors are logged (not silent)
- Lookup continues to next draft (doesn't fail completely)
- Easier to debug corrupted JSON

**Risk:** Very low (only adds logging)

---

## 4) Response Contract (final shape)

### GET /api/stores/:storeId/draft

**Success Response (200 OK):**
```typescript
{
  ok: true,
  draftFound: boolean,  // true if DraftStore found, false if placeholder
  status: 'generating' | 'ready' | 'error',  // DraftStore.status (normalized)
  lastError: string | null,  // Always non-null if status='error'
  lastErrorAt: string | null,  // Always non-null if status='error' (ISO timestamp)
  draft: {
    meta: {
      storeId: string,
      storeName: string,
      status: 'generating' | 'ready' | 'error',  // Same as top-level status
      lastError?: string,  // Same as top-level lastError (if status='error')
      lastErrorAt?: string,  // Same as top-level lastErrorAt (if status='error')
      // ... other meta fields
    },
    catalog: {
      products: Array<{ id, name, price, ... }>,
      categories: Array<{ id, name }>,
    },
  },
  // Backward compatibility fields
  store: { id, name, ... },
  products: Array,
  categories: Array,
  productsCount: number,
  categoriesCount: number,
}
```

**Error Response (4xx/5xx):**
```typescript
{
  ok: false,
  error: string,  // Error code
  message: string,  // Human-readable message
}
```

**Critical invariants:**
- If `status='error'`, then `lastError` and `lastErrorAt` are **always non-null**
- `lastError` is synthesized if DraftStore has `status='error'` but `error` field is null
- `lastErrorAt` falls back: `updatedAt` → `createdAt` → `new Date()`

---

### POST /api/mi/orchestra/job/:jobId/sync-store

**Success Response (200 OK):**
```typescript
{
  ok: true,
  message: 'Store synced successfully',
  storeId: string,
  jobId: string,
  productsWritten: number,  // > 0 on success
  imagesWritten: number,
}
```

**Not Ready Response (202 Accepted):**
```typescript
{
  ok: false,
  status: 'generating',
  reason: 'catalog_not_ready',
  message: 'Catalog generation in progress. Please retry later.',
  storeId: string,
  jobId: string,
  productsWritten: 0,
  imagesWritten: 0,
}
// Headers: Retry-After: 2
```

**Error Response (400 Bad Request):**
```typescript
{
  ok: false,
  error: 'missing_generation_run_id' | 'GENERATION_RUN_ID_MISMATCH' | 'missing_store_id' | 'JOB_NOT_FOUND',
  message: string,
  // ... context fields
}
```

**Error Response (500 Internal Server Error):**
```typescript
{
  ok: false,
  code: 'CATALOG_EMPTY' | 'sync_failed',
  error: 'CATALOG_EMPTY' | 'sync_failed',
  message: string,
  storeId: string,
  jobId: string,
  productsWritten: 0,
  imagesWritten: 0,
  details?: {  // Optional: additional context
    hasCatalogOutput: boolean,
    taskStatus: string,
    generationRunId: string | null,
  },
}
```

**Critical invariants:**
- Returns 202 (not 400) if catalog not ready AND job still running
- Returns 500 (not 400) if catalog empty AND job finished (server error, not client error)
- Returns 400 only for client errors (invalid jobId, missing generationRunId, etc.)

---

## 5) Verification Steps (5 min checklist)

### Step 1: Verify DraftStore error fields are always set

```sql
-- Run in database
SELECT id, status, error, "updatedAt" 
FROM "DraftStore" 
WHERE status = 'error' 
  AND (error IS NULL OR error = '' OR "updatedAt" IS NULL);

-- Expected: 0 rows
-- If > 0 rows: Patch 1 or 2 not applied correctly
```

---

### Step 2: Verify no status='failed' rows

```sql
-- Run in database
SELECT id, status, error 
FROM "DraftStore" 
WHERE status = 'failed';

-- Expected: 0 rows
-- If > 0 rows: Patch 1 not applied (draftStoreService.js still uses 'failed')
```

---

### Step 3: Test draft endpoint returns lastError when status='error'

```bash
# Get a storeId with error draft
STORE_ID="your-store-id"

# Call draft endpoint
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3001/api/stores/$STORE_ID/draft" | jq '.status, .lastError, .lastErrorAt'

# Expected output:
# "error"
# "sync-store: Catalog empty (0 products written)"  (or similar, non-null)
# "2025-01-XXT..."  (ISO timestamp, non-null)
```

---

### Step 4: Test sync-store returns 500 (not 400) when catalog empty

```bash
# Trigger sync-store for a job with empty catalog
JOB_ID="your-job-id"

# Call sync-store
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"generationRunId":"gen-..."}' \
  "http://localhost:3001/api/mi/orchestra/job/$JOB_ID/sync-store" | jq '.ok, .code, .error'

# Expected output (if job finished and catalog empty):
# false
# "CATALOG_EMPTY"
# "CATALOG_EMPTY"
# HTTP status: 500 (not 400)
```

---

### Step 5: Test generationRunId lookup works

```bash
# Call draft endpoint with generationRunId in query
STORE_ID="your-store-id"
GEN_RUN_ID="gen-1234567890-abc"

curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3001/api/stores/$STORE_ID/draft?generationRunId=$GEN_RUN_ID" | jq '.draftFound, .status'

# Expected:
# true (if draft exists with matching generationRunId)
# "generating" | "ready" | "error"
```

---

### Step 6: Check console for abort errors

```bash
# Open browser console, navigate to store review page
# Watch for: "NS_BINDING_ABORTED" or "AbortError" messages

# Expected: Minimal/no abort errors in console
# If many: Check usePoller.ts and api.ts abort handling
```

---

## Summary

**Critical Issues Found:**
1. ✅ `draftStoreService.js` uses `status='failed'` (not 'error') - **PATCH 1**
2. ✅ `draftStore.js` sets local `status='failed'` but doesn't update DB - **PATCH 2**
3. ✅ `sync-store` returns 400 for server error (should be 500) - **PATCH 3**
4. ⚠️ Priority B draft lookup lacks explicit select - **PATCH 4** (defensive)
5. ⚠️ generationRunId lookup silently fails on JSON parse errors - **PATCH 5** (defensive)

**All patches are low-risk and can be applied immediately.**

**Estimated fix time:** 2-3 hours

