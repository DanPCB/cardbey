# IMPACT REPORT — Space food stores showing Booking / Book now

**Date:** 2026-09-11  
**Status:** Explicit user evidence (Banh Mi Ngon Space screenshots)  
**Related:** `IMPACT_REPORT_SPACE_CATALOG_CTA_LABELS.md`

## Goal

Food / hospitality Spaces must show **Order** (cards + hero), not **Booking** / **Book now**, when catalog rows are cuisine dishes mis-typed as `service` under a catch-all **Services** category.

## What could break

| Risk | Why | Mitigation |
|------|-----|------------|
| Real bookable SKUs on food stores flip to Order | Name/category heuristics | Keep Booking only for bookable name hints (`dining`, `catering`, `consult`, …) |
| Nails / flooring still need services lane | Broader FOOD_RE / classify reorder | FOOD terms stay food-specific; beauty/trade regexes unchanged |
| Capability CTA “never invent Order” | Hospitality+catalog implies order | Align with existing `product_retail`+catalog → Shop pattern; remapping only remaps Book→Order for hospitality |

## Impact scope

- Dashboard Space theatre hero CTA
- Space offering cards / scoped feed store CTA
- `resolveStoreCommercePresentation` / `classifyCanonicalBusinessType` (feed category food vs services)

## Smallest safe patch

1. Expand food corpus + run vertical food **before** `hasServiceItems → service_fixed_booking`
2. Never let mis-typed service item signals override `food_menu`
3. `includedInServices` false when `food_menu`
4. Remap hero `Book` / `Book now` → `Order` for hospitality; `canOrder` when hospitality + catalog
5. Offering: dish names / generic Services on food → Order; `dining` etc. stay Booking

## Explicitly not doing

- Rewriting stored catalog item types in Core for existing drafts
- Wiring Order button to live checkout
- Renaming catch-all DB category “Services” → “Menu” in this patch
