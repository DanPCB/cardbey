# Impact Report: DraftStore Access Consistency (Phase 0)

**Scope:** DraftStore authorization only. Mission Phase 0 stability (summary 403 → ACCESS_DENIED; 404 → DRAFT_NOT_FOUND). No campaign missions, no auth contract changes.

## Risk assessment (LOCKED RULE)

**(1) Security / cross-tenant**
- **Risk:** Unifying checks could widen access if a new condition allowed another tenant to see a draft.
- **Mitigation:** Single helper allows access only when: (a) `draft.ownerUserId === user.id`, (b) OrchestratorTask ownership via `generationRunId`, (c) store ownership via `Business.userId` for draft’s storeId, (d) `super_admin`. No new “tenantKey on draft” rule (DraftStore has no tenantKey). No change to who is considered “owner”; we only consolidate checks and set `ownerUserId` on creation paths that currently omit it.
- **Cross-tenant:** No widening. User A can only access drafts they own (ownerUserId), or drafts linked to a job they started (task.userId), or drafts for a store they own (Business.userId). Another user still gets 403.

**(2) What could break**
- **Orchestra consumers** that rely on drafts *not* having `ownerUserId` (e.g. anonymous job runners): setting `ownerUserId` when `userId` is provided could change behavior only for those callers; if they pass `userId`, that user becomes the explicit owner (intended).
- **GET /:draftId** today is unauthenticated; adding `requireAuth` + helper would make it auth-required. If something relies on unauthenticated GET by draft id, that would break. Mitigation: mission and PhaseOutputs use GET summary and POST generate; GET :draftId is optional to protect; if needed we can add a separate public “preview by id” route later.

**(3) Impact scope**
- **DraftStore:** creation (orchestra, create-from-store), GET summary, POST generate, GET :draftId, PATCH :draftId, POST repair-catalog.
- **Mission Phase 0:** error codes only (403 → ACCESS_DENIED, 404 → DRAFT_NOT_FOUND).
- **Campaign missions:** No changes.

## Smallest safe patch

1. Add **single server-side helper** `canAccessDraftStore(draft, { userId, isSuperAdmin })` in `lib/draftOwnership.js`: allow if super_admin, or `draft.ownerUserId === userId`, or task ownership via `generationRunId`, or store ownership via draft’s storeId → `Business.userId === userId`.
2. **Set `ownerUserId` on creation** where we have the acting user: orchestra `createBuildStoreJob` (pass `userId` into create); `create-from-store` (set `ownerUserId: req.userId`).
3. **Use the helper** for GET summary, POST generate, GET :draftId (with requireAuth), PATCH, repair-catalog; remove duplicate logic.
4. **Mission:** In store Phase 0 step handler and summary fetch, map 403 → ACCESS_DENIED, 404 → DRAFT_NOT_FOUND.
5. **Dev-only:** On deny, log draftId, userId, and which ownership fields exist on draft (no secrets).

---

## Files changed

| File | Change |
|------|--------|
| `apps/core/cardbey-core/src/lib/draftOwnership.js` | Added `canAccessDraftStore(draft, { userId, isSuperAdmin })`, `draftOwnershipFieldsForLog(draft)`. |
| `apps/core/cardbey-core/src/routes/draftStore.js` | Replaced inline ownership checks with `canAccessDraftStore` on GET summary, POST generate, GET :draftId, PATCH :draftId, POST repair-catalog; added requireAuth + helper on GET :draftId; dev log on deny with `draftOwnershipFieldsForLog`. Set `ownerUserId` on create-from-store draft. |
| `apps/core/cardbey-core/src/services/draftStore/orchestraBuildStore.js` | Set `ownerUserId: userId || null` when creating draft in `createBuildStoreJob`. |
| `apps/dashboard/cardbey-marketing-dashboard/src/app/console/missions/stepHandlers.ts` | Store Phase 0: 403 → ACCESS_DENIED, 404 → DRAFT_NOT_FOUND in create-draft and generate step catch. |
| `apps/dashboard/cardbey-marketing-dashboard/src/app/console/missions/PhaseOutputs.tsx` | On store summary fetch catch, 403 → set error "Access denied to this draft." |
| `docs/IMPACT_REPORT_DRAFT_STORE_ACCESS.md` | This impact report. |
| `docs/PHASE_STORE_0_QA_CHECKLIST.md` | Added owner vs non-owner QA steps. |
