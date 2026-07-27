# Hybrid Routing Dashboard UI — Impact Report

**Updated:** 2026-06-12 (publish path unification)

## Publish path unification (completed)

All UI publish actions for `publish_store` and `publish_cardbey` now route through **hybridRouter** via:

```
Dashboard → executeUiAction → ui-action → uiHybridPublishBridge → hybridRouter → handlePublishStore
```

- **Publish Now** uses hybrid direct path (`confirmed: true`, `_executeAfterReview: true`)
- **Review with AI** uses agent path (`_preferAgent: true`), then confirmed execute
- Audit events written to `AuditEvent` table via `hybridAudit.js`

Dual REST vs ui-action split for Cardbey publish is **eliminated** in `PublishModal`, `StorePublishButton`, and `WebsitePublishButton`.

---


## What changed (dashboard)

| Area | Change |
|------|--------|
| Delete | `confirmedDelete()` sends `{ confirmed: true }` on DELETE body |
| Delete UX | Reusable `DeleteConfirmationModal` on store/content delete surfaces |
| Publish UX | `AIPublishReviewModal` + "Review with AI" on website publish (`PublishModal`) |
| Helpers | `lib/hybridRouting/hybridApi.ts`, `confirmedDelete`, `apiDELETEWithBody` |
| Components | `StorePublishButton`, `DraftPublishButton`, `WebsitePublishButton` (reusable) |
| Runtime client | `executeUiRuntimeAction({ hybrid: { preferAgent, confirmed, executeAfterReview } })` merges flags into payload |

---

## Performer runway impact

### Low risk — unchanged execution path

Most Performer-driven publishes still use:

```
Dashboard → executeUiRuntimeAction → POST /api/performer/runtime/ui-action
       → uiRuntimeActionService.runUiActionAdapter → publishDraft / publish snapshot handlers
```

This path **bypasses** `hybridRouter.route()` and **does not** require `_preferAgent` or `confirmed` today.

**Affected surfaces (unchanged behavior for direct publish):**

- `StoreDraftReview.tsx` — `publishFromSnapshot` / `publishStore` via ui-action
- `PublishModal.tsx` — "Publish on Cardbey" still uses ui-action (regression-safe)
- Performer capability CTAs that dispatch `publish_store` through runtime

### Medium risk — dual publish paths

Two publish paths now coexist:

| Path | Hybrid router | AI review UI |
|------|---------------|--------------|
| ui-action (`publish_cardbey`, `publish_store`) | No | Not wired |
| Direct REST (`/api/mini-website/publish/cardbey`, `/api/store/publish`, `/api/draft-store/:id/publish`) | Yes | Wired in new buttons + PublishModal AI flow |

**Impact:** Users clicking "Review with AI" in `PublishModal` hit the **direct hybrid endpoint**, while "Publish on Cardbey" still uses **ui-action**. Both should produce the same published artifact, but authority/audit trails differ (`source: publish_modal` vs hybrid router logs).

**Recommendation (follow-up):** Either forward hybrid flags from ui-action into wrapped REST handlers, or migrate all publish buttons to direct hybrid endpoints for one consistent path.

### Phase F draft-store runway guard

`POST /api/draft-store/:draftId/publish` still runs `guardPhaseFDraftStoreRunway` **before** hybrid review. AI review on draft publish can return 403 if runway guard blocks — same as direct publish. No new guard was added.

---

## Delete impact

### Breaking fix (required)

DELETE without `confirmed: true` now returns **428** on:

- `DELETE /api/stores/:storeId`
- `DELETE /api/contents/:id`

**Dashboard call sites updated:**

- `AccountUserMenu.tsx`
- `OverviewPage.tsx` (business builder danger zone)
- `createdItemActions.ts` (store delete)
- `contents.ts` / `DesignLibrary.tsx` (content delete)

**Not hybrid-wrapped (unchanged):** `/docs/:id`, products, campaigns, suitcase items — still delete without confirmation body.

### Other clients

Any non-dashboard client (scripts, mobile, tests) calling wrapped DELETE endpoints without `confirmed: true` will fail with 428 until updated.

---

## Other paths reviewed

| Path | Hybrid? | Dashboard update |
|------|---------|------------------|
| Performer intake / missions | No | None |
| Safe execution governance (campaigns, promos) | No | None |
| Content studio render (`render_creative_asset`) | No | None |
| Signage publish | No | None |
| Ghost store / claim flows | No | None |
| Created items archive (`/docs/:id` DELETE) | No | None — only store/content wrapped deletes fixed |

---

## Regression checklist

- [x] Direct publish without AI review still works (`PublishModal` → ui-action)
- [x] Delete shows modal and sends `confirmed: true`
- [x] AI review shows suggestions modal; user can cancel or publish anyway
- [ ] StoreDraftReview publish button — still direct/runtime only (no AI review button yet; use `DraftPublishButton` / `StorePublishButton` when wiring)
- [ ] ui-action hybrid flags — forwarded in payload only; **backend does not consume them yet**

---

## Smallest safe follow-ups

1. **Unify publish path:** Route ui-action publish adapters through hybrid router or migrate all UI publish to direct endpoints.
2. **StoreDraftReview:** Add optional `DraftPublishButton` next to existing publish CTA when snapshot v1 is enabled.
3. **CreatedItemActionMenu:** Replace `window.confirm` with `DeleteConfirmationModal` for store/content deletes (confirmation body already fixed for stores via `confirmedDelete`).
4. **Backend:** Teach `uiRuntimeActionService` to honor `_preferAgent` on publish actions for Performer parity.

---

## Test coverage added

- `DeleteConfirmationModal.test.tsx` — confirm/cancel callbacks
- `hybridRoutingUi.test.tsx` — delete modal copy + AI review modal surfacing

Run:

```bash
cd apps/dashboard/cardbey-marketing-dashboard
npm test -- src/__tests__/components/DeleteConfirmationModal.test.tsx src/__tests__/components/hybridRoutingUi.test.tsx
```
