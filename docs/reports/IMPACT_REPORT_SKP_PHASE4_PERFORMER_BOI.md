# Impact Report — Phase 4 BOI mount + Performer → SKP

Date: 2026-08-25  
Depends on: Phase 1–3 (SKP, prerender, attribution flags)

## Change summary

1. Mount existing `businessOperationIntelligenceRoutes` at `/api/public/business-operation` (documented prefix; never mounted).
2. Enrich Performer store context via `loadPerformerStoreContext` using `buildSKP` / `skpToPublicDto` (canonical knowledge; no parallel store DTO).
3. Optionally attach Mission 001 insights into SKP when already available — minimal; do not rewrite mission pipeline.

## (1) What could break

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| BOI public routes expose new surface | Medium | Existing route auth/gates (`ENABLE_BUSINESS_OPERATION_INTELLIGENCE_V1`); fail-closed when disabled |
| Performer turns slower (extra SKP query) | Low | SKP reuses same Business + artifact load; keep thin fields if SKP null |
| Performer prompt shape change | Medium | Additive fields (`canonicalUrl`, `skp`, visibility); keep existing id/name/slug |

## (2) Why

BOI and Performer previously bypassed the canonical projection. Phase 4 closes that gap so missions and BOI sit on SKP.

## (3) Impact scope

- `server.js` mount only for BOI
- `performerTurnWithLlm.js` `loadPerformerStoreContext`
- No Business writes; no Phase 5 visibility claims

## (4) Smallest safe patch

Mount BOI router → inject SKP into `loadPerformerStoreContext` with fallback to current thin select if SKP returns null (unpublished).
