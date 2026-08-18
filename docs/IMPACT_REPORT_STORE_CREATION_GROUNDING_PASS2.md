# Impact Report — Store Creation Grounding Pass 2

**Date:** 2026-08-12  
**Scope:** Close downstream G-class re-entry (QA Tier2 cuisine invent) + F (hours as offerings)  
**Mode:** Pipeline invariant (shared grounding policy), not one-off patches  

## (1) What could break

- Non-grounded store creation if QA paths incorrectly inherit grounded invent-stop.
- Catalog QA Tier1/Tier2: grounded runs may leave empty/incomplete catalogs instead of “plausible” replacements.
- Seed/evidence catalogs that previously treated hours/contact lines as menu items.
- Preview copy that interpolated internal `Other` into slogans (behavior change to omit/resolve).
- Item media: `needs_media` clears customer-facing `imageUrl` (candidates may move to `candidateImageUrl`).

## (2) Why

Downstream writers (`draftCatalogQa`, `storeBuildQaAutoFix`) invent and launder provenance after Pass 1 invent-stop. Offering classification accepts non-menu OCR.

## (3) Impact scope

- `apps/core/cardbey-core` draft-store generation + QA only.
- Feature-gated: effective when `ENABLE_GROUNDED_STORE_CREATION_V1` / `Features.groundedStoreCreation.v1`.
- Non-grounded generative paths remain available unless they share a helper that must stay mode-aware.

## (4) Smallest safe patch

1. Shared `generationPolicy` / evidence classifier + `isAuthoritativeOffering`.
2. Filter evidence offerings at composition + invent-stop.
3. Grounded QA: remove unsupported / incomplete — never cuisine/seed invent.
4. Provenance monotonicity + media invalidation + Other-safe copy + re-attach authority trace after QA.
5. Regression tests A–G + final DTO boundary.

**Proceed:** User mandated Pass 2 implementation (explicit).
