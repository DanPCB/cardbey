# Impact Report — Discover TikTok-style SME grid (`/frontscreen`)

## What could break
- Explore goal-first UX (`ExploreIntentBreadcrumbBar` hero) and journey panel entry
- Featured Video discovery path
- Existing search → marketplace results on `/frontscreen`
- Claim CTA behaviour if new modal bypasses governed claim intent
- Public store feed consumers if mapper shape changes incompatibly

## Why
Primary Explore surface becomes a business masonry grid (Growth/discovery + published stores) instead of “What would you like to achieve today?” goal cards.

## Impact scope
- `ExploreDiscoveryPage.tsx` layout (integration point)
- New `components/explore/discover/*` UI
- `useDiscoverStores` + optional `publicStoreMapper` enrichments
- Claim entry via existing `startGovernedBusinessClaim` (no auto-store)

## Smallest safe patch
1. Add discover grid components; restructure Explore page render only
2. Merge `GET /public/stores/feed` + `GET /public/discovery/businesses` client-side
3. Move Create/Grow/Learn to footer strip; remove Find from strip
4. Keep Featured Video below grid (collapsible section)
5. Claim → governed handoff modal → existing `/claim-business/:id` flow
6. Mapper: add optional `profileScore` / counts when present; never remove fields
