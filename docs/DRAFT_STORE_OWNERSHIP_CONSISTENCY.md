# DraftStore ownership consistency

**Rule:** **ownerUserId** = actual user id (user.id). **Tenant** = getTenantId(user) (business id or user id). Access allows **owner** match **or** **tenant** match.

## Changes

1. **miRoutes.js (handleOrchestraStart)**  
   - Set **ownerUserId: req.userId ?? null** only. Do **not** set ownerUserId to finalTenantId.  
   - Draft tenant is already stored in `draft.input.tenantId` (finalTenantId); no new column.

2. **draftOwnership.js**  
   - **canAccessDraftStore**: Allow access if `draft.ownerUserId === userId` **or** `draft.input.tenantId === tenantKey` (where tenantKey = getTenantId(user) passed in context).  
   - Keep existing checks: super_admin, OrchestratorTask (generationRunId), store (Business.userId).  
   - **draftOwnershipFieldsForLog**: Add **draftTenantKey** (from draft.input.tenantId) for deny logs.

3. **draftStore.js**  
   - Import **getTenantId** from `../lib/tenant.js`.  
   - Pass **tenantKey: getTenantId(req.user) ?? userId ?? null** into canAccessDraftStore for summary, generate, GET :draftId, PATCH, repair-catalog.  
   - Dev deny logs: **{ draftId, userId, tenantKey, draftOwnerUserId, draftTenantKey, ... }**.

## Files changed

| File | Change |
|------|--------|
| `apps/core/cardbey-core/src/routes/miRoutes.js` | ownerUserId: req.userId ?? null only (remove finalTenantId). |
| `apps/core/cardbey-core/src/lib/draftOwnership.js` | canAccessDraftStore: add tenantKey in context; allow when draft.input.tenantId === tenantKey. draftOwnershipFieldsForLog: add draftTenantKey. |
| `apps/core/cardbey-core/src/routes/draftStore.js` | Import getTenantId; pass tenantKey into canAccessDraftStore; deny logs include tenantKey and draftTenantKey. |
| `docs/PHASE_STORE_0_QA_CHECKLIST.md` | 5b: ownerUserId = user.id, tenantKey = getTenantId(user); 5b.5 deny log fields; section 8 files + rule. |

## Cross-tenant

No widening: tenant match only when `draft.input.tenantId === getTenantId(req.user)` (same tenant). Other tenants unchanged.

---

## Summary 403 debugging (explicit fields + rule log)

To diagnose GET `/api/draft-store/:draftId/summary` 403: ensure the draft load includes access fields, log the seven denial fields on every 403, and log which allow/deny rule matched (dev only).

### Files changed (this round)

| File | Change |
|------|--------|
| `apps/core/cardbey-core/src/services/draftStore/draftStoreService.js` | `getDraft`: explicit `select` including `id`, `ownerUserId`, `input`, `generationRunId`, `committedStoreId`, and all other columns so access and summary always have tenantId and ownership. |
| `apps/core/cardbey-core/src/routes/draftStore.js` | Summary 403: always log `{ draftId, userId, tenantKey, draftOwnerUserId, draftTenantKey, storeId, generationRunId }` (no NODE_ENV gate). |
| `apps/core/cardbey-core/src/lib/draftOwnership.js` | `canAccessDraftStore`: dev-only one-line log on each outcome: `ALLOW_SUPER`, `ALLOW_OWNER`, `ALLOW_TENANT`, `ALLOW_TASK`, `ALLOW_STORE`, or `DENY`. |

### Log examples

**Allow (owner):**
```text
[canAccessDraftStore] ALLOW_OWNER { draftId: 'abc-123' }
```

**Allow (tenant):**
```text
[canAccessDraftStore] ALLOW_TENANT { draftId: 'abc-123' }
```

**Deny (403):**
```text
[DraftStore] GET /:draftId/summary 403 {
  draftId: 'abc-123',
  userId: 'user-456',
  tenantKey: 'biz-789',
  draftOwnerUserId: 'user-other',
  draftTenantKey: 'biz-other',
  storeId: null,
  generationRunId: 'run-xyz'
}
```

### PhaseOutputs / critical path

For mission stability, **PhaseOutputs and store-creation flows must rely only on**  
**`GET /api/draft-store/:id/summary`** (auth, strict ownership).

- **Do not** put `/api/stores/temp/draft?generationRunId=...` or `/api/store-draft/:id` in the critical path for phase outputs.
- Summary is the single canonical endpoint for “draft ready / status / preview” after orchestra/start.
