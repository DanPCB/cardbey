# Image Resolution Chain Audit: DraftStore → Final Store → Public Page

**Date:** 2026-02-27  
**Scope:** Full image resolution chain; index-based access; stable-key resolution; debug logging.

---

## 1. Summary

- **Index-based image access:** No unsafe **item→image by array index** was found. All item image resolution goes through `getItemImage` / `getItemImageWithSource` with `imageByKey` (stable key) or `itemImageMap` (id) where applicable.
- **Draft review:** Uses `getItemImageWithSource(product, { itemImageMap, imageByKey: imageByStableKey })`; `imageByStableKey = buildImageByStableKey(effectiveDraft.catalog?.products)`.
- **Public grid/list (StorePreviewPage):** Uses `getItemImageWithSource(item, { imageByKey: imageByStableKey })` and `getItemImage(item, { imageByKey: imageByStableKey })`; no `images[originalIdx + 1]` fallback in current code. `originalIdx` is used only for stable DOM ids (`menu-${originalIdx}`), not for image lookup.
- **ProductEditDrawer:** Uses per-item sources only: `itemImageMap.get(product.id)`, `product.imageUrl`, `product.images[0]` — correct (no cross-item index mapping).
- **Store logo/header:** `finalPreviewData.images?.[0]` is used intentionally for store logo (first image), not for mapping items.

---

## 2. Files Changed

| File | Change |
|------|--------|
| `apps/dashboard/cardbey-marketing-dashboard/src/lib/itemImageMapping.ts` | Added gated debug log when `cardbey.debugImageSource` is set. Logs: `stableKey`, `resolvedImageUrl`, `source`, `fallbackUsed`, `itemId`, `itemName`. |

**No other files were changed.** No refactors to resolution paths; only additive logging.

---

## 3. Debug Log: `cardbey.debugImageSource`

**Enable:** Set in browser console or localStorage:

- `localStorage.setItem('cardbey.debugImageSource', 'true')`
- Or `window.cardbey = { debugImageSource: true }`

**Disable:** `localStorage.removeItem('cardbey.debugImageSource')` or set `window.cardbey.debugImageSource = false`.

**Logged per resolution (when enabled):**

- `stableKey` — key used for imageByKey lookup
- `resolvedImageUrl` — final URL or `(none)`
- `source` — `'item'` | `'itemImages'` | `'itemImageMap'` | `'imageByKey'` | `'placeholder'`
- `fallbackUsed` — true when source is not `item` or `itemImages`
- `itemId`, `itemName` — for correlation

---

## 4. Risk Assessment

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Debug log performance in production | Low | Log is gated; off unless flag is set. No impact when disabled. |
| Breaking store preview / public page / draft review | None | No changes to resolution logic; only logging added. |
| Breaking final publish path | None | Publish path was not modified; images are resolved in UI only; persisted data uses item.imageUrl from draft/API. |

**Conclusion:** Additive change only. No change to behavior of store preview, public page rendering, or draft review workflow.

---

## 5. Manual Verification Checklist

Use this to verify the image chain and debug log.

### 5.1 Draft Review

- [ ] Open a store draft review (e.g. `/store/:storeId/review` or equivalent).
- [ ] Confirm product cards show correct images (no wrong image on wrong product).
- [ ] Enable `localStorage.setItem('cardbey.debugImageSource', 'true')` and refresh.
- [ ] In console, confirm `[cardbey.debugImageSource]` logs show `stableKey`, `resolvedImageUrl`, `source`, `fallbackUsed` for each card.
- [ ] Disable flag and confirm logs stop.

### 5.2 Public Grid (StorePreviewPage)

- [ ] Open public preview (e.g. `/preview/store/:storeId` or draft preview URL).
- [ ] Switch to grid view; confirm item images match items (no index-shifted images).
- [ ] With `cardbey.debugImageSource` enabled, confirm logs for grid items show expected `source` (e.g. `item`, `imageByKey`, or `placeholder`).

### 5.3 Public List

- [ ] Same preview page in list view; confirm images (if shown) match items.
- [ ] Optionally check debug logs for list items.

### 5.4 Final Publish

- [ ] Publish a store from draft; open public storefront (e.g. `/s/:slug`).
- [ ] Confirm product images on public page match what was in draft review.
- [ ] No code changes were made to publish path; this is a sanity check only.

### 5.5 Debug Log Only

- [ ] Without enabling the flag, confirm no `[cardbey.debugImageSource]` logs appear.
- [ ] With flag enabled, confirm at least one log per resolved item in draft review and/or public grid.

---

## 6. Reference: Resolution Paths Verified

| Surface | File(s) | Resolution |
|---------|---------|------------|
| Draft review (product cards) | `StoreDraftReview.tsx` | `getItemImageWithSource(product, { itemImageMap, imageByKey: imageByStableKey })` |
| Public grid/list (StorePreviewPage) | `StorePreviewPage.tsx` | `getItemImageWithSource(item, { imageByKey: imageByStableKey })` / `getItemImage(...)` |
| Product edit drawer | `ProductEditDrawer.tsx` | Per-item: `itemImageMap.get(id)`, `product.imageUrl`, `product.images[0]` |
| Helper (single source of truth) | `itemImageMapping.ts` | `getItemImage`, `getItemImageWithSource`, `buildImageByStableKey`, `getItemStableKey` |

**Index-based access:** Not used for item→image mapping. `item.images[0]` is only the item’s own first image. `finalPreviewData.images?.[0]` is store logo only.
