# Draft Review Page Fix Summary

**Date:** 2025-01-XX  
**Issue:** Store Draft Review page stuck on "Generating products & categories...", excessive polling, repeated sync-store calls, client RATE_LIMIT, backend log-spam, TDZ regressions

---

## Changes Made

### 1. Backend: Fixed tenantId TDZ in Orchestra Start Idempotency Check

**File:** `apps/core/cardbey-core/src/routes/miRoutes.js`

**Problem:** `tenantId` was accessed at line 764 (in idempotency check) before it was declared at line 920, causing TDZ error.

**Fix:**
- Moved `tenantId` and `userId` declaration to BEFORE idempotency check (line 756-760)
- Added validation check immediately after declaration
- Removed duplicate validation later in code

**Code Change:**
```javascript
// BEFORE (broken):
// Line 756: Build runKey
// Line 760: IDEMPOTENCY check uses tenantId (TDZ error!)
// ...
// Line 920: const tenantId = req.userId.trim(); // Too late!

// AFTER (fixed):
// Line 756: Validate and declare tenantId/userId FIRST
const tenantId = req.userId.trim();
const userId = req.userId.trim();
// Line 760: IDEMPOTENCY check (now safe)
```

---

### 2. Backend: Fixed Prisma select `profileName` Error

**File:** `apps/core/cardbey-core/src/mi/contentBrain/storeIntent.ts`

**Problem:** Prisma query selected `profileName` field which doesn't exist in Business schema, causing `PrismaClientValidationError`.

**Fix:**
- Removed `profileName: true` from Prisma select
- Added `tagline` and `heroText` as fallback fields
- Post-process to set `profileName: dbStore.name || undefined` (backward compatibility)

**Code Change:**
```typescript
// BEFORE:
select: {
  type: true,
  name: true,
  profileName: true, // ❌ Field doesn't exist
  description: true,
}

// AFTER:
select: {
  type: true,
  name: true,
  // profileName removed - doesn't exist in schema
  description: true,
  tagline: true, // Fallback
  heroText: true, // Fallback
}
// Post-process: profileName: dbStore.name || undefined
```

---

### 3. Frontend: Fixed Draft Polling with Single-Flight, Terminal States, Exponential Backoff

**File:** `apps/dashboard/cardbey-marketing-dashboard/src/pages/store/StoreReviewPage.tsx`

**Changes:**

#### A. Single-Flight Request Guard
- Added `draftFetchInFlightRef` to prevent duplicate draft fetches
- Skip poll tick if previous fetch still in-flight

#### B. Terminal State Stop Condition
- Poll only if `draft.status NOT in ['ready','error']`
- Normalize `'failed'` → `'error'` on client (defensive, server also normalizes)
- Stop polling when `status === 'ready'` OR `status === 'error'`

#### C. Exponential Backoff on Rate-Limit
- Detect rate-limit errors: `CLIENT_RATE_LIMIT`, `code === 'RATE_LIMIT'`, `status === 429`
- Exponential backoff: 500ms → 1000ms → 2000ms → 4000ms (cap 8000ms)
- Reset backoff on successful request
- Dev log: `[DRAFT_POLL] rate-limited, backing off Xms`

#### D. Consolidated Logging
- Added `previousDraftStateRef` to track state changes
- Log `[DRAFT_STATE]` only when values change (status, productsCount, categoriesCount, lookupMode, generationRunId)

**Code Changes:**
```typescript
// Added refs:
const draftFetchInFlightRef = useRef<boolean>(false);
const backoffMsRef = useRef<number>(0);
const previousDraftStateRef = useRef<{...} | null>(null);

// Single-flight guard:
if (draftFetchInFlightRef.current) return;

// Exponential backoff:
if (backoffMsRef.current > 0) {
  await new Promise(resolve => setTimeout(resolve, backoffMsRef.current));
}

// Rate-limit handling:
if (err?.message?.includes('CLIENT_RATE_LIMIT') || err?.code === 'RATE_LIMIT' || err?.status === 429) {
  backoffMsRef.current = Math.min(backoffMsRef.current === 0 ? 500 : backoffMsRef.current * 2, 8000);
  return; // Skip this poll tick
}
```

---

### 4. Frontend: Fixed Sync-Store Repeated Calls (Idempotent Client Behavior)

**File:** `apps/dashboard/cardbey-marketing-dashboard/src/pages/store/StoreReviewPage.tsx`

**Changes:**
- Added `syncAttemptedRef` (Set) to track sync-store attempts per `generationRunId`
- Added `shouldAttemptSyncStore()` helper function:
  - Returns `true` only if:
    - `draft` exists
    - `draft.status` in `['generating','draft']` OR (`productsCount === 0` and status not `'ready'`)
    - `syncAttempted[generationRunId]` is `false`
    - `jobId` exists
- After calling sync-store (success or failure), mark `syncAttempted[generationRunId] = true`
- If sync-store succeeds, refetch draft ONCE after 400ms delay (not rapid loops)

**Code Changes:**
```typescript
// Added ref:
const syncAttemptedRef = useRef<Set<string>>(new Set());

// Helper function:
const shouldAttemptSyncStore = useCallback((draft, generationRunId, jobId) => {
  if (!draft || !jobId || !generationRunId) return false;
  let status = draft.meta?.status;
  if (status === 'failed') status = 'error';
  const canSync = (status === 'generating' || status === 'draft' || 
                   (draft.catalog?.products?.length === 0 && status !== 'ready'));
  const notAttempted = !syncAttemptedRef.current.has(generationRunId);
  return canSync && notAttempted;
}, []);

// Usage in poll callback:
if (urlJobId && generationRunId && shouldAttemptSyncStore(normalizedDraft, generationRunId, urlJobId)) {
  syncAttemptedRef.current.add(generationRunId);
  // Call sync-store asynchronously...
}
```

