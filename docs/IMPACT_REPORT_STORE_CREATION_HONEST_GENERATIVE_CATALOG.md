# IMPACT REPORT — Honest generative catalog (mock price ladder)

**Date:** 2026-09-11  
**Status:** Explicit user request — report then fix  
**Draft evidence:** `cmtwhewl700dijv0cbx6fia1g` (Pho Saigon)

## What happened (why mockup looked “real”)

1. **Mode gate correctly chose Path B (generative)**  
   - Blackboard: `store:mode_selected` → `mode: generative`, `reason: concept_name_category_location`  
   - No `website` / `websiteUrl` / phone on draft or mission metadata  
   - Location was the placeholder `"Location unavailable"`  
   - Business name was `"Create store: Pho Saigon"` (intake prefix leak), type `general`

2. **Cuisine seed produced authentic Vietnamese dish names** (`Chả giò`, `Phở Bò`, …) via `foodCuisineCatalog` / recovery — **starter template, not researched menu**.

3. **Honesty invariant stripped prices**  
   - Cuisine bank defaults strip illustrative prices unless `EXISTING_BUSINESS` / `allowBlueprintPrices`  
   - `stampSuggestedCatalogOrigin` nulls prices for suggested items (`priceWasNotExplicitlyProvided: true`)

4. **QA then invented purchasable-looking prices**  
   - Tier1 / Tier2 treated null prices as defects  
   - `defaultPriceForIndex("general")` → `PRICE_DEFAULTS.products` = **24.95, 34.95, 44.95, 54.95** (exact match to preview)  
   - Meta: `catalogQaTier2Fixed` regenerated all 16 rows while keeping dish names  
   - Categories collapsed to **Other**; items wrongly typed as **service** / quote commerce

5. **UI showed invented USD** because `formatDraftCatalogItemPrice` does not honor `contentOrigin: suggested` / `priceWasNotExplicitlyProvided`.

6. **Runway messaging mixed Path A language into Path B** (“Finding real store images…”, “Menu ready”) after skipping research — amplifies the false “researched” feel.

## What could break

| Risk | Why | Mitigation |
|------|-----|------------|
| More “Price on request” in generative drafts | Stop inventing ladder prices | Intended honesty |
| Audit still fails PRODUCT_NULL_PRICE | If we only skip fill but keep bad indices | Do not mark suggested null prices as bad |
| Real stores missing prices no longer autofilled | Over-broad suggested skip | Gate on suggested / generative / priceWasNotExplicitlyProvided only |
| Cuisine regenerate loses categories | Tier2 regenerate | Prefer skip regenerate for suggested cuisine; if replace, keep cuisine `price` + food ladder |

## Smallest safe patch

1. `draftCatalogQa.js` — do not invent prices / do not flag-or-regenerate for honest null on suggested/generative items; food-aware ladder when fill is still required; cuisine replacements keep bank prices.  
2. `draftStoreService.js` generative block — stamp `pleaseVerifyMenu` (+ message).  
3. Dashboard `itemPrice.ts` — suggested / `priceWasNotExplicitlyProvided` → “Price on request”.  
4. `draftGuards.effectiveVertical` — treat `food.*` / `food_menu` / cuisine tokens as `food` (narrow additive).

## Explicitly not doing

- Forcing Path A research for name-only concepts (would invent “sourced” research)  
- Full intake UX redesign / website capture flow  
- Rewriting image-scrape step messaging in this patch (follow-up if needed)
