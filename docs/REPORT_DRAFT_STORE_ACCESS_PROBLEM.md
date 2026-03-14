# Report on the Problem: DraftStore Access (403)

**Logged:** 2026-03-03

## Problem

DraftStore routes (GET summary, GET/PATCH `:draftId`, POST generate, POST repair-catalog) can return **403 forbidden** when the caller does not own the draft. Diagnosing why access was denied required scattered ownership checks and no consistent server-side logging.

## Report Summary

1. **What could break**
   - Orchestra consumers if `ownerUserId` is set differently.
   - Any consumer that relied on unauthenticated GET by draft id (now auth-required where protected).

2. **Why**
   - Multiple inline ownership rules; no single source of truth for “who can access this draft.”

3. **Impact scope**
   - DraftStore creation, GET summary, POST generate, GET/PATCH `:draftId`, POST repair-catalog. Mission Phase 0 error mapping (403 → ACCESS_DENIED, 404 → DRAFT_NOT_FOUND).

4. **Smallest safe patch**
   - Single helper `canAccessDraftStore(draft, { userId, isSuperAdmin })`; set `ownerUserId` on creation; use helper everywhere; dev-only log on deny.

## Where the report is used

- **Impact report (full):** [docs/IMPACT_REPORT_DRAFT_STORE_ACCESS.md](./IMPACT_REPORT_DRAFT_STORE_ACCESS.md)
- **Runtime logging (dev-only):** On 403, the server logs a diagnostic report so the problem can be traced:
  - **File:** `apps/core/cardbey-core/src/routes/draftStore.js`
  - **When:** Access denied for PATCH `/:draftId`, POST `/:draftId/repair-catalog`, POST `/:draftId/generate`, GET `/:draftId`, GET `/:draftId/summary`
  - **Payload:** `draftId`, `userId`, `tenantKey`, and `draftOwnershipFieldsForLog(draft)` (e.g. `draftOwnerUserId`, `draftTenantKey`, `storeId`, `generationRunId`)
  - **Condition:** `process.env.NODE_ENV !== 'production'` (except GET `/:draftId/summary`, which currently logs in all envs)

## Checklist (from Development Safety Rule)

- [x] What could break: documented above and in impact report.
- [x] Why: documented.
- [x] Impact scope: DraftStore + Phase 0 only.
- [x] Smallest safe patch: single helper + set ownerUserId + dev log on deny.
