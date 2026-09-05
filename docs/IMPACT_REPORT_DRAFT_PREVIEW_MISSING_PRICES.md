# Impact Report: Draft Preview Missing Prices

## What could break
- Catalog rows that previously hid blank prices will now show "Price on request".
- Callers that treated `formatDraftCatalogItemPrice === null` as "no price UI" will start showing a label.

## Why
Starter/unknown offerings correctly have `price: null`, but preview gated display on `price != null`, so prices vanished entirely (neither amount nor UNKNOWN label).

## Impact scope
Draft Preview / storefront catalog list + featured show cards; itemPrice helper.

## Smallest safe patch
1. `formatDraftCatalogItemPrice` → use `priceDisplay` / UNKNOWN → "Price on request" (never `$0.00`).
2. WebsitePreview featured cards: always render price via formatter (no `price != null` gate).
3. Stamp AI starters with `priceStatus: 'UNKNOWN'` + `priceDisplay` for explicit state.
