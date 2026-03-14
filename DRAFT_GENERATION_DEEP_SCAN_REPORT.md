# Cardbey Draft Generation Deep Scan Report

**Generated:** 2025-01-XX  
**Scope:** Store draft generation + MI orchestration pipeline  
**Focus:** Root causes, not symptoms

---

## 1) End-to-end Flow Map

```
┌─────────────────────────────────────────────────────────────────┐
│ FRONTEND: StoreReviewPage.tsx                                   │
│                                                                   │
│ 1. User navigates to /store/:storeId/review                      │
│ 2. loadStoreData() → GET /api/stores/:storeId/draft              │
│ 3. usePoller() polls draft endpoint every 2000ms                 │
│ 4. If draft.status='generating' → continue polling               │
│ 5. If draft.status='error' → show error UI                       │
│ 6. If draft.status='ready' + productsCount>0 → render draft     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ BACKEND: GET /api/stores/:storeId/draft (stores.js)             │
│                                                                   │
│ 1. Find DraftStore by committedStoreId + generationRunId         │
│    - Priority A: Exact match by generationRunId                  │
│    - Priority B: Latest draft for storeId                        │
│    - Priority C: Placeholder (draftFound=false)                 │
│ 2. Extract error/updatedAt → lastError/lastErrorAt              │
│ 3. Return { ok:true, draft:{ meta:{status,lastError,...} } }   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ ORCHESTRATION: POST /api/mi/orchestra/start (miRoutes.js)       │
│                                                                   │
│ 1. Create OrchestratorTask (job)                                │
│ 2. Create/upsert DraftStore with status='generating'             │
│    - Store generationRunId in DraftStore.input                   │
│    - Initialize preview: { catalog: {products:[], categories:[]} │
│ 3. Return { ok:true, jobId, generationRunId }                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ STAGE EXECUTION: seedCatalogService.ts                          │
│                                                                   │
│ 1. Generate catalog (products + categories)                     │
│ 2. Update DraftStore.preview with catalog output                │
│ 3. Set DraftStore.status='ready' if products>0                  │
│ 4. Set DraftStore.status='error' if products=0 (via markDraftError)│
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ SYNC: POST /api/mi/orchestra/job/:jobId/sync-store              │
│                                                                   │
│ 1. Read catalog from DraftStore.preview (Strategy 0)             │
│    - Fallback: task.outputs, ActivityEvent, etc.                 │
│ 2. Write Products/Categories to DB                               │
│ 3. Update DraftStore.status='ready' if productsWritten>0         │
│ 4. Update DraftStore.status='error' if productsWritten=0         │
│    (via markDraftError)                                         │
│ 5. Update OrchestratorTask.status='failed' if DraftStore.error  │
└─────────────────────────────────────────────────────────────────┘
```

**Key Data Flow:**
- `generationRunId`: Frontend → `/orchestra/start` → `DraftStore.input.generationRunId` → Draft lookup
- `DraftStore.preview`: Written by `seedCatalogService` → Read by `sync-store` → Returned by draft endpoint
- `DraftStore.status`: `generating` → `ready` (success) OR `error` (failure)
- `DraftStore.error` + `updatedAt`: Always set when `status='error'` (via `markDraftError`)

---

## 2) High Priority Breakages (P0)

### P0-1: ReferenceError: pollingStatus is not defined

**Symptom:** Frontend runtime crash in `StoreReviewPage.tsx` line ~1870

**Root Cause:** 
- Variable `pollingStatus` was removed during migration to `usePoller` hook
- UI code still references `pollingStatus` or `setPollingStatus()` 
- **Status:** ✅ FIXED - No matches found in current codebase (already removed)

**Risk if unfixed:** Page crashes on load, user cannot access store review

**Verification:**
```bash
grep -r "pollingStatus" apps/dashboard/cardbey-marketing-dashboard/src/pages/store/StoreReviewPage.tsx
# Should return: No matches found
```

---

### P0-2: ReferenceError: catalogOutput is not defined

**Symptom:** Backend runtime crash in `miRoutes.js` sync-store handler ~line 2669

