# Impact Report: Service businesses must not show “Order now”

**Date:** 2026-08-10  
**Goal:** Marketplace / feed cards for service businesses (e.g. Anison Capital Group) must not show **Order now**; use booking/service CTAs (**Book now**).

## What could break

1. **Food/retail stores** — must keep Order now / Shop now when correctly classified.
2. **Persisted custom CTAs** — genuine merchant overrides that are not order-like stay as-is.
3. **“Others” lane** — capital/finance stores may move into **Services** after keyword expansion (intended).

## Why

Feed enrichment keeps an explicit store `ctaLabel` of `Order now` even when the lane is `services` / booking. `resolveFeedCtaLabel` already strips *booking* CTAs from food/products, but not the inverse. Capital/finance names also fall through as `unknown` → others, so defaults never become Book now. Homepage `resolvePublicStorefrontCtaLabel` returns `store.ctaLabel` before any service guard.

## Impact scope

- Dashboard: `feedCategoryResolver.ts`, `classifyBusinessVertical.ts`, `storeTransactionMode.ts`, `PublicStoreQRAndCTA.tsx` (+ tests)
- Core mirror: `classifyBusinessVertical.js` (+ test case) — keep SSOT in sync
- Catalog dual Book + Add to cart (prior patch in `StorefrontCatalogSection.tsx`) remains separate

## Smallest safe patch

1. Strip order/shop/add-to-cart labels when feed category is `services` or `transactionMode === 'booking'`.
2. Same strip in `resolveStoreCommerceLabels` for booking/service results.
3. Guard `store.ctaLabel === 'Order now'` in `resolvePublicStorefrontCtaLabel` for service/booking stores.
4. Expand service keywords: capital / finance / advisory / wealth / etc. in core + dashboard classifiers and feed services keywords.

## Governance

Presentation-only CTA labels; no publish, messaging, billing, or ownership changes.
