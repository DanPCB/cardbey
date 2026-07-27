# Impact Report: Service catalog incomplete menu after extract

## Problem

After menu extract (e.g. 20 services / 3 categories), category pills showed correct counts but the grid only rendered 1 card (e.g. “Hair Wax Application”).

## Cause

1. `WebsitePreviewPage` passes `showProductGrid={false}` into `ServiceCatalog`.
2. Most barber/salon item names do not match the narrow beauty `BOOKING_ITEM_RE`, so they resolve as **products**.
3. Category sections previously grouped **bookable only**, so products were dropped while pills still counted all draft items.

## Fix

- Category sections group **bookable + quote + products** and render the correct card per item.
- Flat mode also surfaces the Products section when the dedicated grid would have been hidden but bookable rows exist.
- Broaden booking keyword detection for cut/trim/beard/shave/styling so salon extracts get Book CTAs more often.

## Impact scope

`ServiceCatalog.tsx`, `resolveCatalogItemPresentation.ts` (keyword only), review modal copy in `postBuildInlineUi.tsx`.

## Category order

Published mini-website and PublicStorePage no longer A–Z sort derived categories; they keep first-seen order from catalog items so edit/extract order matches live.
