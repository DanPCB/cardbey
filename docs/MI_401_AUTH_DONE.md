# MI Real Mode 401 Auth Diagnostics — DONE Report

## Goal

When real executor gets **401** on `GET /api/auth/me`, the MI panel shows a clear message ("Not signed in. Please sign in to run MI actions.") instead of generic "Failed." and uses the **same auth** as the rest of the dashboard (Bearer + credentials).

## File-by-file changes (why safe)

| File | Change | Why safe |
|------|--------|----------|
| **src/lib/api.ts** | Exported `buildAuthHeader` (was already used internally). | No behavior change; only export. MI executor can reuse same header builder. |
| **src/lib/mi/miHttp.ts** | Import `buildAuthHeader`; `miGet`/`miPatch` send same auth (Bearer for `/api/auth/me` via `forAuthRoute: true`, else full token set). `credentials: 'include'` kept. | Aligns MI preflight with rest of app; no new endpoints or storage keys. |
| **src/lib/mi/miExecutor.ts** | Replaced raw 401/403/404/network messages with user-facing constants: `MSG_NOT_SIGNED_IN`, `MSG_FORBIDDEN`, `MSG_DRAFT_NOT_FOUND`, `MSG_NETWORK_ERROR`. Catch block maps `Failed to fetch` → network message. | Same flow and status codes; only message strings changed. `httpStatus` still set for debug. |
| **src/features/mi/MIHelperPanel.tsx** | Non-debug failed status: show `Failed: ${lastResult.message}` when present instead of only "Failed." | UI-only; existing test ids and debug behavior unchanged. |
| **tests/MIUnifiedHelper.test.tsx** | (1) Step 7 401 test: expect "Not signed in" in store message and in `mi-exec-status`; assert no PATCH, no POST, no /run or /publish. (2) Step 8 PATCH 403: expect message to match /Forbidden\|403\|PATCH failed/i. | Tests only; mocks unchanged except expectations. |
| **docs/MI_UNIFIED_HELPER.md** | Added subsection "If you see Failed and DevTools shows GET /api/auth/me → 401" (meaning, UI message, how to fix, auth alignment). | Documentation only. |

**No backend or spine changes.** No new endpoints, no new polling/intervals. No changes to automation spine contracts.

## Test command and expected result

From dashboard app root:

```bash
cd apps/dashboard/cardbey-marketing-dashboard
npx vitest run tests/miHelperStore.test.ts tests/miExecutorMode.test.ts tests/miExecutorWriteGate.test.ts tests/miTagsPatch.test.ts tests/miRewritePatch.test.ts tests/MIUnifiedHelper.test.tsx
```

**Expected:** All tests pass (e.g. 79 tests in 6 files). Key regression test: **Step 7: real mode + 401** — UI shows "Not signed in", no PATCH, no POST, no /run or publish.

## Rollback plan

Revert these files in one commit (order not critical):

1. `apps/dashboard/cardbey-marketing-dashboard/src/lib/api.ts` — remove `export` from `buildAuthHeader`.
2. `apps/dashboard/cardbey-marketing-dashboard/src/lib/mi/miHttp.ts` — remove `buildAuthHeader` import and `getMiRequestHeaders`; restore plain `fetch(..., { credentials: 'include' })` for GET/PATCH.
3. `apps/dashboard/cardbey-marketing-dashboard/src/lib/mi/miExecutor.ts` — restore original 401/403/404/network message strings and catch message.
4. `apps/dashboard/cardbey-marketing-dashboard/src/features/mi/MIHelperPanel.tsx` — restore `{executionStatus === 'failed' && 'Failed.'}`.
5. `apps/dashboard/cardbey-marketing-dashboard/tests/MIUnifiedHelper.test.tsx` — revert Step 7 401 test to previous assertion; revert Step 8 403 message expectation to `/403|PATCH failed/i`.
6. `docs/MI_UNIFIED_HELPER.md` — remove the "If you see Failed and DevTools shows GET /api/auth/me → 401" subsection.
7. `docs/MI_401_AUTH_DONE.md` — delete (this file).

After rollback, real mode will again use only cookies for MI requests and show the old generic "Failed." and technical messages.
