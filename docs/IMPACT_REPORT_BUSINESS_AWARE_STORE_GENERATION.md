# Impact Report — Business-Aware + Brand-Grounded Store Generation

## Status

**Phase 1 only:** architecture audit + additive contracts.  
**No wiring** into `structured_store_build` / `generateDraft` / public storefront DTO in this phase.

## What could break (if Phase 2+ wires prematurely)

1. **Create-store catalog composition** — changing AI/template defaults could empty or reshape catalogs for existing missions mid-flight.
2. **CTA / commerce** — replacing retail `Add to cart` default could break stores that rely on ecommerce scaffolds.
3. **Theme / section order** — brand-driven ThemeSpec could restyle new drafts unexpectedly vs template slug themes.
4. **Existing published stores** — silent restyle would violate migration rule (must not happen).

## Why

Generation today defaults `draftMode: 'ai'`, classifier defaults `product_retail`, and `mergeWebsiteIntoPreview` injects generic about/reviews. Closing those paths changes process outcomes.

## Impact scope

- Performer create-store → MissionPipeline → `structured_store_build` → `generateDraft`
- Website preview sections/theme
- CTA commerce resolution
- Media fill (Pexels / future URI)

Out of scope for Phase 1: loyalty composition, Discover rails, Development Runtime, existing store re-render.

## Smallest safe patch (Phase 1 — this change)

1. Audit document under `docs/store-generation/`.
2. Additive contracts under `apps/core/cardbey-core/src/lib/storeGeneration/` (**not imported** by generation executors yet).
3. Smoke tests for contract factories only.

## Gate before Phase 2

Proceed only after explicit acknowledgment. Wire behind `ENABLE_GROUNDED_STORE_CREATION_V1` (already defined, currently unused).
