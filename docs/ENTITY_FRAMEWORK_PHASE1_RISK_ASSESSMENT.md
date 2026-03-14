# Phase 1 Entity Framework — Risk Assessment (Pre-Implementation)

## Scope
Additive only: shared CardbeyEntity type, entity builders, GET /api/mi/entity/:entityType/:objectId, POST /api/mi/chat, /event, /act, one proof consumer (promotion), and documentation.

## Risks Considered

| Risk | Assessment | Mitigation |
|------|------------|------------|
| **Mission / draft / publish flow** | No changes to orchestra start, draft fetch, draft PATCH, publish, or job run. No state ownership moved. | No new code in orchestraBuildStore, draftStoreService, publishDraftService, or StoreDraftReview publish path. |
| **Guest mission / draft** | Entity endpoint and new MI routes do not touch guest draft creation or temp draft resolution. | No changes to handleOrchestraStart guest branch, createDraft, or GET /api/mi/stores/temp/draft. |
| **Existing store/product/promo APIs** | Not replaced or modified. New route is GET /api/mi/entity/* only. | No changes to stores.js, products, promos, or storefront routes. |
| **Auth** | Entity read and MI chat/event/act: optionalAuth or no auth for public-facing chat; entity read can be optionalAuth. | Use optionalAuth for GET entity so landing page can call it; chat/event/act no auth for parity with current frontend (or optionalAuth if desired). |
| **DB schema** | No new tables or migrations. Builders derive from existing Business, Product, StorePromo. | Read-only Prisma findUnique; no writes. |
| **Frontend 404s** | Frontend already calls /api/mi/chat, /event, /act; they may 404 today. Adding handlers fixes 404s. | Minimal handlers that return safe JSON; no change to frontend call sites. |
| **Proof consumer** | One promotion surface (e.g. MIObjectLandingPage) fetches entity and uses it non-destructively. | Only add one useEffect to fetch entity when promo exists; use result for defaults or display only; no removal of existing behavior. |

## Conclusion
Proceeding with Phase 1 is **low risk**. All changes are additive and do not alter mission, draft, or publish flows.
