# Phase 5.1: Wire validate-context (store) to real DraftStore validation — Plan

## Step 1: DraftStore read path (safest integration)

### Existing path (use as-is)
- **Client API:** `getStoreDraftByStoreId(storeId: string)` in `src/api/storeDraftGet.ts`
- **Endpoint:** GET `/api/store-draft/:storeId` (canonical path from `API.STORE_DRAFT_GET(storeId)`)
- **Auth:** `buildAuthHeader()` using getTokens() (bearer / admin / store / agent), same as rest of dashboard
- **Response:** `StoreDraftGetResponse` with `data.storeDraft` (StoreDraft), `data.status` ('queued' | 'running' | 'succeeded' | 'failed'); or error response with `error`, `message`
- **No server imports:** All client-side; Vite build unchanged

### StoreId source for validation
- **Source:** `getCanonicalContext().storeId` from `@/lib/canonicalContext.ts`
- **Semantics:** URL params > localStorage (`cardbey.ctx.storeId`). Set when user is in store creation/review flow.
- **When missing:** Validation fails with clear message: "No store context. Create or open a store first."

### Status sane rules (read-only checks)
- **Job status:** Require `data.status === 'succeeded'`. If queued/running/failed, fail with "Draft not ready (status: …)".
- **Minimal catalog:** Require `storeDraft.catalog.products.length >= 1 || storeDraft.catalog.categories.length >= 1`. Else fail with "Draft has no products or categories."
- **No business name field** in current StoreDraft type; omit that check to avoid schema drift. Optional: later add if API adds it.

### Risk (LOCKED RULE)
- **(a) What could break:** None to store creation/auth/preview if we only READ. Possible: network/404 during validation fails the step (intended).
- **(b) Why:** We do not write, commit, or change any store creation paths; we only call existing GET and branch on result.
- **(c) Mitigation:** Handler only runs for stepId `validate-context` and plan.type `store`; all other steps remain simulated. On fetch error we set execution to failed and stop.
- **(d) Rollback:** Revert stepHandlers, dagExecutor wiring, ExecutionDrawer failure UI, and tests; remove step handler call from run loop.

---

## Files to add/change (minimal)

| File | Change |
|------|--------|
| `src/app/console/missions/stepHandlers.ts` | New. `runStepHandler({ mission, stepId })`; only handle `validate-context` when plan.type === 'store'; use getCanonicalContext + getStoreDraftByStoreId; return ok + details or ok:false + errorCode/message. |
| `src/app/console/missions/dagExecutor.ts` | Before marking step completed: if step has handler, await it; if ok:false, set nodeStatus[stepId]=failed, execution.status=failed, append event, return/stop. |
| `missionStore.ts` | Optional: extend ExecutionEvent with errorCode?: string if we want it in events. |
| `ExecutionDrawer.tsx` | When execution.status === 'failed', show "Failure reason" from last event message/errorCode. |
| `stepHandlers.test.ts` | Unit tests with mocked getStoreDraftByStoreId and getCanonicalContext. |
| `dagExecutor.test.ts` | Test: handler returns ok:false → execution fails, next steps stay pending. |

---

## Manual test checklist
- Run store mission when user has storeId in context and draft exists (succeeded, has catalog) → validation step passes.
- Run store mission when no storeId in context → fails with "No store context…".
- Run store mission when storeId but 404 / draft not found → fails with reason.
- Run store mission when draft status not succeeded → fails with "Draft not ready".
- Run store mission when draft has no products and no categories → fails with "Draft has no products or categories".

## Rollback
Revert stepHandlers.ts (delete), dagExecutor.ts (remove handler call + getStoreId/fetchStoreDraft), ExecutionDrawer (remove failure section), ConsoleContext (remove getStoreId/fetchStoreDraft + imports), missionStore (remove ExecutionEvent.errorCode), stepHandlers.test.ts, dagExecutor test for handler failure. No changes to store creation, auth, or API.

---

## Implementation done

### How DraftStore is fetched
- **storeId:** `getCanonicalContext().storeId` from `src/lib/canonicalContext.ts` (URL params or localStorage `cardbey.ctx.storeId`).
- **Fetch:** `getStoreDraftByStoreId(storeId)` from `src/api/storeDraftGet.ts` — GET `/api/store-draft/:storeId`, auth via `buildAuthHeader()` (same as rest of dashboard). Response: `data.status` ('queued'|'running'|'succeeded'|'failed'), `data.storeDraft.catalog.products` / `catalog.categories`.
- **Who passes it:** `ConsoleContext` passes `getStoreId` and `fetchStoreDraft` into `runAll`; `stepHandlers` does not import API or canonicalContext (avoids test env load issues).

### Files changed/added
- **Added:** `src/app/console/missions/stepHandlers.ts` — `runStepHandler({ mission, stepId, getStoreId?, fetchStoreDraft? })`; only handles stepId `validate-context` when plan.type === 'store'; returns ok + details or ok:false + errorCode/message.
- **Added:** `src/app/console/missions/stepHandlers.test.ts` — 8 tests (no storeId, fetch error, draft not ready, insufficient catalog, has products, has categories, wrong stepId, non-store plan).
- **Modified:** `src/app/console/missions/dagExecutor.ts` — RunAllOptions getStoreId, fetchStoreDraft, runStepHandler; before marking step completed, await doRunStepHandler; on ok:false set nodeStatus[stepId]=failed, status=failed, append step_failed event, stop.
- **Modified:** `src/app/console/missions/missionStore.ts` — ExecutionEvent.errorCode optional.
- **Modified:** `src/app/console/ConsoleContext.tsx` — Pass getStoreId and fetchStoreDraft into runAll (from getCanonicalContext and getStoreDraftByStoreId).
- **Modified:** `src/app/console/ExecutionDrawer.tsx` — When status === 'failed', show "Failure reason" from last step_failed event (message + errorCode).
- **Modified:** `src/app/console/missions/dagExecutor.test.ts` — advanceTimersByTimeAsync for async callback; new test "stops and sets failed when step handler returns ok:false".
