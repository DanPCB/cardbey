# Impact Report: Orchestra DraftStore ownerUserId + input.tenantId (LOCKED RULE)

**Date:** 2026-03-03  
**Scope:** DraftStore creation paths used by orchestra/start (template + ai mode) and createBuildStoreJob. No change to who can access drafts; only ensuring created drafts have correct owner and tenant so GET /api/draft-store/:id/summary returns 200 for the creator.

## Risk assessment – widening access

**(1) Could this widen access?**  
**No.** We are only *setting* `ownerUserId` and `input.tenantId` on creation to the **acting user** (the same user who is already allowed via OrchestratorTask or context). We are not adding new users or tenants to the allow list. `canAccessDraftStore` already allows by: super_admin, draft.ownerUserId === userId, draft.input.tenantId === tenantKey, task ownership, store ownership. We are ensuring the first two are populated so the creator passes without relying on task lookup.

**(2) What could break?**  
- **Guest flows:** If we ever set `ownerUserId` to a guest id (e.g. `guest_xxx`), behavior is unchanged; guest remains owner.  
- **Callers that pass no user:** The new helper requires an authenticated user (or explicit userId/tenantKey). Call sites that today create a draft without any user would need to pass one or stay on a separate path (none identified for orchestra/start; requireAuth is on the route).

**(3) Impact scope**  
- **In scope:** `handleOrchestraStart` (miRoutes.js) and `createBuildStoreJob` (orchestraBuildStore.js). Optional: `createDraft` in draftStoreService.js when used from routes that have req.user (POST /generate already passes meta.ownerUserId).  
- **Out of scope:** Auth contracts, other routes, campaign missions.

**(4) Smallest safe patch**  
1. Add **one** helper `createDraftStoreForUser(prisma, { user, userId?, tenantKey?, input, ...data })` that sets `ownerUserId = user?.id ?? userId` and `input.tenantId = input.tenantId ?? getTenantId(user) ?? tenantKey` before create.  
2. Use this helper in **miRoutes.js** (handleOrchestraStart) and **orchestraBuildStore.js** (createBuildStoreJob) instead of raw `prisma.draftStore.create`.  
3. Add **dev-only** log + assert after creation: log createdDraftId, ownerUserId, input.tenantId; if ownerUserId missing and we had user/userId, throw in dev.

---

## Files to change

| File | Change |
|------|--------|
| `apps/core/cardbey-core/src/services/draftStore/draftStoreService.js` | Add `createDraftStoreForUser`; optional: use it from `createDraft` when meta has user. |
| `apps/core/cardbey-core/src/routes/miRoutes.js` | Replace inline `prisma.draftStore.create` with `createDraftStoreForUser(prisma, { user: req.user, userId: req.userId, input: baseInput, ... })`; add dev assert + log. |
| `apps/core/cardbey-core/src/services/draftStore/orchestraBuildStore.js` | Replace inline `prisma.draftStore.create` with `createDraftStoreForUser(prisma, { userId, tenantKey: tenantId, input, ... })`; add dev assert + log. |

No change to `canAccessDraftStore` or to any route that only *reads* drafts.

---

## Deliverables (implementation complete)

### Files changed

| File | Change |
|------|--------|
| `docs/IMPACT_REPORT_ORCHESTRA_DRAFT_OWNER_TENANT.md` | This impact report. |
| `apps/core/cardbey-core/src/services/draftStore/draftStoreService.js` | Added `createDraftStoreForUser(prismaClient, { user, userId, tenantKey, input, ...rest })`; sets `ownerUserId` and `input.tenantId`; dev-only log + assert after create. |
| `apps/core/cardbey-core/src/routes/miRoutes.js` | Replaced inline `prisma.draftStore.create` in `handleOrchestraStart` with `createDraftStoreForUser(prisma, { user: req.user, userId: req.userId, tenantKey: getTenantId(req.user) ?? finalTenantId, input: baseInput, ... })`. |
| `apps/core/cardbey-core/src/services/draftStore/orchestraBuildStore.js` | Replaced inline `prisma.draftStore.create` in `createBuildStoreJob` with `createDraftStoreForUser(prisma, { userId, tenantKey: tenantId, input, ... })`. |

### QA

1. **QuickStart Beauty (template mode):** Run Quick Start for Beauty service (template mode). Immediately `GET /api/draft-store/:draftId/summary` with same user → **200**. Non-owner → **403**.
2. **Prisma Studio verification:** Open Prisma Studio, select `DraftStore`, pick a row created by orchestra/start (template or ai). Confirm the row has `ownerUserId` and `input.tenantId` (in `input` JSON) set. Take a screenshot for the deliverable.
