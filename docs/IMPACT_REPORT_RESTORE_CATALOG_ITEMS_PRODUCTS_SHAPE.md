# Impact Report: Restore catalog items to Draft Preview (items→products)

**Goal:** My Flower Preview Catalog section empty despite starter offerings built.

## What could break
- Catalogs that intentionally only expose `items` might get mirrored into `products` (desired for draft persist).
- Tagline wording for stores with coarse type "Others" will prefer vertical label.

## Why
`buildNewBusinessStarterCatalog` returns `items`; `saveDraftBase` only persists `products` → `preview.items` empty. `ensureStoreCreationCatalogItems` treats item-only as filled and skips normalize.

## Smallest safe patch
1. Normalize `items` → `products` in `ensureStoreCreationCatalogItems` when products empty.
2. Emit `products` from starter/cuisine builders.
3. `saveDraftBase`: `products ?? items`.
4. Tagline: avoid literal "Others" — use florist/vertical label when available.