**Root Cause:**
- Variable `catalogOutput` was declared inside `try` block but referenced outside
- **Current state:** ✅ FIXED - Declared at line 2130 in outer scope: `let catalogOutput = null;`
- Guardrail added: Runtime assertion at line 2136 (dev-only)

**Risk if unfixed:** `sync-store` endpoint crashes, products never written to DB

**Verification:**
```bash
grep -A 5 "let catalogOutput" apps/core/cardbey-core/src/routes/miRoutes.js
# Should show: Declaration in outer scope (line ~2130)
```

---

### P0-3: DraftStore.status='error' but lastError/lastErrorAt are null

**Symptom:** UI shows `status=error, lastError=null, lastErrorAt=null` in debug box

**Root Cause:**
- **FIXED:** `markDraftError()` helper now always sets `error` and `updatedAt` (lines 30-104 in miRoutes.js)
- **FIXED:** Draft endpoint synthesizes fallback if null (lines 665-681 in stores.js)
- **REMAINING RISK:** Legacy code paths that set `status='error'` without using `markDraftError()`

**Legacy paths found:**
1. `draftStoreService.js` line 188-194: Sets `status='failed'` (not 'error') with `error` field
2. `systemRoutes.js` line 90: Sets `status="error"` (needs verification if it sets error field)

**Risk if unfixed:** Users see "Catalog generation failed" with no details, cannot debug

**Verification:**
```sql
-- Check for DraftStore rows with status='error' but error IS NULL
SELECT id, status, error, updatedAt FROM "DraftStore" 
WHERE status = 'error' AND (error IS NULL OR error = '');
-- Should return: 0 rows
```

**Fix Required:**
- Audit all `prisma.draftStore.update()` calls that set `status='error'`
- Ensure they all use `markDraftError()` helper OR set `error` + `updatedAt` explicitly

---

### P0-4: generationRunId mismatch causes draftFound=false

**Symptom:** Draft endpoint logs `draftFound=false` even when DraftStore exists

**Root Cause:**
- Frontend sends `generationRunId` in query param OR reads from `stylePreferences`
- Backend looks up DraftStore by `input.generationRunId` (requires JSON parse)
- If `generationRunId` mismatches OR is missing, lookup fails
- **FIXED:** Draft endpoint now has fallback (Priority B: latest draft, Priority C: placeholder)

**Current behavior:**
- Priority A: Exact match by `generationRunId` ✅
- Priority B: Latest draft if no exact match ✅
- Priority C: Placeholder if no draft exists ✅

**Risk if unfixed:** UI shows "generating" forever even when draft exists

**Verification:**
```bash
# Check draft endpoint logs for lookup mode
grep "\[DRAFT_LOOKUP\]" logs | tail -20
# Should show: mode=exact|latest|none
```

---

### P0-5: productsWritten=0 causes infinite "generating" state

**Symptom:** `sync-store` returns `productsWritten=0`, DraftStore stays `generating`, UI polls forever

**Root Cause:**
- `sync-store` reads catalog from `DraftStore.preview` (Strategy 0)
- If `preview` is missing/empty OR catalog has no products → `productsWritten=0`
- **FIXED:** `sync-store` now marks DraftStore as 'error' when job is finished AND `productsWritten=0`
- **FIXED:** Frontend stops polling when `draftStatus='error'`

