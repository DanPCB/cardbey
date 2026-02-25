# Impact Report: viewMode + Category Featured Image + Validators

## Summary
Add storefront display modes (grid / list / magazine), optional category featured images with `featuredEnabled`, and viewMode-aware validators/readiness. No route changes.

---

## 1. What could break

| Area | Risk | Mitigation |
|------|------|------------|
| **Existing storefront rendering** | Changing `PreviewData.categories` from `string[]` to objects could break consumers that expect names only. | Keep `categories: string[]`; add optional `categoryDetails?: CategoryDetail[]`. Normalize at read: if `categoryDetails` missing, derive from `categories` (names only). |
| **Publish-ready checks** | Current logic requires item image for "complete" product. List/magazine modes should not require item images. | Make product readiness viewMode-aware: grid = image recommended; list/magazine = image optional. Store-level readiness: magazine = category featured image required for categories that show a banner (or placeholder + incomplete reason). |
| **Store preview route** | None (no route changes). | N/A. |
| **API contracts** | Adding new fields could break strict clients. | Add optional `viewMode`, `categoryDetails` only; default `viewMode` to `'grid'` when missing. |
| **Assumption "every item has image"** | List/magazine layouts might assume `item.imageUrl`. | List: no item image slots. Magazine: optional small thumb; use `getItemPrice` and guard null/NaN everywhere. |

---

## 2. Why

- **Types**: Preview currently has `categories: string[]`. Backend draft already has `categories: [{ id, name }]`. Adding `categoryDetails` with `featuredImageUrl` and `featuredEnabled` is additive; frontend normalizes so missing = no featured image, `featuredEnabled` true by default.
- **Validators**: `computeProductReadiness` today counts image as required. List/magazine explicitly do not require item images; grid keeps current behavior (recommended, fallback allowed).
- **Magazine**: Categories with `featuredEnabled !== false` show a banner; if `featuredImageUrl` missing we show placeholder and mark store readiness incomplete (meaningful reason).

---

## 3. Impact scope

- **Dashboard**: `StorePreviewPage` (effectiveViewMode, list/magazine layouts), `StoreDraftReview` (product/store readiness viewMode-aware), preview types, new list/magazine components.
- **Core API**: `GET /api/store/:id/preview` and draft preview build: add `viewMode`, `categoryDetails` (optional); default viewMode to `'grid'`.
- **Existing stores**: No breaking change; missing viewMode/categoryDetails → treated as grid with categories as names only.

---

## 4. Smallest safe patch (implementation order)

1. **Types**: Add `StoreViewMode = 'grid' | 'list' | 'magazine'`; add `CategoryDetail { name, featuredImageUrl?, featuredEnabled? }`; extend `PreviewData` with optional `viewMode` and `categoryDetails`. Normalize: `viewMode ?? 'grid'`; `categoryDetails ?? categories.map(name => ({ name, featuredEnabled: true }))`.
2. **Backend**: In preview response and draft preview build, add `viewMode: 'grid'` and `categoryDetails` (from existing categories with null featuredImageUrl, featuredEnabled true) when not present.
3. **Validators**: Add `computeStoreReadiness(preview, viewMode)` returning `{ score, reasons }`. Product readiness: accept optional `viewMode`; when list/magazine, do not add "image" to missingItems for score (or reduce weight). Store readiness: for magazine, add reason "Missing category featured image" per category without image when featuredEnabled !== false.
4. **UI**: Implement list layout (compact rows: name, optional description, price, add-to-cart; no item images). Implement magazine layout (per-category section: optional featured banner or text-only header when `featuredEnabled === false`, then list rows; optional item thumb). Use `effectiveViewMode = (isMinimalPublicView && finalPreviewData.viewMode) ? finalPreviewData.viewMode : viewMode`; default local viewMode to `finalPreviewData.viewMode ?? 'grid'`.
5. **Guards**: Ensure all price display uses `getItemPrice` + `formatMoney`; no direct `item.price` rendering that could be NaN/undefined.

---

## 5. Backward compatibility

- **viewMode missing** → treat as `'grid'`.
- **categoryDetails missing** → derive from `categories` (string[]): each name becomes `{ name, featuredEnabled: true }`; no featured image.
- **Magazine + category without featuredImageUrl** → show neutral placeholder for banner; add to readiness reasons ("Missing category featured image for &lt;name&gt;").
- **category.featuredEnabled = false** → render category header text-only (no image slot).
