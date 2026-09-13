# Impact Report — Wrong store hero photos (identity-split media)

## What could break
- Multi-source enrichment hero rates (more HERO_MISSING when no matched venue)
- Foursquare/OSM enrichment for contact/category when venue name does not match
- Public heroes that previously showed wrong nearby landmarks

## Why
- Places photos banned for public `<img>`; fallback ladder used weak FSQ/OSM `results[0]`
- Website og treated as identity-matched whenever any URL existed
- Wrong FSQ heroes written to Business.heroImageUrl and served without source gate

## Impact scope
- `foursquareFetcher`, `osmCrossRef`, `heroImageResolve`, `multiSourceEnrichmentAgent`
- `buildBusinessEnrichmentPatch` hero allowlist
- `resolvePublicCandidatePresentation` eligible sources
- Optional Places photo proxy for correct placeId-bound images

## Smallest safe patches
1. Strong venue name match (≥0.85); never `results[0]` / `elements[0]` fallback
2. FSQ website/photos/description only when venue MATCHED
3. Website og only when host corroborates candidate website or discovery website
4. Do not write non-allowlisted / Places raw URLs onto Business.heroImageUrl
5. Places photo proxy bound to candidate placeId (when photo ref exists)
