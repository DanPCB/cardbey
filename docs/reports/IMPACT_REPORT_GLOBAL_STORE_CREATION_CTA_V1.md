# Impact Report — Global Store Creation CTA V1

**Date:** 2026-08-20  
**Scope:** Dashboard Global `/` acquisition CTA only (default OFF)

## What could break
- Global front page overlay stacking if CTA z-index conflicts with feed chrome
- Extra sessionStorage writes / CustomEvents on `/`
- Accidental competition with Performer/creator modals if collision checks miss a surface

## Why risk is bounded
- Feature flag **default OFF** (`VITE_ENABLE_GLOBAL_STORE_CREATION_CTA_V1` / `ENABLE_GLOBAL_STORE_CREATION_CTA_V1`)
- Isolated modules; mount is a lazy sibling on `PublicHomeFeed`
- Reuses existing `createStoreEntryRoute()` — no new onboarding runtime
- Yields to creator announcement, concierge dialogue, proactive offer, and `aria-modal` dialogs

## Impact scope
- `PublicHomeFeed` (`/`) only when flag ON
- Existing Create / Performer flows unchanged except optional `source` query on store entry URL

## Smallest safe patch
- Presentation + controller + eligibility/session/analytics libs
- Flag-gated controller mount
- EN + VI copy under `publicFeed.acquisition.*`
