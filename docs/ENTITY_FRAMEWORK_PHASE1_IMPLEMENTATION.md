# Cardbey Entity Framework — Phase 1 Implementation Note

## Summary

Phase 1 adds a **minimal formal entity contract** and **core MI endpoints** so Store, Product, and Promotion can be represented as Cardbey entities without breaking existing flows. All changes are additive and backwards-compatible.

---

## Where CardbeyEntity Lives

- **Type and contract:** `apps/core/cardbey-core/src/entity/cardbeyEntity.ts`
  - Exports: `CardbeyEntity`, `CardbeyEntityType`, and related config interfaces (`CardbeyEntityBodyConfig`, `CardbeyEntitySurfaceConfig`, `CardbeyEntitySignalConfig`, `CardbeyEntityMissionHooks`).
- **Builders:** `apps/core/cardbey-core/src/entity/entityBuilders.ts`
  - Exports: `buildStoreEntity(store)`, `buildProductEntity(product, storeId?)`, `buildPromotionEntity(promo)`.
  - Each builder returns a `CardbeyEntity` with required fields and safe defaults.

---

## Entity Types Supported in Phase 1

| entityType | objectId meaning   | Resolved from DB        |
|------------|--------------------|--------------------------|
| `store`    | Business (store) id | `prisma.business`        |
| `product`  | Product id          | `prisma.product`         |
| `promotion`| StorePromo id      | `prisma.storePromo`      |

---

## New Endpoint

### GET /api/mi/entity/:entityType/:objectId

- **Auth:** `optionalAuth` (so public landing can call it).
- **Params:** `entityType` ∈ `{ store, product, promotion }`, `objectId` = primary key of the record.
- **Response:** `{ ok: true, entity: CardbeyEntity }`.
- **Errors:** 404 for unsupported type or missing object; 500 on server error.
- **Read-only:** No mutations.

---

## MI Endpoints: Confirmed vs Added

| Endpoint            | Status    | Location / notes |
|---------------------|-----------|-------------------|
| POST /api/mi/chat   | **Added** | `miRoutes.js`. Accepts `objectId`, `messages`, `context`. Returns `{ ok: true, reply: { role: 'assistant', content } }` (Phase 1 placeholder). |
| POST /api/mi/event  | **Added** | `miRoutes.js`. Accepts `objectId`, `kind`. Returns `{ ok: true }`. No persistence yet. |
| POST /api/mi/act    | **Added** | `miRoutes.js`. Accepts `objectId`, `action`. Returns `{ ok: true, result: { type: 'accepted', message } }`. Thin handler. |

These were **not** present in `miRoutes.js` before Phase 1; the frontend already called them (and may have received 404). They are now implemented with minimal, safe behavior.

---

## Proof Consumer

- **Surface:** `apps/dashboard/cardbey-marketing-dashboard/src/pages/MIObjectLandingPage.tsx`
- **Behavior:** When the page has promo data (`data.promo`), it fetches `GET /api/mi/entity/promotion/${data.promo.id}`. If the entity is returned, it uses `entity.bodyConfig.quickActions` to render up to three small pill labels below the CTA. No existing behavior is removed or redesigned.

---

## What Remains for Phase 2

- Store entity mode in MI helper store (dashboard).
- Align product entity with contract in existing product MI flows.
- Promotion entity mode and/or deeper chat/event/act wiring.
- Optional: persist MI events, wire chat to assistant/orchestra, expand act handlers.
- Optional: Content Studio “entity body builder” (bodyConfig / missionHooks).

---

## Files Changed (Phase 1)

| File | Change |
|------|--------|
| `apps/core/cardbey-core/src/entity/cardbeyEntity.ts` | **New.** CardbeyEntity type and config interfaces. |
| `apps/core/cardbey-core/src/entity/entityBuilders.ts` | **New.** buildStoreEntity, buildProductEntity, buildPromotionEntity. |
| `apps/core/cardbey-core/src/routes/miRoutes.js` | **Added:** GET /entity/:entityType/:objectId, POST /chat, POST /event, POST /act. |
| `apps/dashboard/cardbey-marketing-dashboard/src/pages/MIObjectLandingPage.tsx` | **Added:** promotion entity fetch and optional quick-action pills from entity contract. |
| `docs/ENTITY_FRAMEWORK_PHASE1_RISK_ASSESSMENT.md` | **New.** Pre-implementation risk assessment. |
| `docs/ENTITY_FRAMEWORK_PHASE1_IMPLEMENTATION.md` | **New.** This implementation note. |

---

## Manual Verification Checklist

- [ ] **GET /api/mi/entity/store/:storeId** with a valid Business id returns `{ ok: true, entity }` with entityType `store` and bodyConfig.quickActions.
- [ ] **GET /api/mi/entity/product/:productId** with a valid Product id returns `{ ok: true, entity }` with entityType `product`.
- [ ] **GET /api/mi/entity/promotion/:promoId** with a valid StorePromo id returns `{ ok: true, entity }` with entityType `promotion`.
- [ ] **GET /api/mi/entity/store/invalid** returns 404.
- [ ] **POST /api/mi/chat** with `{ objectId: 'x', messages: [{ role: 'user', content: 'Hi' }] }` returns 200 and `reply.content` string.
- [ ] **POST /api/mi/event** with `{ objectId: 'x', kind: 'view' }` returns 200 and `{ ok: true }`.
- [ ] **POST /api/mi/act** with `{ objectId: 'x', action: { type: 'claim' } }` returns 200 and `result.type === 'accepted'`.
- [ ] **MIObjectLandingPage** with a promo (e.g. QR landing with promo): optional quick-action pills appear when entity load succeeds; page still works when entity 404s.
- [ ] **Mission / draft / publish flow** unchanged: create store → review draft → publish still works; guest flow unchanged.
