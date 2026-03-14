# Cardbey Entity Framework — Phase 2 Implementation Note

## Summary

Phase 2 makes Store, Product, and Promotion entities **behave differently** through **bodyMode** and **bodyConfig** in existing UI, without redesign or breaking flows. All changes are additive and backwards-compatible.

---

## Surfaces That Now Consume bodyConfig / bodyMode

| Surface | Entity type | bodyMode | What uses entity |
|--------|-------------|----------|-------------------|
| **MIObjectLandingPage** (QR / promo landing) | promotion | performer | Role label ("Promotion Guide"), greeting subtitle, quick-action pills from `getEntityBodyPresentation(entity)`. |
| **AmbientMIAssistant** (product card hover popover) | product | task | Role label + greeting ("Product Assistant — I can help you choose, compare, or customize this item.") when product entity is loaded; otherwise fallback "Need help with 'X'?". |
| **MIHelperPanel** (store draft review slide-in) | store | guide | Panel title "Store Assistant" when store entity is loaded and mode is global; otherwise "MI Assistant". |
| **StoreDraftReview** (store review page) | store | — | Fetches store entity when `effectiveStoreId` is set and not `'temp'`; passes `storeRoleLabel` to MIHelperPanel. |

---

## What guide / task / performer Mean in Practice

- **guide** (store): Browsing and navigation. Copy: "Store Assistant", "I can help you browse this store." Quick actions: Browse catalog, Best sellers, Today's promotion, Ask a question.
- **task** (product): Choosing, comparing, customizing. Copy: "Product Assistant", "I can help you choose, compare, or customize this item." Quick actions: Recommend similar, Customize, Buy now.
- **performer** (promotion): Offer and conversion. Copy: "Promotion Guide", "I can help you claim this offer or explore products." Quick actions: Claim offer, View products, Chat now.
- **operator**: Reserved for internal/mission/refinement; no new UI in Phase 2.

---

## Shared Helper: getEntityBodyPresentation(entity)

- **Location:** `apps/dashboard/cardbey-marketing-dashboard/src/lib/entity/entityBodyPresentation.ts`
- **Signature:** `getEntityBodyPresentation(entity) → { roleLabel, greeting, quickActions, mode }`
- **Behavior:** Reads `entity.bodyConfig.mode`, `identity.role`, `quickActions`; returns defaults per mode when missing. Safe for null/undefined.
- **Used by:** MIObjectLandingPage, AmbientMIAssistant, StoreDraftReview (via presentation.roleLabel for MIHelperPanel).

---

## Files Changed (Phase 2)

| File | Change |
|------|--------|
| `apps/dashboard/cardbey-marketing-dashboard/src/lib/entity/entityBodyPresentation.ts` | **New.** `getEntityBodyPresentation()`, defaults by bodyMode. |
| `apps/dashboard/cardbey-marketing-dashboard/src/pages/MIObjectLandingPage.tsx` | Uses presentation for role label, greeting subtitle, quick actions (performer). |
| `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/review/AmbientMIAssistant.tsx` | Fetches product entity; uses presentation for role label + greeting (task). |
| `apps/dashboard/cardbey-marketing-dashboard/src/features/mi/MIHelperPanel.tsx` | Optional `storeRoleLabel` and `productRoleLabel`; title switches by mode when provided. |
| `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx` | Fetches store entity when store id present; passes `storeRoleLabel` to MIHelperPanel. |
| `docs/ENTITY_FRAMEWORK_PHASE2_RISK_ASSESSMENT.md` | **New.** Pre-implementation risk assessment. |
| `docs/ENTITY_FRAMEWORK_PHASE2_IMPLEMENTATION.md` | **New.** This note. |

---

## What Remains for Later Phases

- Signal-driven mission suggestions from entity events.
- Content Studio “entity body builder” (edit bodyConfig / missionHooks).
- Menu/category as first-class entity types.
- Product entity presentation in MIHelperPanel when opened for product (optional `productRoleLabel` wiring from parent).
- Persist MI events; deeper chat/act wiring.

---

## Manual Verification Checklist

- [ ] **Promotion (MIObjectLandingPage):** With promo data, chat header shows "Promotion Guide", subtitle shows performer greeting; quick-action pills match entity (Claim offer, View products, Chat now). Without entity, header remains "Chat with {item.name}".
- [ ] **Product (AmbientMIAssistant):** Hover product card → popover shows "Product Assistant — I can help you choose, compare, or customize this item." when entity loads; otherwise "Need help with 'X'?".
- [ ] **Store (StoreDraftReview + MIHelperPanel):** With real store id (not temp), open MI panel (floating sparkle) → title shows "Store Assistant". With temp or no entity, title shows "MI Assistant".
- [ ] **Mission / draft / publish / guest:** Unchanged; create store → review → publish and guest flow work as before.
