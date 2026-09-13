# IMPACT REPORT — Space catalog card CTAs (Order / Add to cart / Booking)

**Date:** 2026-09-11  
**Status:** Explicit user request — Space food vs service card CTAs

## Goal

On Space catalog cards:
- Food / menu → **Order** (or product retail → **Add to cart**)
- Service → **Booking**
- Stop defaulting food menus to **View details**

## What could break

| Risk | Why | Mitigation |
|------|-----|------------|
| CTA label implies cart/booking without live action | Space button still opens detail sheet | Labels are presentation SSOT alignment; action wiring unchanged (same as storefront mismatch today) |
| Service misclassified as Order | Category "Services" or itemType service | Item/category-aware override before store archetype |
| Foundation tests lock View details | Intentional prior conservatism | Update tests to new contract |

## Smallest safe patch

1. `spaceCommercialSemantics.ts` — `resolveOfferingCtaLabel(store, name, offering?)`  
2. `spaceCatalogProjection.ts` — pass category / itemType / isService  
3. Update `spaceProfileFoundation.test.ts`

## Explicitly not doing

- Wiring Order/Booking to cart/booking drawers in this patch  
- Changing Universal Profile personal layouts
