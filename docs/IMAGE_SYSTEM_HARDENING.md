# Image System Hardening (Final Clean State)

**LOCKED RULE:** No refactors. Only stability fixes. Warn before risky change.

## 1) Item cards use getItemImage(item, { imageByKey }) — confirmed

All item cards that render from draft/public preview use key-based resolution only:

| Location | Usage |
|----------|--------|
| **StorePreviewPage** | `getItemImageWithSource(item, { imageByKey: imageByStableKey })` and `getItemImage(..., { imageByKey: imageByStableKey })`; `imageByStableKey = buildImageByStableKey(finalPreviewData.items)` |
| **StoreDraftReview** | `getItemImageWithSource(product, { itemImageMap, imageByKey: imageByStableKey })`; `imageByStableKey = buildImageByStableKey(effectiveDraft.catalog?.products ?? [])` |
| **MobileGrid** | `getItemImage(item, { imageByKey })` when `imageByKey` is passed (from parent) |
| **ImageFirstGrid** | Same as MobileGrid |

There is **no index-based fallback** (e.g. no `images[i]` for item at index `i`).  
`ContentStudioHome` and `MenuItemCard` use item-owned fields only (`item.imageUrl`, `item.images[0]`, etc.) for their own contexts; they do not use a shared image pool or index.

---

## 2) assignImages.ts — dedupe and MAX_REUSE_PER_URL = 1

**Already in place (verified):**

- **Canonical key:** `getImageKey(candidate)` returns:
  - `id:${candidate.id}` when provider/library id is present;
  - otherwise `origin + pathname` (query params stripped).
- **Dedupe:** `usedImageKeyCount` is keyed by `getImageKey(c)`. Before assigning a candidate we check `count < MAX_REUSE_PER_URL` (1).
- **MAX_REUSE_PER_URL = 1:** So each canonical key is used at most once.

**Patch applied:**

- Comment above `getImageKey` clarified: deduplicate by provider photo ID or canonicalized URL; MAX_REUSE_PER_URL = 1 enforces one assignment per canonical key.
- Dev-only log when a candidate is skipped because the canonical key has already been used: `[imageFill] skip duplicate by canonical key`.

---

## 3) Dev-only stableKey collision log

**File:** `src/lib/itemImageMapping.ts` — `buildImageByStableKey`.

When building the map, if a stable key is already present and the new item has a **different** URL for that key, multiple items share the same key (collision). In that case we now log (dev only):

```ts
console.warn('[itemImageMapping] stableKey collision: multiple items share key', { key, existingUrl, newUrl, itemId, itemName });
```

Behavior unchanged: last item wins (`map.set(key, trimmed)`). The log helps detect duplicate keys (e.g. same name|category|price for different products).

---

## 4) Store hero never used as fallback for product cards

**Confirmed:** `getItemImage` / `getItemImageWithSource` only use, in order:

1. `item.imageUrl`
2. `item.images[0]`
3. `itemImageMap.get(item.id)` (when provided)
4. `imageByKey.get(stableKey)` (when provided)

There is no reference to hero or store-level hero URL. Comment added in `itemImageMapping.ts`: *"Store hero is NEVER used as fallback for product cards."*

---

## Patch summary (diff)

### `apps/dashboard/cardbey-marketing-dashboard/src/lib/itemImageMapping.ts`

- **buildImageByStableKey:**  
  - Dev-only: when a key already exists in the map with a different URL, log `[itemImageMapping] stableKey collision: multiple items share key` with key, existingUrl, newUrl, itemId, itemName.  
  - Comment updated: last-one-wins and dev log on collision.
- **getItemImage / getItemImageWithSource:**  
  - Comment added: "Store hero is NEVER used as fallback for product cards."

### `apps/dashboard/cardbey-marketing-dashboard/src/lib/images/assignImages.ts`

- **getImageKey:**  
  - Comment clarified: dedupe by provider photo ID or canonicalized URL; MAX_REUSE_PER_URL = 1 enforces one assignment per canonical key.
- **pickNextFromPool:**  
  - When skipping a candidate because `count >= MAX_REUSE_PER_URL`, dev-only log: `[imageFill] skip duplicate by canonical key`.

---

## Root cause (why this matters)

- **Index-based mapping:** Using array index to match items to images causes wrong image on reorder or when items are added/removed. All draft/public grids already use stable keys only; no index fallback remains.
- **Duplicate images across items:** Without canonical URL dedupe, the same photo (e.g. `?w=800` vs `?w=200`) can be assigned to multiple items. assignImages already dedupes by `getImageKey` and enforces MAX_REUSE_PER_URL = 1; the new log makes skip-by-canonical-key visible in dev.
- **Stable key collisions:** If two items share the same stable key (e.g. no id, same name/category/price), only one gets an image in the map. We now log when a second item overwrites with a different URL so collisions are visible.
- **Hero as product fallback:** Using the store hero when a product has no image would show the same hero on many cards. Hero is not in the product resolution path; comment added to lock that contract.

---

## Verification steps

### Manual test scenario (30-item menu)

1. **Generate 30-item menu** (Create with AI → e.g. café/bakery with many items).
2. **Draft Review:**  
   - Open draft review; confirm every product card shows an image or placeholder.  
   - No card should show the store hero as its image.  
   - In console (dev): ensure there are no `[itemImageMapping] stableKey collision` logs unless you intentionally created items with same name/category/price (then expect one log per collision).
3. **Assign images (Day 2 / Auto Image):**  
   - If you trigger assignImages (e.g. “Auto Image” or library-based fill): in dev console you may see `[imageFill] skip duplicate by canonical key` when the pool has repeated canonical URLs; each product should still get at most one unique image per canonical key.
4. **Count duplicates:**  
   - In draft review and public preview, count how many product cards share the exact same image URL.  
   - Expect: with MAX_REUSE_PER_URL = 1, no two products should receive the same canonical image from assignImages. (Items that already had the same URL from generation are unchanged.)
5. **Public Store Preview:**  
   - Publish (or open preview by draftId).  
   - Confirm product grid matches draft review (same image per item, no hero on cards).
6. **Edit Drawer:**  
   - Open product edit drawer for several items; confirm image shown is the one for that item (by id/stable key), not another item’s.

### Quick checks

- Search codebase for `images[i]` or `items[i].image` used for display: **none** (no index-based fallback).
- Search `getItemImage` / `getItemImageWithSource`: all call sites in StorePreviewPage, StoreDraftReview, MobileGrid, ImageFirstGrid pass `imageByKey` (or `itemImageMap` + `imageByKey`).
- Search for “hero” in `itemImageMapping.ts`: **no** use of hero in product resolution.

---

## Files touched

- `apps/dashboard/cardbey-marketing-dashboard/src/lib/itemImageMapping.ts`
- `apps/dashboard/cardbey-marketing-dashboard/src/lib/images/assignImages.ts`
- `docs/IMAGE_SYSTEM_HARDENING.md` (this file)
