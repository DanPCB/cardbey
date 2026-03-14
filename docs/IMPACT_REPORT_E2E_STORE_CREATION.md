# Impact Report: E2E Store Creation (Locked Rule)

**Date:** 2026-03-04  
**Scope:** Store creation flow end-to-end (French Baguette test case). Campaign V2 **paused**.

---

## 1) What could break the current end-to-end workflow

| Risk | Why | Impact scope |
|------|-----|--------------|
| **Changing DraftStore status writes** | Any new or moved `DraftStore.status` or `committedStoreId` update that bypasses `transitionDraftStoreStatus` could break transition rules, WorkflowRun sync, or AuditEvent. | Draft never reaches `ready` or `committed`; publish fails or duplicates. |
| **Changing publish endpoint contract** | `POST /api/store/publish` body (`storeId`, `generationRunId`) or response shape is relied on by the dashboard. Changing it breaks StoreDraftReview publish flow. | Publish button fails or shows wrong success state. |
| **Frontscreen reading draft** | If frontscreen or storefront API is changed to read from `DraftStore` or draft-only fields for “published” stores, published store list becomes wrong or draft-dependent. | Step 5 fails; frontscreen shows draft data or missing stores. |
| **Auth middleware order or scope** | Adding or reordering middleware on `/api/store/publish`, `/api/draft-store`, or `/api/mi/orchestra/start` can block valid auth or allow unauthorized access. | 401/403 for valid users; or unauthorized publish/edit. |
| **Idempotency removed** | If `publishDraft` is changed to always create a new Business when draft is already `committed`, duplicate stores or tasks appear. | Step 4 fails; duplicate stores on double-click. |
| **Category or preview shape change** | Changing `preview.categories` / `preview.items` shape or normalization without updating dashboard and publish path breaks preview and publish. | Steps 3 and 4; wrong categories or products. |

---

## 2) Invariants and how we avoid breakage

- **State-machine:** All DraftStore status updates go through `transitionDraftStoreStatus` in `kernel/transitions/transitionService.js`. We will not add direct `prisma.draftStore.update({ status: ... })` for status/committedStoreId.
- **AuditEvent:** Transition service already creates AuditEvent on status transitions. We will not remove or bypass it; any new transition path will use the same service.
- **Publish idempotency:** `publishDraftService.js` already returns existing store when `targetDraft.status === 'committed'` and `committedStoreId` is set. We will not remove this branch.
- **Frontscreen separation:** We will not change frontscreen/storefront API to source “published” store list from draft-only data. Any fix will keep published store read from Business/published snapshot.
- **Auth:** We will not relax `requireAuth` on publish or draft-store routes; we will not reorder middleware in a way that runs optionalAuth before requireAuth on sensitive routes.
- **Minimal diff:** Only additive changes (new contract doc, new script, new health/debug endpoint or doc). No broad refactors of draft store creation or publish pipeline unless a concrete bug is found and fixed with a minimal patch.

---

## 3) Smallest safe approach

1. **Add E2E contract and runner (additive)**  
   - Add `docs/E2E_STORE_CREATION_CONTRACT.md` (steps 1–6, invariants, DoD).  
   - Add `scripts/e2e-french-baguette.js` (or equivalent) as smoke runner calling existing APIs (orchestra/start, draft fetch, store publish if available).  
   - Add `pnpm run e2e:french-baguette` in core; no change to existing handlers.

2. **Health snapshot (additive)**  
   - Add a dev-only endpoint or doc that returns: DraftStore status, published status/version, last N AuditEvents, last task/error.  
   - Implement as GET under `/api/debug/` or `/api/internal/` so existing routes are unchanged.

3. **Fixes only where proven broken**  
   - If a specific step (1–6) fails in manual run, fix with a **local, minimal patch** (single responsibility, no refactor of unrelated code).  
   - Do not change orchestra start, draft-store PATCH, or store publish contract unless necessary for a listed invariant.

---

## 4) Checklist before any code change

- [ ] Does this change any DraftStore status write? If yes, does it go through `transitionDraftStoreStatus`?
- [ ] Does this change publish request/response or idempotency? If yes, report and minimal patch only.
- [ ] Does this change what frontscreen reads for “published” stores? If yes, ensure it remains published-only.
- [ ] Is this additive (new file, new route, new script) or a minimal one-file fix? If not, stop and report.