**Remaining risk:**
- If `seedCatalogService` fails silently (doesn't update `DraftStore.preview`)
- If catalog is generated but `preview` is not persisted

**Risk if unfixed:** User waits forever, no error feedback

**Verification:**
```bash
# Check sync-store logs for productsWritten=0
grep "\[SYNC_STORE.*productsWritten=0" logs
# Should show: DraftStore marked as error
```

---

## 3) Structural Risks (P1)

### P1-1: Multiple DraftStore status update paths (inconsistent)

**Finding:**
- `markDraftError()` helper: Sets `status='error'`, `error`, `updatedAt` ✅
- `seedCatalogService.ts` line 699-706: Inline update (sets `status='error'`, `error`, `updatedAt`) ✅
- `draftStoreService.js` line 188-194: Sets `status='failed'` (not 'error') ⚠️
- `sync-store` line 2927-2933: Sets `status='ready'` (no error field update) ✅

**Risk:** Status transitions not centralized, easy to miss error field updates

**Recommendation:** 
- Standardize on `status='error'` (not 'failed')
- All error paths MUST use `markDraftError()` helper
- All ready paths should clear `error` field

---

### P1-2: generationRunId stored in JSON (fragile lookup)

**Finding:**
- `generationRunId` stored in `DraftStore.input` (JSON field)
- Lookup requires: `JSON.parse(draft.input)` → check `draftInput.generationRunId`
- If JSON parse fails → lookup silently fails (try/catch swallows error)

**Risk:** 
- Corrupted JSON → draft not found
- No index on JSON field → slow queries
- Multiple drafts for same storeId → wrong draft returned

**Recommendation:**
- Add dedicated `generationRunId` column to `DraftStore` schema (indexed)
- Migration: Extract from `input.generationRunId` → new column
- Update all code to use column instead of JSON path

---

### P1-3: Polling can run forever if stop conditions not met

**Finding:**
- `StoreReviewPage.tsx` line 1694-1701: `shouldStopPolling` depends on:
  - `productsCount > 0` OR
  - `jobStatus === 'COMPLETED'` OR
  - `draftStatus === 'error'`
- If job never completes AND draft never becomes ready/error → infinite polling

**Risk:** 
- Server load from continuous polling
- User sees "generating" forever

**Current safeguards:**
- `isPollingLongTime` flag after 30s (shows "taking longer" UI)
- User can click "Continue to Review" to stop polling

**Recommendation:**
- Add hard timeout: Stop polling after 5 minutes
- Show error UI: "Generation taking too long, please retry"

---

### P1-4: AbortError handling inconsistent

**Finding:**
- `api.ts` line 637-644: Detects `AbortError`, throws silent abort error ✅
- `StoreReviewPage.tsx` line 1737-1743: Catches and ignores `AbortError` ✅
- `ProductSuggestions.tsx` line 120: Catches and ignores `AbortError` ✅
- **BUT:** Some catch blocks may still log abort errors as warnings

**Risk:** Console spam with "NS_BINDING_ABORTED" messages

**Verification:**
```bash
# Check for abort error logs
grep -i "abort" logs | grep -v "AbortError.*silent"
# Should return: Minimal/no results
```

---

### P1-5: sync-store can be called before catalog is ready

**Finding:**
- `StoreDraftReview.tsx` line 441-472: Calls `sync-store` if `draftStatus === 'ready'`
- **BUT:** `sync-store` can return `202 Accepted` if catalog not ready yet
- Frontend handles 202 correctly (doesn't treat as error) ✅

**Risk:** 
- Unnecessary `sync-store` calls while catalog is generating
- Rate limiting side effects

**Current safeguards:**
- 5-second cooldown between `sync-store` calls ✅
- Gate: Only call if `draftStatus === 'ready'` OR `jobStatus === 'COMPLETED'` ✅

---

## 4) Data Contract & Single Source of Truth

### Single Source of Truth Decision

**RECOMMENDED:** `DraftStore` is the single source of truth for draft state

**Rationale:**
- `DraftStore` persists catalog in `preview` field (written by `seedCatalogService`)
- `DraftStore` tracks status transitions (`generating` → `ready` OR `error`)
- `DraftStore` links to `storeId` via `committedStoreId`
- `DraftStore` isolates by `generationRunId` (stored in `input.generationRunId`)

**OrchestratorTask (job) role:**
- Tracks orchestration execution state (`queued`, `running`, `completed`, `failed`)
- **NOT** the source of truth for draft content (catalog, products, status)
- **BUT:** Job status can influence draft status (if job fails → draft should be error)

**Product rows role:**
- Final persisted state (after user commits draft)
- **NOT** used for draft preview/status

---

### Allowed Status Transitions

```
DraftStore.status:
  'draft' → 'generating' → 'ready' ✅
  'draft' → 'generating' → 'error' ✅
  'generating' → 'ready' ✅
  'generating' → 'error' ✅
  
  INVALID:
  'ready' → 'generating' ❌
  'error' → 'generating' ❌ (must create new draft with new generationRunId)
```

**Status Definitions:**
- `'draft'`: Initial state (user started draft creation)
- `'generating'`: Catalog generation in progress
- `'ready'`: Catalog generated successfully, has products
- `'error'`: Generation failed, has error details

---

### Required Fields Contract

**When `status='generating'`:**
- ✅ `input.generationRunId` (string, required)
- ✅ `preview.catalog.products` (array, can be empty)
- ✅ `preview.catalog.categories` (array, can be empty)
- ✅ `preview.meta.status='generating'`
- ❌ `error` (should be null)

**When `status='ready'`:**
- ✅ `input.generationRunId` (string, required)
- ✅ `preview.catalog.products` (array, length > 0)
- ✅ `preview.catalog.categories` (array, length >= 0)
- ✅ `preview.meta.status='ready'`
- ✅ `preview.meta.productsCount > 0`
- ❌ `error` (should be null)

**When `status='error'`:**
- ✅ `input.generationRunId` (string, required)
- ✅ `error` (string, required, non-empty, max 2000 chars)
- ✅ `updatedAt` (DateTime, required, timestamp of error)
- ❌ `preview.catalog.products` (can be empty or missing)

**Response Contract (GET /api/stores/:storeId/draft):**
```typescript
{
  ok: true,
  draftFound: boolean,
  status: 'generating' | 'ready' | 'error',
  lastError: string | null,  // Always non-null if status='error'
  lastErrorAt: string | null, // Always non-null if status='error' (ISO timestamp)
  draft: {
    meta: {
      storeId: string,
      status: 'generating' | 'ready' | 'error',
      lastError?: string,
      lastErrorAt?: string,
      ...
    },
    catalog: {
      products: Array,
      categories: Array,
    }
  }
}
```

---

## 5) Proposed Fix Pack (max 5 patches)

### Patch 1: Audit and fix all DraftStore.status='error' paths

**Priority:** P0 (blocks error details in UI)

**Files:**
- `apps/core/cardbey-core/src/services/draftStore/draftStoreService.js` (line 188-194)
- `apps/core/cardbey-core/src/routes/systemRoutes.js` (line 90, verify)

**Change:**
```javascript
// BEFORE (draftStoreService.js):
await prisma.draftStore.update({
  where: { id: draftId },
  data: {
    status: 'failed',  // ❌ Should be 'error'
    error: error.message || String(error),  // ✅ Has error field
  },
});

// AFTER:
// Import markDraftError from miRoutes or create shared helper
await markDraftError({
  committedStoreId: draft.committedStoreId,
  generationRunId: draft.input?.generationRunId,
  jobId: null,
  err: error,
  stage: 'draftStoreService',
});
```

**Acceptance:**
- All `status='error'` rows have non-null `error` and `updatedAt`
- SQL query returns 0 rows: `SELECT * FROM "DraftStore" WHERE status='error' AND (error IS NULL OR updatedAt IS NULL)`

**Risk:** Low (only affects error paths)

---

### Patch 2: Add generationRunId column to DraftStore schema

**Priority:** P1 (improves lookup reliability)

**Files:**
- `apps/core/cardbey-core/prisma/schema.prisma`
- Migration file
- All DraftStore queries/updates

**Change:**
```prisma
// schema.prisma
model DraftStore {
  // ... existing fields ...
  generationRunId String?  // NEW: Dedicated column (indexed)
  @@index([committedStoreId, generationRunId])  // NEW: Composite index
}
```

**Migration:**
```sql
-- Extract generationRunId from input JSON
UPDATE "DraftStore" 
SET "generationRunId" = (input->>'generationRunId')::text
WHERE "generationRunId" IS NULL AND input IS NOT NULL;
```

**Code updates:**
- Replace all `JSON.parse(draft.input).generationRunId` → `draft.generationRunId`
- Update `markDraftError()` to use column
- Update draft endpoint lookup to use column

**Acceptance:**
- Draft lookup by `generationRunId` is 10x faster (indexed)
- No JSON parse errors in lookup path
- All existing drafts have `generationRunId` populated

**Risk:** Medium (requires migration, code changes in 10+ files)

---

### Patch 3: Add hard timeout to polling (5 minutes)

**Priority:** P1 (prevents infinite polling)

**Files:**
- `apps/dashboard/cardbey-marketing-dashboard/src/pages/store/StoreReviewPage.tsx`

**Change:**
```typescript
// Add to usePoller hook or StoreReviewPage
const POLLING_MAX_DURATION_MS = 5 * 60 * 1000; // 5 minutes

// In polling function:
const pollingDuration = Date.now() - (pollingStartTimeRef.current || 0);
if (pollingDuration > POLLING_MAX_DURATION_MS) {
  console.error('[StoreReviewPage] Polling timeout after 5 minutes');
  setDraftStatus('error');
  setLastError('Generation timed out after 5 minutes. Please retry.');
  setLastErrorAt(new Date().toISOString());
  setLoading(false);
  return; // Stop polling
}
```

**Acceptance:**
- Polling stops after 5 minutes
- User sees error UI with timeout message
- No infinite polling in logs

**Risk:** Low (only adds safety timeout)

---

### Patch 4: Ensure seedCatalogService always persists preview

**Priority:** P1 (prevents productsWritten=0)

**Files:**
- `apps/core/cardbey-core/src/services/orchestrator/seedCatalogService.ts`

**Change:**
```typescript
// Add validation after catalog generation:
if (catalogOutput.catalog.products.length === 0) {
  console.error('[SeedCatalog] Generated empty catalog', {
    storeId,
    generationRunId,
    jobId,
  });
  // Mark as error immediately
  await markDraftError({
    committedStoreId: storeId,
    generationRunId,
    jobId,
    err: 'Catalog generation produced 0 products',
    stage: 'seedCatalogService',
  });
  return { ok: false, error: 'Empty catalog generated' };
}

// CRITICAL: Ensure preview is persisted BEFORE returning
// (Already done at line 575-601, but add validation)
const previewUpdate = await prisma.draftStore.update({
  where: { id: targetDraft.id },
  data: {
    preview: { /* ... */ },
    status: 'ready',
  },
});

if (!previewUpdate) {
  throw new Error('Failed to persist catalog preview to DraftStore');
}
```

**Acceptance:**
- `seedCatalogService` logs if catalog is empty
- Preview is always persisted before return
- `sync-store` can always read from `DraftStore.preview`

**Risk:** Low (adds validation, doesn't change logic)

---

### Patch 5: Standardize error status to 'error' (not 'failed')

**Priority:** P1 (consistency)

**Files:**
- `apps/core/cardbey-core/src/services/draftStore/draftStoreService.js`
- All status checks/queries

**Change:**
```javascript
// BEFORE:
status: 'failed'

// AFTER:
status: 'error'  // Consistent with markDraftError helper
```

**Update queries:**
```javascript
// All queries that check status should include both for backward compat:
status: { in: ['draft', 'generating', 'ready', 'error', 'failed'] }

// Then migrate existing 'failed' → 'error':
UPDATE "DraftStore" SET status = 'error' WHERE status = 'failed';
```

**Acceptance:**
- All error states use `status='error'`
- No `status='failed'` rows in database
- UI handles both during transition period

**Risk:** Low (adds migration, updates queries)

---

## 6) Verification Checklist (fast)

### API-level checks

```bash
# 1. Check for DraftStore with status='error' but null error field
psql -d cardbey -c "SELECT id, status, error, \"updatedAt\" FROM \"DraftStore\" WHERE status = 'error' AND (error IS NULL OR error = '');"
# Expected: 0 rows

# 2. Check for DraftStore with status='error' but null updatedAt
psql -d cardbey -c "SELECT id, status, error, \"updatedAt\" FROM \"DraftStore\" WHERE status = 'error' AND \"updatedAt\" IS NULL;"
# Expected: 0 rows

# 3. Test draft endpoint returns lastError when status='error'
curl -H "Authorization: Bearer $TOKEN" "http://localhost:3001/api/stores/$STORE_ID/draft" | jq '.lastError, .lastErrorAt'
# Expected: Non-null strings

# 4. Test sync-store marks DraftStore as error when productsWritten=0
# (Manual: Trigger sync-store with empty catalog, check DraftStore.status)
```

### UI-level checks

```bash
# 1. Check for pollingStatus references (should be 0)
grep -r "pollingStatus" apps/dashboard/cardbey-marketing-dashboard/src/pages/store/StoreReviewPage.tsx
# Expected: No matches

# 2. Check for catalogOutput declaration (should be in outer scope)
grep -B 2 -A 2 "let catalogOutput" apps/core/cardbey-core/src/routes/miRoutes.js | head -10
# Expected: Declaration at line ~2130, in outer scope

# 3. Test polling stops after 5 minutes (manual)
# - Start generation
# - Wait 5 minutes
# - Check console: Should see timeout error, polling stopped

# 4. Test error UI shows lastError (manual)
# - Trigger error (empty catalog)
# - Check UI debug box: lastError and lastErrorAt should be non-null
```

### Idempotency & dedupe checks

```bash
# 1. Test request deduplication (api.ts)
# - Make 10 identical POST requests simultaneously
# - Check network tab: Should see 1 actual request, 9 return same promise

# 2. Test rate limiting (api.ts)
# - Make 25 requests in 2 seconds
# - Check console: Should see CLIENT_RATE_LIMIT error after 20 requests

# 3. Test orchestration start idempotency
# - Call POST /api/mi/orchestra/start twice with same params
# - Check response: Should return same jobId (200 OK, not 201)
```

---

## 7) Longer-term Hardening (optional)

### 7.1: Add DraftStore status transition validation

**Proposal:** Add Prisma middleware to validate status transitions

```typescript
// prisma/middleware.ts
prisma.$use(async (params, next) => {
  if (params.model === 'DraftStore' && params.action === 'update') {
    const oldDraft = await prisma.draftStore.findUnique({
      where: { id: params.args.where.id },
      select: { status: true },
    });
    
    const newStatus = params.args.data.status;
    
    // Validate transition
    if (oldDraft?.status === 'ready' && newStatus === 'generating') {
      throw new Error('Invalid transition: ready → generating');
    }
    if (oldDraft?.status === 'error' && newStatus === 'generating') {
      throw new Error('Invalid transition: error → generating (create new draft)');
    }
  }
  
  return next(params);
});
```

---

### 7.2: Add DraftStore event log table

**Proposal:** Track all status transitions for debugging

```prisma
model DraftStoreEvent {
  id            String   @id @default(cuid())
  draftStoreId  String
  eventType     String   // 'status_change', 'error_set', 'preview_updated'
  oldStatus     String?
  newStatus     String?
  error         String?
  metadata      Json?
  createdAt     DateTime @default(now())
  
  @@index([draftStoreId, createdAt])
}
```

---

### 7.3: Add health check endpoint for draft pipeline

**Proposal:** `/api/health/draft-pipeline` returns:
- Count of drafts stuck in 'generating' > 10 minutes
- Count of drafts with status='error' but null error
- Average time from 'generating' → 'ready'

---

## Summary

**Critical Issues (P0):** All fixed or have workarounds ✅

**Structural Risks (P1):** 5 identified, patches proposed

**Recommended Action:**
1. Apply Patch 1 (audit error paths) - **IMMEDIATE**
2. Apply Patch 3 (polling timeout) - **IMMEDIATE**
3. Apply Patch 4 (preview persistence) - **IMMEDIATE**
4. Apply Patch 2 (generationRunId column) - **NEXT SPRINT**
5. Apply Patch 5 (standardize status) - **NEXT SPRINT**

**Estimated Fix Time:** 4-6 hours for Patches 1, 3, 4 (immediate fixes)

