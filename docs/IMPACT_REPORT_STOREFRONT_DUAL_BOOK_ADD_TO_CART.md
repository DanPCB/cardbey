# Impact Report: Storefront dual Book + Add to cart CTAs

**Date:** 2026-08-10  
**Goal:** On public `/s/...` catalog list rows, stop showing a black **Book** pill and a purple **Add to cart** bar on the same item (seen on Anison Capital Group).

## What could break

1. **Quote-only stores** — if we hide the capability bar too aggressively, “Request quote” / consultation CTAs could disappear.
2. **Hybrid stores** — cart + booking stores must keep cart when `orderEnabled`.
3. **Grid view** — unchanged today; only list + `useCapabilityActions` stacks.

## Why

In `StorefrontCatalogSection.renderItem`, when `useCapabilityActions && !addToCartEnabled`, the code mounts:

1. `StorefrontCatalogListRow` with store-level `Book` (`bookEnabled`)
2. `StorefrontItemCardActions` under it, which uses `resolveCatalogItemPresentation` → often `Add to cart` for `product_retail` / unclassified items

So booking-capable professional catalogs without cart still get a second retail CTA.

## Impact scope

- Dashboard only: `StorefrontCatalogSection.tsx`
- Public storefront catalog list (`WebsitePreviewPage` → CatalogSection)
- Not: booking drawer, cart store, `resolveCatalogItemPresentation` taxonomy, ServiceCatalog path

## Smallest safe patch

When capability actions are on and cart is off:

- If store-level booking can drive the row (`bookEnabled` + `onPrimary`) → render **only** the list-row Book CTA (skip the purple capability bar).
- Otherwise → keep the capability bar alone (quote / consultation SSOT) and do **not** also pass a row primary CTA.

No changes to classification maps or commerce capability resolution in this patch.

## Governance

Read-only storefront CTA presentation; no publish, messaging, billing, or ownership changes.
