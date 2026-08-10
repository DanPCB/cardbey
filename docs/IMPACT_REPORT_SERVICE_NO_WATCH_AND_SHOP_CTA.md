# Impact Report: Service businesses must not show “Watch & shop”

**Date:** 2026-08-10  
**Goal:** Feed cards for service/capital businesses (e.g. Anison Capital Group) must not show **Watch & shop**; keep booking CTA (**Book now**).

## What could break

1. **Retail/food promo videos** — must keep Watch & shop / Quick order when correctly product/food.
2. **Creator promo_video artifacts** — unaffected if not booking/service classified.

## Why

`applyDisplayKind('promo_video')` overwrites CTA to `Watch & shop` when `videoUrl` is set. Prior service CTA strip only matched Order/Shop/Add to cart, so Anison still showed Watch & shop after deploy. NEW THIS WEEK may still say Other while the card CTA is wrong.

## Impact scope

- Dashboard: `feedCategoryResolver.ts` (order-like pattern), `artifacts.ts` (`applyDisplayKind`), tests
- No core/schema changes

## Smallest safe patch

1. Treat `Watch & shop` / `Watch and shop` / `Quick order` / `Buy now` as order-like for services/booking strip.
2. In `applyDisplayKind` promo_video: do not force Watch & shop when existing CTA is booking/service or `transactionMode === 'booking'` / `includedInServices`.

## Governance

Presentation-only CTA labels; no publish/billing/ownership changes.
