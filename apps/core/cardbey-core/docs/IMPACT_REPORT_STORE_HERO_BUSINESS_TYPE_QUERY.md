# Impact Report — Store hero image by business type

**Date:** 2026-08-10  
**Surface:** Create store → hero banner (Pexels / hero generation)  
**Symptom:** Live stores (e.g. Anison Capital Group) received the same retail “We’re Open” / storefront hero regardless of business type.

## Root cause

Hero search collapses unmapped types to one hardcoded query:

`CATEGORY_HERO_QUERIES.default = 'small business storefront'`

Finance/capital names and categories were not in `BUSINESS_NAME_OVERRIDES`, industry blueprints, or taxonomy → every such store searched the same retail storefront stock photo. Caching then amplified reuse.

## What could break

| Risk | Why | Mitigation |
|------|-----|------------|
| Different Pexels winners for existing verticals | Query strings for mapped food/fashion/etc. unchanged | Only expanded maps + changed default |
| Seed Library fallback keys | New categoryKeys (`finance`, etc.) may miss seed rows | Falls through to null → prior behavior; Pexels is primary |
| Over-matching “capital” in unrelated names | Name override includes `capital` | Intentional for capital firms; retail names rarely include it |
| Slightly more specific default for unknown types | Default no longer `small business storefront` | Derived from category/name + professional office |

## Impact scope

- Core hero generation only (`generateHeroForDraft` → Pexels)
- Industry blueprint / vertical taxonomy matching for finance
- `structured_store_build` type resolution (`meta.category` / `meta.industry`)
- Early `generateDraft` hero now receives `verticalSlug` / `verticalGroup` like `finalizeDraft`

Dashboard unchanged (displays Core `heroImageUrl`).

## Smallest safe patch

1. Expand name/category hero query maps (finance, consulting, health, real estate, …)
2. Replace catch-all retail storefront default with type-derived professional office query
3. Extend accounting/finance match patterns + `services.finance` taxonomy keywords
4. Pass vertical into early hero generation; accept `meta.category` in store build

## No-parallel-stack proof

Same Pexels → OpenAI → Seed Library path. No new image provider or Federation path for store heroes.

## Verify

- Create store “Anison Capital Group” → hero query / image is corporate finance / office, not open-sign retail
- Create cafe/bakery → still cafe/bakery imagery
- Unit: `tests/getSeedImageForCategory.test.js`
