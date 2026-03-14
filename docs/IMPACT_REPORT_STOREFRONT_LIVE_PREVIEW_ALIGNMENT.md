# Impact Report: Align Live Public Store with Stabilized Preview Storefront Layout

## Risk assessment (before changes)

**Could aligning the live store menu UI with the stabilized preview/public layout break anything?**

| Area | Risk | Mitigation |
|------|------|------------|
| **Publish output** | None | No change to publish pipeline, commit, or product/category models. Only the **rendering** of the live route (`/s/:slug`) changes. |
| **Category filtering** | Low | Live store currently groups by `product.category` (string). We keep the same data and add CategoryNav (pills) so filtering works; categories are derived from products. No API change. |
| **Cart CTA** | Low | Live page today has "ORDER NOW" (link to login). We add the same public cart as preview (add-to-cart on card, cart drawer, FAB) so both surfaces match and cart CTA works. |
| **Mobile responsiveness** | Low | ProductGrid + ProductCard use the same responsive classes (2/3/4 columns). We keep existing header/hero; only the catalog section is replaced. |
| **Public store routes** | None | Route `/s/:slug` unchanged; only the content of the page (product grid section) is replaced with the stable layout. |

**Conclusion:** Safe to proceed. Scope limited to the live public store **catalog renderer**; no changes to publish, store creation, product/category models, promotion logic, or auth.

---

## Root cause: why live and preview differ

| Path | Route | Component | Catalog renderer |
|------|--------|-----------|-------------------|
| **Preview** | `/preview/:draftId` (and `/preview/store/:storeId`) | StorePreviewPage | ProductGrid + ProductCard + CategoryNav (stable grid). Uses `useV2Grid = isMinimalPublicView`; layout from `getStorefrontLayoutMode(finalPreviewData)`. |
| **Live** | `/s/:slug` | PublicStorePage | Custom layout: `FullScreenBackgroundLayout` + manual `grid grid-cols-1 sm:grid-cols-2` with `Card` per product. No ProductGrid, no ProductCard, no CategoryNav. |

- **Preview** was stabilized (see IMPACT_REPORT_STOREFRONT_LAYOUT_STABILIZATION.md): always uses ProductGrid + ProductCard (no masonry, fixed card ratios).
- **Live** was never updated: it uses a separate, image-heavy Card grid with different structure and no shared layout resolver.

---

## Proposed change

1. **PublicStorePage** (`/s/:slug`): Replace the custom product grid with the same stable layout as preview:
   - Normalize categories from `displayStore.products` (by `product.category`).
   - Use **CategoryNav** for category pills.
   - Use **ProductGrid** with columns from **getStorefrontLayoutMode(displayStore)**.
   - Use **ProductCard** per product (fixed 4:5 aspect, no colSpan/rowSpan).
   - Add public cart (usePublicCartStore, cart drawer, FAB) so cart CTA matches preview.
2. **storefrontLayoutMode**: Add **resolveStorefrontLayout(store)** returning `{ layoutMode, columns }` so both preview and live use the same decision path.
3. **DEV logs**: On both paths log route type (preview | live), renderer (stable grid layout), business/storefront mode, products/categories count.

---

## What we do not change

- Publish pipeline, store creation flow, product/category models, promotion logic, auth/session logic.
- Preview route or StorePreviewPage behavior (only add route-type DEV log).
- ImageFirstGrid or other legacy preview branches (unchanged).

---

## Changed files (planned)

| File | Change |
|------|--------|
| `apps/dashboard/.../utils/storefrontLayoutMode.ts` | Add `resolveStorefrontLayout(store)` returning `{ layoutMode, columns }`. |
| `apps/dashboard/.../pages/public/PublicStorePage.tsx` | Replace custom product grid with ProductGrid + ProductCard + CategoryNav; use resolveStorefrontLayout; add public cart (store, drawer, FAB); add DEV logs (route type, renderer, counts). |
| `apps/dashboard/.../pages/public/StorePreviewPage.tsx` | Add DEV log: `[Storefront] route type: preview` (in existing storefront log effect). |
| `docs/IMPACT_REPORT_STOREFRONT_LIVE_PREVIEW_ALIGNMENT.md` | This report. |

---

## Before / after layout selection

| | Before (live) | After (live) |
|---|----------------|---------------|
| **Catalog** | Manual `grid grid-cols-1 sm:grid-cols-2` + Card per product; categories as `<h3>` sections. | ProductGrid(columns from resolveStorefrontLayout) + ProductCard per item; CategoryNav pills. |
| **Layout decision** | None (fixed 2-col). | Same as preview: `getStorefrontLayoutMode(displayStore)` → columns (e.g. 2/3/4). |
| **Cart** | "ORDER NOW" link only. | Same as preview: add-to-cart on card, cart drawer, FAB. |

---

## Manual verification steps

1. **Preview:** Open `/preview/store/:storeId?view=public`. Confirm stable grid (ProductGrid + ProductCard), category nav, no masonry.
2. **Live:** Open the live public store route for the same store (`/s/:slug`). Confirm **same** stable layout: same grid behavior, same card structure, same category nav behavior, no masonry/random spans.
3. **Desktop and mobile:** Check both; confirm responsive columns and no regression.
4. **Category/filter:** On both routes, change category via pills; confirm filtering works.
5. **Cart:** On live, add item to cart, open cart drawer, confirm FAB and drawer match preview behavior.
6. **No regression:** Publish flow, store creation unchanged; no changes to product/category models or auth.

---

## Return (summary)

- **Root cause:** Live store (`/s/:slug`, PublicStorePage) uses a custom Card-based grid; preview uses ProductGrid + ProductCard. Different components and no shared layout resolver.
- **Changed files:** `storefrontLayoutMode.ts` (resolveStorefrontLayout); `PublicStorePage.tsx` (stable grid + CategoryNav + cart + DEV logs); `StorePreviewPage.tsx` (route-type DEV log); this doc.
- **Preview renderer path:** StorePreviewPage → when `isMinimalPublicView && useV2Grid` → ProductGrid + ProductCard + CategoryNav; columns from `LAYOUT_MODE_COLUMNS[getStorefrontLayoutMode(finalPreviewData)]`.
- **Live renderer path (after):** PublicStorePage → ProductGrid + ProductCard + CategoryNav; columns from `resolveStorefrontLayout(displayStore).columns`.
- **Before/after layout selection:** Before: live had no layout mode (fixed 2-col). After: both use `getStorefrontLayoutMode(store)` (or `resolveStorefrontLayout(store)`) for columns.
- **Manual verification:** As above (preview vs live same layout, categories, cart, desktop/mobile, no publish/category/auth regression).
