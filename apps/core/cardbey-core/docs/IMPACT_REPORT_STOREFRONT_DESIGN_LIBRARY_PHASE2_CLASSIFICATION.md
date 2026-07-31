# Impact Report — Storefront Design Library Phase 2 (Classification)

**Date:** 2026-07-31  
**Scope:** Semantic `BusinessContentRole` classification (additive metadata only)  
**Flag:** `ENABLE_DESIGN_LIBRARY_V1` (unchanged authority: `isDesignLibraryAuthoritative() === false`)

## Classification boundary

Phase 2 answers **what kind of business content is this?**  

It does **not** select blueprints, CTAs, or React section placement.

## Vocabulary

Uses Phase 1 `BusinessContentRole` set (`product`, `service`, `service_category`, … `unknown`).

## Deterministic rule order

1. Explicit trusted type / schema  
2. Research provider type (e.g. extract `type: service_category`)  
3. Strong exclusions (policy, career, testimonial, trust, nav, about/contact/location, blog/support)  
4. Commerce / booking evidence  
5. Offering distinction (service vs category, product, menu)  
6. Optional AI (`ENABLE_DESIGN_LIBRARY_AI_CLASSIFIER` — unused provider in Phase 2)  
7. `unknown`

Confidence: **0.0–1.0**. `classifierVersion: 1`.

## Research / suggested integration

| Path | Behaviour when flag ON |
|------|-------------------------|
| `finalizeResearchCatalogForDraft` | Classify **before** enrich; attach `contentRole`, `roleConfidence`, `roleReason`, `roleClassifierVersion`, `roleEvidence`; emit `storefront.classification.completed` |
| `stampSuggestedCatalogOrigin` | Classify after suggested stamp; preserve `contentOrigin: suggested` |

Flag OFF: no classification fields attached.

## Persistence

Additive JSON on catalog products + `meta.contentClassification` summary.  
No Prisma migration. Does not overwrite `contentOrigin`, source URL, `needsOwnerReview`, price, or catalog authority.

## Feature-flag behaviour

- **Off:** unchanged live behaviour.  
- **On:** metadata only; **no** renderer / blueprint / CTA cutover.  
- Authority remains false.

## What could break / why safe

Could attach unexpected roles if rules misfire — **no public UI change** yet, so owner-facing storefront unchanged. Rollback: `ENABLE_DESIGN_LIBRARY_V1=false`.

## Test results

```text
vitest src/lib/storefrontDesignLibrary → Phase1 + Phase2 all passed
  classification: 20 passed (incl. 17-row MSD fixture)
node -e "import('./src/lib/storefrontDesignLibrary/classification/index.js')" → ok
```

## Known ambiguities

- Short single-word labels without type/nav may remain `unknown` (by design).  
- “Customer Reviews” in product-listing context is intentionally soft.  
- AI fallback hook reserved; Phase 2 works without AI.

## Phase 3 status

Implemented — see `docs/IMPACT_REPORT_STOREFRONT_DESIGN_LIBRARY_PHASE3_COMMERCE_POLICY.md`.
