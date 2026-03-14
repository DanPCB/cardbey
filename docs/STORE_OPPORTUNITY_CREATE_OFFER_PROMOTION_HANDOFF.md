# Store Opportunity → Create Offer → Promotion Entity Handoff

## Summary

Single Runway flow: store opportunity (no_first_offer) → create_offer intent → offer artifact → promotion entity mode active → promotion opportunities in same Mission Execution surfaces.

---

## 1. Files changed

| File | Change |
|------|--------|
| `apps/dashboard/.../src/lib/promotionHandoff.ts` | **New.** `CreateOfferResultShape`, `normalizeCreateOfferResult`, `derivePromotionEntityFromIntentResult`, `getPromotionBodyFromCreateOfferResult`. |
| `apps/dashboard/.../src/app/console/ExecutionDrawer.tsx` | CreateOfferResultLinks: add feedUrl. Artifacts: use `getPromotionBodyFromCreateOfferResult`, show "First offer created" / "First offer created: {title} ({status})." when create_offer completed. Import promotionHandoff. |

No backend code changed in this step. Backend create_offer executor should return the result shape below so handoff and artifacts work fully.

---

## 2. create_offer result shape

### Current (frontend expects)

- `intent.result` is used for:
  - **CreateOfferResultLinks:** `publicUrl`, `qrUrl`, `storeId` (for signals). `feedUrl` added.
  - **Artifacts secondary links:** `publicUrl` → "Offer page", `qrUrl` → "QR code", `feedUrl` → "Intent feed".

### Normalized shape (promotion handoff)

`CreateOfferResultShape` in `promotionHandoff.ts`:

- **Required for handoff:** `offerId`, `storeId`.
- **Optional:** `offerName` or `title`, `publicUrl`, `qrUrl`, `feedUrl`, `entityType: 'promotion'`, `source: 'create_offer'`, `description`, `isActive`, `endsAt`.

`normalizeCreateOfferResult(raw)` returns `CreateOfferResultShape | null` when `offerId` and `storeId` are present; otherwise null (e.g. backend only returns publicUrl/qrUrl).

### Backend recommendation

When the create_offer intent is run and an offer is created, persist the offer and set the intent result to include at least:

- `offerId` (created StoreOffer id)
- `storeId`
- `offerName` or `title`
- `publicUrl`, `qrUrl`, `feedUrl` when available
- Optionally `entityType: 'promotion'`, `source: 'create_offer'`

So the frontend can normalize and show "First offer created: {title}" and promotion entity mode can be derived.

---

## 3. Promotion handoff helper

**Module:** `src/lib/promotionHandoff.ts`

- **`normalizeCreateOfferResult(raw)`** — Normalizes API result to `CreateOfferResultShape | null` (requires offerId + storeId).
- **`derivePromotionEntityFromIntentResult(intentType, result)`** — For `intentType === 'create_offer'` and normalizable result, returns `PromotionEntityMode` via `buildPromotionBodyConfig` + `buildPromotionEntityMode`. Use for artifact summaries, opportunity context, mission hooks.
- **`getPromotionBodyFromCreateOfferResult(result)`** — Returns `PromotionBodyConfig | null` for display (e.g. "First offer created: {title} ({status})").

Single place for derivation; no duplication across components.

---

## 4. Artifact changes

- **Secondary links:** Already include Offer page, QR code, Intent feed from completed intents’ `result.publicUrl`, `result.qrUrl`, `result.feedUrl`. No change to link building; feedUrl added to CreateOfferResultLinks and to Artifacts link list.
- **Promotion summary:** When at least one completed create_offer intent exists:
  - If result normalizes (offerId + storeId): show *"First offer created: {title} ({status})."*
  - Else: show *"First offer created."*
- **CreateOfferResultLinks (Mission Inbox):** Now also show "Intent feed" when `result.feedUrl` is present.

---

## 5. Promotion opportunities after handoff

- **Backend:** `computeOpportunities` (GET /api/stores/:id/opportunities) already loads `allOffers` for the store and creates promotion-level opportunities (high_views_no_qr, low_conversion, expired_still_traffic) with `offerId` set.
- Once create_offer has run and the offer exists in the DB, the next opportunities fetch will include that offer and can return these promotion opportunities. No frontend change required.
- **Discovery:** Existing opportunity service and signal summary already key by storeId and offerId; the new offer is included as soon as it is stored and signals exist (or later when signals are generated).

---

## 6. Mission Inbox / display continuity

- Store opportunity: "Launch your first offer" (existing).
- Queued intent label: "Launch your first offer" (existing `getIntentLabel`).
- Completion: Offer artifact (Offer page, QR, Intent feed) + optional "First offer created" line in Artifacts.
- Next opportunities: Promotion-specific (Add QR to popular promotion, Improve promotion copy, Launch follow-up offer) from existing formatters and opportunity types; no inline label changes.

---

## 7. Guest / auth

- Guest boundary unchanged: guest sees "Launch your first offer", Fix opens auth gate, no post-draft execution, no FK errors. After sign-in, return to same mission.

---

## 8. Manual verification

- **Flow A:** Registered user, store with no offer → store opportunity "Launch your first offer" → Fix → Intent in Inbox → Run → create_offer completes.
- **Flow B:** After create_offer, Artifacts show offer outputs (Offer page, QR, Intent feed) and "First offer created" or "First offer created: {title} ({status})."
- **Flow C:** After create_offer, `derivePromotionEntityFromIntentResult('create_offer', result)` returns PromotionEntityMode when result has offerId + storeId.
- **Flow D:** With signals for the new offer, promotion opportunities appear in Growth Opportunities; Fix queues promotion intents via Single Runway.
- **Flow E:** Guest → "Launch your first offer" → auth gate; no backend FK error; after sign-in, same mission context.
- **Flow F:** Multi-store: run create_offer for store A; artifacts/opportunities reference the new offer/store A lineage only.

---

## 9. Follow-up

- **Backend:** Implement or extend create_offer execution so the intent result is updated with at least `offerId`, `storeId`, and preferably `offerName`/`title`, `publicUrl`, `qrUrl`, `feedUrl`.
- **Product entity:** When adding product-level alignment, reuse the same handoff pattern (derive entity from intent result, single helper, same Artifacts/opportunity surfaces).
