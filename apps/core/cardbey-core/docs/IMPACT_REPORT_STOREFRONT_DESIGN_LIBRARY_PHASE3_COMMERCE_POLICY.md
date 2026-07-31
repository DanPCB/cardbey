# Impact Report — Storefront Design Library Phase 3 (Commerce Policy)

**Date:** 2026-07-31  
**Scope:** Business-model inference + CTA decision policy (advisory metadata only)  
**Flag:** `ENABLE_DESIGN_LIBRARY_V1` (unchanged authority: `isDesignLibraryAuthoritative() === false`)

## Boundary

Phase 3 answers:

1. **What business model fits this evidence?** (`service_quote` | `service_booking` | `retail` | `restaurant` | `portfolio` | `mixed`)
2. **Which primary/secondary storefront actions fit?** (Request a quote / Call / Book / Buy / Order / Reserve / …)

It does **not**:

- Cut over live `resolveStoreCommerce` / `primaryCTA` / renderer CTAs  
- Score or select blueprints  
- Change React section placement  
- Invent Book or Buy without booking / purchasable evidence  

## Module

`src/lib/storefrontDesignLibrary/policy/`

| File | Role |
|------|------|
| `commerceEvidence.js` | Gather booking / price / quote / phone / menu / role counts |
| `businessModelInference.js` | Deterministic model + confidence + reasons |
| `ctaDecisionPolicy.js` | Primary/secondary action + labels from Phase 1 vocabulary |
| `applyDesignLibraryCommercePolicy.js` | Attach `meta.designLibraryCommercePolicy` when flag on |

## Integration

| Path | Behaviour when flag ON |
|------|-------------------------|
| `finalizeResearchCatalogForDraft` | After classification (+ enrich/stamp), attach advisory commerce policy; emit `storefront.commerce_policy.completed` (dev / `DESIGN_LIBRARY_POLICY_LOG=1`) |
| `stampSuggestedCatalogOrigin` | After classification, attach advisory commerce policy |

Flag OFF: no policy meta.

## Metadata shape (additive)

```json
{
  "designLibraryCommercePolicy": {
    "authoritative": false,
    "businessModel": "service_quote",
    "businessModelConfidence": 0.9,
    "primaryAction": "request_quote",
    "primaryLabel": "Request a quote",
    "secondaryAction": "call",
    "secondaryLabel": "Call now",
    "ctaReasons": ["quote_based_service"],
    "evidenceSummary": { "hasPhone": true, "hasBookingUrl": false }
  }
}
```

Live BSL fields (e.g. `meta.primaryCTA: "Book"`) remain untouched in Phase 3.

## Evidence rules (summary)

- **Book** only with booking provider or booking URL  
- **Buy / Add to cart** only with priced purchasable product evidence  
- **Quote + Call** for category-heavy trades without booking/buy (MSD-shaped)  
- **Order / Reserve** for restaurant when delivery / reservation evidence exists  

## What could break

| Risk | Why | Mitigation |
|------|-----|------------|
| Wrong advisory model/CTA in meta | Heuristics misfire on sparse catalogs | Advisory only; live CTA engine unchanged; rollback `ENABLE_DESIGN_LIBRARY_V1=false` |
| Downstream readers assume authority | New meta key discovered | Explicit `authoritative: false`; docs + diagnostics |
| Enrich still stamps `primaryAction: book` on research items | Pre-existing research enrich | Phase 3 does not overwrite item CTA fields |

## Impact scope

- Draft/research catalog finalize + suggested stamp (metadata only)  
- Design-library diagnostics (`commercePolicyVersion`)  
- No public storefront render, publish, payments, or messaging changes  

## Smallest safe patch

Additive `policy/` module + two flag-gated attach points in `researchCatalogDraft.js`. No Prisma migration. No renderer / BSL / transaction-mode edits.

## No-parallel-stack proof

Wraps existing research catalog finalize; does not introduce a second CTA engine for live surfaces. Live path remains `resolveStoreCommerce` / BSL presentation until a future authoritative cutover (gated separately).

## Test plan / results

```text
pnpm exec vitest run src/lib/storefrontDesignLibrary
  Phase1: 16 passed
  Phase2 classification: 20 passed
  Phase3 commerce policy: 12 passed
  Total: 48 passed
node -e "import('./src/lib/storefrontDesignLibrary/policy/index.js')" → ok
```

Covered:

- MSD → `service_quote` + Request a quote + Call  
- Booking URL → Book; booking model without provider does not invent Book  
- Retail purchasable → Buy  
- Restaurant delivery/reservation → Order / Reserve  
- Flag off → no meta  
- Finalize preserves live `primaryCTA` while attaching advisory policy  

## Phase 4 status

Implemented — see `docs/IMPACT_REPORT_STOREFRONT_DESIGN_LIBRARY_PHASE4_BLUEPRINT_SCORING.md`.
