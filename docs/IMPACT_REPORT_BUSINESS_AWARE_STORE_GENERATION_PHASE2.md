# Impact Report — Business-Aware Store Generation Phase 2

## Verdict

**BUSINESS_AWARE_STORE_GENERATION_PILOT_READY**

## What could break

1. **New draft catalogs** — when flag ON and evidence offerings exist, AI invent path is forced to seed; catalogs may be shorter/incomplete vs previous “full looking” invented menus.
2. **Website section shape** — grounded path omits fabricated reviews / generic USP for non-retail archetypes; consumers expecting always-present `social_proof` reviews may see empty/absent blocks.
3. **CTA labels** — finance/service stores no longer default to Add to cart when composition applies.
4. **Theme tokens** — `preview.website.theme` may receive archetype/evidence colours instead of template-only patches.

## Why

Phase 2 wires Evidence → Understanding → Composition into the existing `generateDraftTwoModes` runway behind `ENABLE_GROUNDED_STORE_CREATION_V1`. Flag OFF restores prior behaviour.

## Impact scope

- `draftStoreService.generateDraftTwoModes` / `runContentResolution` (copy sanitize)
- `buildCatalog` (evidence catalog branch)
- `websiteSectionsGenerator.mergeWebsiteIntoPreview` (grounded branch)
- `applyCommerceFieldsToPreview` (grounded CTA)
- Contracts under `src/lib/storeGeneration/`

Out of scope: URI orchestration, existing store mutation, new endpoints/renderers, loyalty/Discover.

## Smallest safe patch (applied)

1. `buildGroundedComposition.js` — compose + apply + evidence catalog builder.
2. Flag-gated call in `generateDraftTwoModes`; persist `groundedComposition` on draft.input.
3. Catalog + website + CTA hooks only when composition present / flag ON.
4. Pilot tests + docs; no parallel generator.

## Rollback

Unset or set `ENABLE_GROUNDED_STORE_CREATION_V1=false`. No data migration required.
