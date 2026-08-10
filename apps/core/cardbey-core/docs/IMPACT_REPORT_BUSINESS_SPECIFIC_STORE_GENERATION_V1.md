# Impact Report — Business-Specific Store Generation V1

**Date:** 2026-08-10  
**Audit:** `docs/AUDIT_BUSINESS_SPECIFIC_STORE_GENERATION_V1.md`  
**Verdict:** `BUSINESS_SPECIFIC_STORE_GENERATION_V1_NOT_READY`

## Product question

> Does Cardbey now build the closest defensible representation of THIS business, or still a generic store decorated with a name?

**After this slice:** materially better for finance/professional (classification, CTA, seed offerings, Shows/reviews gating, coherence pass). **Still not READY** — URI/UL not on create path; whole-store validation is soft; letter placeholders are UI; existing published stores not auto-repaired; full section conditioning incomplete.

## Root causes found

1. `classifyBusinessType` defaulted unknown → `product_retail` / Add to cart  
2. Generic `buildServicesSeed` (Core Service, Express Service, …) when blueprint not locked  
3. Website merge always emitted Shows + invented reviews  
4. Stages re-inferred commerce and overwrote professional CTAs  
5. URI unused on create; Pexels queries followed weak item names  
6. Placeholder letter tiles when images missing (dashboard UI)

## Architecture before → after

| Before | After (this PR) |
|--------|-----------------|
| Re-infer type per stage; default retail | Locked `storeGenerationBusinessContext` at `structured_store_build` |
| Generic 30-item service seed | Industry blueprint / minimal professional seed for finance |
| Always Shows + fake reviews | Omitted for professional context |
| Add to cart for capital names | Book consultation via PROFESSIONAL_RE |
| No coherence check | Soft `validateStoreCoherence` on finalize + catalog scaffold repair |

## Files changed

- `lib/catalog/classifyBusinessType.js` — professional signals + CTA  
- `lib/businessSemantic/BusinessSemanticClassifier.js` — finance/legal/consulting industries  
- `services/store/seeds/seedCatalogBuilder.js` — anti-generic professional seed  
- `services/draftStore/websiteSectionsGenerator.js` — conditional Shows/reviews/CTA  
- `services/draftStore/storeGenerationBusinessContext.js` — **new** locked context  
- `services/draftStore/storeCoherenceValidator.js` — **new** whole-store check  
- `lib/toolExecutors/store/structured_store_build.js` — attach context  
- `services/draftStore/draftStoreService.js` — respect locked CTA; repair scaffolds; coherence meta  
- `lib/catalog/serviceCatalogPlaceholders.js` — repair professional scaffolds  
- Tests + audit/impact docs  

## Canonical runtime path (unchanged)

Performer → `structured_store_build` → `generateDraft` / `finalizeDraft` → preview → publish  

No parallel Performer / rights engine.

## BusinessContext contract

`buildStoreGenerationBusinessContext` — KNOWN/INFERRED/UNKNOWN knowledge flags; `verticalSlug`, `primaryCTA`, `industryBlueprintKey`, persisted on `draft.input` + `preview.meta`.

## Offering provenance

Professional seeds mark `provenance: 'GENERATED'`. Generic Core/Express scaffolds blocked for finance profiles. Full OBSERVED/INFERRED/CONFIRMED tagging deferred.

## Resource selection

Still Pexels → Seed Library. URI/UL **not** wired. Semantic negative gating for items deferred beyond hero query maps.

## CTA behaviour

Finance/capital → `Book consultation`. Locked context overrides re-inferred Add to cart in `applyCommerceFieldsToPreview`.

## Whole-store validation

Soft: `preview.meta.storeCoherence`; logs critical issues; repairs scaffolds. **Not** a publish hard gate yet.

## Test matrix / results

`businessSpecificStoreGeneration.test.js` + existing classify tests: **pass** (bakery/salon/handyman/finance/fashion/cafe type divergence; Anison anti-generic; Shows omitted).

## Known limitations / deferred

- [ ] URI ResourceRequirement on create  
- [ ] Publish hard block on coherence critical  
- [ ] Dashboard letter-placeholder neutral state  
- [ ] Non-destructive “Review this store” repair mission  
- [ ] Full conditional section sets per vertical  
- [ ] Observability admin panel  
- [ ] Auto-rewrite existing live stores (explicitly out of scope)

## Staging verification

1. Deploy Core with this branch  
2. Create store **Anison Capital Group** (or new finance name)  
3. Expect: advisory/consultation offerings (not Core Service), Book consultation CTA, no Shows/fake reviews, no Add to cart  
4. Create bakery vs handyman — catalogs/CTAs must differ  

## Acceptance gates (current)

| Gate | Status |
|------|--------|
| One BusinessContext | Partial (created + persisted; not every consumer) |
| Type changes output | Improved |
| No silent generic offerings | Improved for professional |
| CTA model-aware | Improved for professional |
| Conditional sections | Partial (Shows/reviews) |
| URI supplies resources | **No** |
| Semantic resource gating | Partial (hero only) |
| NO_SUITABLE_RESOURCE | **No** |
| Fixture isolation | Partial |
| Shows omitted when irrelevant | Yes (professional) |
| Whole-store validation | Soft only |
| Low-confidence not canonicalized | Partial |
| Performer canonical | Yes |
| No parallel systems | Yes |
| No destructive rewrite | Yes |
| Cross-industry tests | Yes |

## Final verdict

**BUSINESS_SPECIFIC_STORE_GENERATION_V1_NOT_READY**
