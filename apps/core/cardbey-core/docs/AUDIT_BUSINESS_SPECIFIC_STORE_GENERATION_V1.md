# AUDIT — Business-Specific Store Generation V1

**Date:** 2026-08-10  
**Scope:** Runtime path for Performer create-store → draft → storefront  
**Symptom store:** `anison-capital-group` (finance name → generic services, wrong stock images, Add to cart, letter placeholders, irrelevant Shows)

## Verdict (audit)

Cardbey can produce **structurally complete** stores whose **content is generic / semantically inconsistent**. Multiple stages re-infer business type; finance/capital often defaults to `product_retail` + generic service seeds + Pexels-on-weak-queries. URI/UL is **not** on the create path.

---

## 1. Entry points

| Path | Runtime |
|------|---------|
| Performer Create store | `performerIntakeV2Routes` → `createStoreCheckpointDispatch` → mission `structured_store_build.execute` |
| Structured build | `toolExecutors/store/structured_store_build.js` → `orchestraBuildStore.createBuildStoreJob` → `draftStoreService.generateDraft` |
| HTTP draft generate | `routes/draftStore.js` `POST /generate` |
| Discovery seed (parallel) | `generateFullStoreFromSeedService` → same `generateDraft` |
| Dashboard starter | `ConsoleCentreColumn` `create_store` → Performer intake |

Canonical runway: **Performer → structured_store_build → generateDraft → finalizeDraft → (guest temp \| publish)**.

## 2. Business information sources

Intake meta (`businessName`, `businessType`/`storeType`/`category`), OCR text, website URL (ReAct scrape gated), social import products, synthetic `Create a store for ${name}`. Missing type → `'general'`.

## 3. Category / industry determination (re-inferred)

1. Intake category hint  
2. BSL `classifyBusinessSemantic` / `classifyBusinessType` (**defaults `product_retail`**)  
3. `resolveVertical` taxonomy (`services.finance` keywords exist)  
4. Industry blueprints (`services.accounting` matchPatterns include capital/finance after hero patch)  
5. `applyCommerceFieldsToPreview` re-classifies  
6. `mergeWebsiteIntoPreview` uses `resolveTransactionCommerce(storeType)`  
7. Publish `classifyBusinessVertical`

**No single locked BusinessContext** threaded end-to-end.

## 4. Offerings generation

`buildCatalog` → AI menu / template / seed. Fallback **`buildServicesSeed`**: Core Service, Premium Package, Express Service, Emergency Call-out, etc. (`seedCatalogBuilder.js`). Expansion fallbacks in `buildCatalog.js` (`GENERIC_EXPANSION_FALLBACK`). Industry blueprint catalog is preferred when profile resolves — often skipped when vertical/BSL wrong.

## 5. Storefront sections

`mergeWebsiteIntoPreview` always emits: hero, usp_bar, **Shows**, social_proof (fake Alex/Jordan/Sam reviews), about, contact. Not conditional on business model.

## 6. CTA / commerce

`classifyBusinessType` → `primaryCTA`. Default **Add to cart**. Finance without service keywords hits default. Blueprint `ctaLabel` (Book consultation) only when industry copy resolves.

## 7. Images / resources

Item/hero: Pexels via `menuVisualAgent` / `generateHeroForDraft` → Seed Library fallback. Queries from item names (weak for “Core Service”). **URI / Universal Library not consulted** on store create.

## 8. URI / UL

Not imported by `draftStore` / `structured_store_build`. Federation is Library/admin path only.

## 9. Generic fallback origins

| Symptom | Origin |
|---------|--------|
| Core/Premium/Express/… | `buildServicesSeed`, `GENERIC_EXPANSION_FALLBACK`, `templateItemsData.generic_store` |
| Letter A/B/P/R | Dashboard `MiniWebsiteLayout` first letter when `imageUrl` missing |
| Add to cart | BSL default `product_retail` |
| Dog/plane/coffee stock | Pexels on generic names + weak queries |
| Shows dump | Unconditional `show` section |

## 10. Demo / fixture leakage

Fake reviews in website merge. UL fixtures not on create path. Service placeholders can leak into food (partially repaired); **professional stores are not repaired** by `shouldRepairServiceCatalogLeak` (non-service only).

## 11. AI context loss

Synthetic rawInput; menu prompt lacks OCR/website; commerce re-classifies from preview only; `USE_OUTPUT_VALIDATION` off by default.

## 12. Independent re-inference

Yes — intake, BSL, vertical, blueprint, commerce apply, website merge, QA, publish (see §3).

## 13. Canonicalization point

Draft preview until `publishDraft` / commit → Business + Product rows.

## 14. Whole-store validation

No publish blocker for business-fit / anti-generic / CTA / Shows / image relevance. Research/auth gates only.

---

## Root causes (Anison)

1. BSL default `product_retail` → Add to cart  
2. Generic `buildServicesSeed` when industry blueprint not locked early  
3. Pexels queries from scaffold names → irrelevant stock  
4. Always-on Shows + fake reviews  
5. Letter tiles mask missing images  
6. No URI semantic resource requirement on create  

## Reuse (do not fork)

BSL, `classifyBusinessType`, vertical taxonomy, industry blueprints, `serviceCatalogPlaceholders` repair pattern, hero query maps, existing Pexels path. Wire URI later as optional media source — not a second Performer/rights engine.

## Correction sequence (this phase)

See `IMPACT_REPORT_BUSINESS_SPECIFIC_STORE_GENERATION_V1.md`.
