# Implementation Report: Store Creation Semantic Precision V1

**Status:** P0 code + unit gates complete. **Not** declaring `CARDBEY_STORE_CREATION_SEMANTIC_PRECISION_V1_READY` until a real local browser E2E Draft Preview confirms all P0 invariants.

## 1. ROOT CAUSE (five visible defects)

| Defect | Root cause |
|--------|------------|
| SEO title as canonicalName | Website scrape preferred `og:title` / `<title>` as `raw.name`; research pipeline used `selected.name` / facts without stripping SEO suffixes (`Name - Florist Braybrook, Same Day…`). |
| Category / inventory as products | Nav/occasion labels and stock chrome entered catalog as offerings; `product_category` counted as offering; classification gated behind Design Library flag; commerce filter treated categories as sellable. |
| Unknown price → `$0.00` | `StorePreviewCanvas.formatPrice` rendered `null` as `$0.00`; zero amounts treated as paid/free without `priceStatus`. |
| Product CTA = Book | `enrichResearchCatalogProducts` defaulted `executionAction` to `book`; `BookingServiceNormalizer` applied Book to all kinds; florist missing from retail classify in places. |
| Our Story = “Create a store for…” | `mergeWebsiteIntoPreview` used `input.prompt` / mission text as about blurb with no generation-output boundary. |

## 2. FILES CHANGED

- `apps/core/cardbey-core/src/lib/storeCreation/semanticPrecision.js` **(new)**
- `apps/core/cardbey-core/src/lib/storeCreation/__tests__/semanticPrecision.test.js` **(new)**
- `apps/core/cardbey-core/src/lib/storeCreationResearch/businessFactsExtractor.js`
- `apps/core/cardbey-core/src/lib/storeCreationResearch/canonicalSourcedBusinessContent.js`
- `apps/core/cardbey-core/src/lib/storeCreationResearch/serviceMenuExtractor.js`
- `apps/core/cardbey-core/src/lib/storeCreationResearch/index.js`
- `apps/core/cardbey-core/src/lib/storeResearch/runStoreResearchPipeline.js`
- `apps/core/cardbey-core/src/lib/storeResearch/catalogNormalizers/index.js`
- `apps/core/cardbey-core/src/lib/businessDiscovery/businessDiscoverySources.runtime.js`
- `apps/core/cardbey-core/src/lib/storefrontDesignLibrary/contracts/contentRole.js`
- `apps/core/cardbey-core/src/lib/storefrontDesignLibrary/classification/deterministicRules.js`
- `apps/core/cardbey-core/src/lib/mission001/offeringReconstruction/offeringLabelQuality.js`
- `apps/core/cardbey-core/src/lib/catalog/serviceCatalogNormalizer.js`
- `apps/core/cardbey-core/src/services/draftStore/researchCatalogDraft.js`
- `apps/core/cardbey-core/src/services/draftStore/websiteSectionsGenerator.js`
- `apps/core/cardbey-core/src/services/draftStore/groundedStoreCreation.js`
- `apps/core/cardbey-core/src/services/draftStore/draftStoreService.js`
- `apps/dashboard/.../src/lib/itemPrice.ts`
- `apps/dashboard/.../src/components/onboarding/StorePreviewCanvas.tsx`
- `docs/IMPACT_REPORT_STORE_CREATION_SEMANTIC_PRECISION_V1.md`

## 3. BEFORE / AFTER

| Area | Before | After |
|------|--------|-------|
| Identity | `Blossom Tree Florist - Florist Braybrook, Same Day Flower Delivery` | `Blossom Tree Florist` (+ optional `seoTitle`) |
| Catalog | Birthday / Sympathy / “In stock (77)” as products | CATEGORY / INVENTORY_METADATA; filters retained; products only sellable |
| Price | missing → `$0.00` | `Price on request` / null amount; FREE only when `priceStatus=FREE` |
| CTA | Florist product → Book | Add to cart / Enquire; Book only for scheduled services |
| Our Story | `Create a store for Blossom Flower…` | Safe florist starter, stamped `AI_GENERATED_STARTER` |

## 4–9. RESULTS (unit / code path)

4. **Canonical identity** — `stripSeoBusinessDisplayName` at facts, website scrape, research pipeline, website merge.  
5. **Catalog classification** — always `classifyResearchCatalogProducts({ force: true })` + `applyCatalogRecordClassification`; commerce via `isRenderableCommerceRole` (retail excludes `product_category`).  
6. **Price semantics** — `normalizeOfferingPrice` + dashboard `getItemPrice` / `StorePreviewCanvas`.  
7. **CTA** — `resolveOfferingCta` + enrich defaults; Booking normalizer gated.  
8. **Copy-leak** — `isInternalGenerationPrompt` + safe starter about.  
9. **Media** — stronger florist hard-negatives + bouquet/arrangement ranking boost (pipeline unchanged).

## 10. E2E evidence

**Not run in this session** (no live Quick Card → Draft Preview browser pass).

Required before READY:
Quick Card → research → catalog review → accept → composition → Draft Preview; inspect identity, hero, catalog, categories, prices, CTA, media, Our Story.

## 11. REGRESSIONS

- Unit: `semanticPrecision.test.js` (12), `canonicalSourcedBusinessContent.test.js` (9), `newAndExistingBusinessCreationV1.test.js` (7) — **all pass**.
- Sourced category bypass now wired into `normalizePreviewCategories` (was documented in tests but missing).

## 12. REMAINING RISKS

- Browser E2E not green → **do not ship as production-ready**.
- Trades `service_category` remains commerce-eligible outside florist/retail (intentional to avoid emptying MSD-style catalogs).
- Classifier `unknown` product names still need strong product evidence; force-classify helps but edge websites may under-classify.
- Dashboard public mini-website paths beyond `StorePreviewCanvas` may still format prices differently — spot-check WebsitePreviewPage in E2E.

## Gate

```
CARDBEY_STORE_CREATION_SEMANTIC_PRECISION_V1_READY — NOT DECLARED
(awaiting real local Draft Preview E2E with all P0 invariants = 0 failures)
```
