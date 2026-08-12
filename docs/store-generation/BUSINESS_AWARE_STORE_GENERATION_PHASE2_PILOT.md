# Business-Aware Store Generation — Phase 2 Pilot

## Verdict

**BUSINESS_AWARE_STORE_GENERATION_PILOT_READY**

## Canonical path wired

```
structured_store_build
  → generateDraft
    → generateDraftTwoModes
      → resolveGenerationParams
      → [FLAG ON] composeGroundedStoreIntelligence
      → applyCompositionToGenerationParams
      → buildCatalog (evidence seed when offerings exist)
      → saveDraftBase
      → finalizeDraft
        → mergeWebsiteIntoPreview (groundedComposition branch)
        → applyCommerceFieldsToPreview (grounded CTA wins)
```

Flag: `ENABLE_GROUNDED_STORE_CREATION_V1` → `Features.groundedStoreCreation.v1`  
When OFF: composition skipped; legacy website sections + prior catalog invent behaviour unchanged.

No parallel generator, renderer, theme system, or classifier.

## EvidenceBundle sources consumed

| Source | Keys / signals |
|--------|----------------|
| User prompt / description | `prompt`, `businessDescription` (line-split offerings) |
| OCR / documents | `ocrRawText`, `documentText` |
| Explicit lists | `detectedServices`, `detectedProducts`, `menuItems`, `services`, `products`, `seedItems`, `offerings`, `items` |
| Identity / contact | `businessName`, `phone`, `email`, `address`, `location`, `hours`, `website` |
| Category | `category`, `storeType`, `businessType` |
| Visual / brand | `primaryColor`, `brandColors`, logo/photo presence |

Provenance via `addExtractedFact` / `addVisualSignal` with confidence + sourceType. High-confidence observed offerings force `mode: seed` and skip AI package invent.

## Archetype decisions (pilot)

| Business | Archetype | Primary CTA | Offering presentation |
|----------|-----------|-------------|------------------------|
| AWE Financial | FINANCIAL_SERVICE | Discuss Your Options | service_list |
| Country Cafe | CAFE | View Menu | menu |
| Noodle Hut | FOOD_TAKEAWAY | Order Now | menu |
| Harbour Plumbing | HOME_SERVICE | Request a Quote | service_list |
| Luna Hair Studio | APPOINTMENT_SERVICE | Book Now | service_list |
| Northside Outfitters | RETAIL | Shop | product_grid |

## Offering grounding

- OCR/menu lines become catalog product names (`origin: evidence`).
- Generic `Basic/Premium/Essential Package` patterns filtered.
- Sparse beauty pilot: zero invented offerings preferred over fabricated packages.
- `buildCatalogFromGroundedOfferings` used when flag ON + seed items present.

## CTA behaviour

Archetype defaults win over retail classifier leftovers. Finance/home forbid Add to cart / Shop now / Order now. Grounded `primaryCTA` written into preview meta and preferred in `applyCommerceFieldsToPreview`.

## Style → ThemeSpec

`BrandStyleProfile` → `themeSpec` (primary/secondary/accent, tone, graphic language). Category palettes used when no visual evidence; owner/OCR colours take precedence when present. Merged into `preview.website.theme` on grounded path.

## Anti-generic gate

`evaluateCompositionGenericness` with bounded repair (max 2): CTA mismatch, unknown archetype with offerings, empty theme → category palette. Pilot cases expect `gate.ok === true`.

## Pilot matrix coverage

| # | Business | Evidence mode |
|---|----------|---------------|
| 1 | Finance broker | prompt + rich services + brand colours |
| 2 | Cafe | OCR/upload-led menu |
| 3 | Takeaway | OCR + orange/black brand |
| 4 | Home/trade | prompt-led services |
| 5 | Beauty/hair | sparse (name + category) |
| 6 | Product retailer | prompt + product list |

Automated capture: `src/lib/storeGeneration/__tests__/phase2PilotMatrix.test.js`  
Structural fingerprints: archetype, CTA, sections, offerings, theme, gate, resource needs.

### Screenshots / render evidence

Full browser storefront screenshots are a **human review step** after enabling the flag on a staging create-store run. Automated Phase 2 proves structural divergence (layout hierarchy, CTA, offerings, theme tokens) sufficient for PILOT_READY; live screenshot side-by-side remains the final qualitative check before broader rollout.

## Regressions / tests

- `storeGenerationContracts.test.js` — Phase 1 contracts
- `phase2PilotMatrix.test.js` — six-business composition + distinguishability + flag-off legacy website
- Existing `groundedStoreCreation.test.js` — invent-stop catalog policy

## Feature flag / rollback

`ENABLE_GROUNDED_STORE_CREATION_V1` unset/false → no composition call; `mergeWebsiteIntoPreview` without `groundedComposition` uses legacy USP + fabricated reviews path. NEW generation only; no migration of existing stores.

## Known limitations

1. Archetype inference is heuristic (category/name/offerings), not a full BUE classifier.
2. Theme palettes are archetype defaults when no visual extract — not pixel-faithful brand reproduction.
3. Gallery / portfolio section types mapped lightly (renderer may skip unknown types).
4. Resource needs are expressed but URI/Universal Library not orchestrated (Phase 3).
5. Live six-store screenshot review not automated in CI.

## Recommended Phase 3 boundary

Performer remains orchestrator. Consume `plan.resourceNeeds` (`heroImageNeed`, `serviceImageNeeds`, `productImageNeeds`, `backgroundNeed`, `galleryNeeds`) via Resources/URI — **do not** create a second store-generation workflow. Defer autonomous web research expansion, existing-store restyle, marketplace, and new renderer.
