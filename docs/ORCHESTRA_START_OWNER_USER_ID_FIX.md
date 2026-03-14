# Orchestra/start ownerUserId Fix

**Problem:** Store Mission Phase 0 (and Quick Start flows using orchestra/start) hit 403 "Access denied to this draft" because drafts created in **POST /api/mi/orchestra/start** were created with `prisma.draftStore.create` **without** `ownerUserId`. Only the OrchestratorTask had `userId`; the draft did not.

**Root cause:** In `handleOrchestraStart` (miRoutes.js), the draft is created inline with `prisma.draftStore.create` and did not set `ownerUserId`. The `createBuildStoreJob` in orchestraBuildStore.js was already updated to set `ownerUserId`, but orchestra/start does **not** call `createBuildStoreJob`; it creates the task and draft separately.

**Fix:** Set `ownerUserId: req.userId ?? finalTenantId ?? null` when creating the draft in `handleOrchestraStart`.

---

## Files changed

| File | Change |
|------|--------|
| `apps/core/cardbey-core/src/routes/miRoutes.js` | In handleOrchestraStart, when creating draft with `prisma.draftStore.create`, add `ownerUserId: req.userId ?? finalTenantId ?? null`. |
| `apps/core/cardbey-core/src/lib/draftOwnership.js` | `draftOwnershipFieldsForLog(draft)` now returns `{ draftOwnerUserId, draftStoreId, generationRunId, storeId }` (actual values for dev denial logs). |
| `docs/PHASE_STORE_0_QA_CHECKLIST.md` | Step 5b.5: denial log fields updated; section 5d: Orchestra/start and ownerUserId QA; section 8: files list. |

---

## Dev denial logging

When `canAccessDraftStore` denies, non-production logs now include:

`{ draftId, userId, draftOwnerUserId, draftStoreId, generationRunId, storeId }`

(No secrets; IDs only.)

---

## Old drafts (ownerUserId null)

Drafts created **before** this fix may have `ownerUserId = null`. They remain accessible if:

- **OrchestratorTask** exists with matching `generationRunId` and `task.userId === req.userId`, or  
- **Store ownership:** draft’s storeId → Business.userId === req.userId.

To backfill `ownerUserId` for old drafts (optional, one-time): for each DraftStore where `ownerUserId` is null and `generationRunId` is set, find the OrchestratorTask with that `generationRunId` and set `draft.ownerUserId = task.userId`. Run with care and only if safe for your data (e.g. limit to recent drafts, dry-run first).