---

### 5. Frontend: Fixed Stuck Spinner UI Logic

**File:** `apps/dashboard/cardbey-marketing-dashboard/src/pages/store/StoreReviewPage.tsx`

**Changes:**
- UI derives "loading" from:
  - `first load pending AND no draft data yet` → Show spinner
  - `OR draft.status in ['draft','generating'] while polling` → Show "Generating..." UI
- Once `draft.status === 'ready'` and `productsCount > 0` → Render immediately (no spinner)
- If job finished but draft ready → Never show spinner
- Normalize `'failed'` → `'error'` in UI logic

**Code Changes:**
```typescript
// Compute loading state:
const isInitialLoad = loading && !draft;
let normalizedStatus = draftStatus || draft?.meta?.status;
if (normalizedStatus === 'failed') {
  normalizedStatus = 'error'; // Normalize legacy 'failed' to 'error'
}
const isDraftGenerating = normalizedStatus === 'generating' || normalizedStatus === 'draft';
const isDraftReady = normalizedStatus === 'ready' && (draft?.catalog?.products?.length || 0) > 0;
const shouldShowSpinner = isInitialLoad || (isDraftGenerating && !isDraftReady);

// Render logic:
if (shouldShowSpinner && !draft) {
  return <Loader2 />; // Initial load spinner
}

if (isDraftReady && draft) {
  return <StoreDraftReview storeDraft={draft} />; // Render immediately
}
```

---

### 6. ProductSuggestions: Already Fixed (No Polling on Review Page)

**File:** `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/review/ProductSuggestions.tsx`

**Status:** Already implemented correctly:
- Fetches ONCE on mount
- 10-second cooldown before refetch
- In-flight guard prevents concurrent fetches
- Rate-limit handling with local fallback

**No changes needed.**

---

## Verification Checklist

### 1. Backend TDZ Fix
- [ ] Start store generation from UI
- [ ] Check backend logs: No `[ORCH_START][IDEMPOTENCY_CHECK_FAILED] Cannot access 'tenantId' before initialization`
- [ ] Verify idempotency check works correctly

### 2. Backend Prisma Fix
- [ ] Start store generation from UI
- [ ] Check backend logs: No `PrismaClientValidationError Unknown field 'profileName'`
- [ ] Verify store intent inference works correctly

### 3. Frontend Polling Fix
- [ ] Start store generation from UI
- [ ] Check Network tab: Draft fetch frequency <= 1/sec (preferably slower)
- [ ] Check console: No `[API][RATE_LIMIT]` spam
- [ ] Check console: `[DRAFT_STATE]` logs appear only when state changes
- [ ] Verify exponential backoff works (if rate-limited, see `[DRAFT_POLL] rate-limited, backing off Xms`)

### 4. Sync-Store Idempotency
- [ ] Start store generation from UI
- [ ] Check Network tab: `sync-store` called at most ONCE per `generationRunId`
- [ ] Verify sync-store is called only when draft is ready/generating (not when `draftFound=false`)

### 5. Stuck Spinner Fix
- [ ] Start store generation from UI
- [ ] Verify: When backend draft status becomes `'ready'`, UI transitions immediately to showing products (no stuck spinner)
- [ ] Verify: If job finished but draft ready, never show spinner
- [ ] Verify: "Generating products & categories..." UI shows only when `draft.status === 'generating'`

### 6. Terminal States
- [ ] Start store generation from UI
- [ ] Verify: When `draft.status === 'error'`, polling stops and error UI shows
- [ ] Verify: When `draft.status === 'ready'`, polling stops and products render

---

## Files Changed

1. **`apps/core/cardbey-core/src/routes/miRoutes.js`**
   - Fixed tenantId TDZ in idempotency check

2. **`apps/core/cardbey-core/src/mi/contentBrain/storeIntent.ts`**
   - Fixed Prisma select `profileName` error

3. **`apps/dashboard/cardbey-marketing-dashboard/src/pages/store/StoreReviewPage.tsx`**
   - Added single-flight request guard
   - Added exponential backoff for rate limits
   - Added sync-store idempotency tracking
   - Fixed stuck spinner UI logic
   - Added consolidated logging
   - Normalized `'failed'` → `'error'` on client

---

## Summary

**Root Causes:**
1. TDZ error: `tenantId` accessed before declaration
2. Prisma schema mismatch: `profileName` field doesn't exist
3. Excessive polling: No single-flight guard, no exponential backoff
4. Repeated sync-store calls: No idempotency tracking
5. Stuck spinner: UI logic didn't handle `'ready'` state correctly

**Fixes:**
1. Moved `tenantId` declaration before usage
2. Removed `profileName` from Prisma select, use `name` as fallback
3. Added single-flight guard, exponential backoff, terminal state checks
4. Added sync-store idempotency tracking per `generationRunId`
5. Fixed UI logic to render immediately when `draft.status === 'ready'` and `productsCount > 0`

**Risk:** Low (minimal changes, focused fixes, backward compatible)

**Testing:** Manual verification checklist provided above

