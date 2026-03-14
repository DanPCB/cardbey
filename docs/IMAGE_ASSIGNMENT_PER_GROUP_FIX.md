# Image Assignment Per-Group Fix (Cross-Category Contamination)

**Problem:** Image mismatch (e.g. burger image assigned to pedicure).  
**Goal:** Isolate image assignment per semantic group so beauty never gets food images and food never gets salon images.

---

## Root cause: shared pool in assignImages (Day 2)

### Previous pool behavior

- **assignImages (dashboard)** is used for "Auto Image" / Day 2 autofill from the **library** (seed data + searchLibrary).
- It built **one global pool** from a **single store-level query**:
  - `buildPoolQuery(vertical, storeName)` → e.g. `"StoreName dessert product photo"` (food) or `"StoreName product photo"` (generic).
- **All products** were then assigned images from that **same pool** in catalog order: first product got pool[0], second got pool[1], etc.
- When the store had **mixed categories** (e.g. nails + food) or the single query returned **mixed or generic** results, later products could receive images that belonged to a different category (e.g. burger for pedicure) because:
  1. The pool was not category-specific.
  2. Once the "good" images for a category were used by earlier items, the rest of the pool (or leftover generic results) was assigned to later items regardless of their category.

So the **mismatch came from distributing one shared list across all products** instead of restricting each product to candidates that match its category/group.

### runAutofillImages (backend)

- **runAutofillImages** does **not** use a shared pool. It calls **generateImageForDraftItem(name, description, styleName, opts)** **per item**, with `categoryHint` / `categoryName` in opts. Each item gets its own image from the image API (e.g. Pexels/Unsplash) based on that item’s name and category.
- So backend autofill is already per-item. Any mismatch there would be from the **image API or query building** (e.g. query too generic or API returning a wrong result), not from pooling. No change was made to runAutofillImages in this patch.

---

## Change: per-group pools in assignImages

**File:** `apps/dashboard/cardbey-marketing-dashboard/src/lib/images/assignImages.ts`

1. **Semantic group key**  
   - Each product is assigned a **group key**: category label if available, otherwise a slug from the product name (first 1–2 words), otherwise `"other"`.

2. **Pool per group**  
   - For each group key we build a **separate candidate pool** with a **category-specific query**:
     - `buildPoolQueryForGroup(vertical, storeName, groupKey)` → e.g. `"nails product photo"`, `"pedicure service product photo"`, `"burger food dish product photo"`.
   - `searchLibrary({ q: query, category: groupKey, limit: POOL_LIMIT })` is called **per group**; results are filtered by vertical guard and (for food) scored. No pool is shared across groups.

3. **Assign only within group**  
   - When assigning an image to a product, we only pick from **that product’s group pool** (`pickNextFromGroupPool(groupKey)`).  
   - **No fallback** from another group: if the group pool is exhausted, the product is left **without an image** (placeholder). We do **not** borrow from other categories.

4. **MAX_REUSE_PER_URL = 1**  
   - Still enforced **globally** via `usedImageKeyCount` (canonical provider key / URL). So the same image is never assigned to two products, even across groups.

5. **Hero/avatar**  
   - Hero and avatar still use a **store-level** pool (`buildPoolQuery(vertical, storeName)`), built once and not shared with product groups. So product assignment is isolated; hero/avatar logic is unchanged in spirit.

6. **Dev-only debug**  
   - For each assignment: log `itemId`, `itemName`, `category`, `groupKey`, `chosenImageKey`, `assigned`.  
   - When a group pool is exhausted: log `"group pool exhausted, leaving placeholder"` with item and group.  
   - **Semantic mismatch warning:** if the chosen candidate’s title/alt/tags look unrelated to the product category (e.g. beauty category but candidate text contains food terms, or the reverse), log a **warning** so it can be spotted in dev.

---

## Acceptance criteria (addressed)

- **Beauty store** never gets food images: beauty products are in groups like "nails", "pedicure"; their pools are built from beauty-related queries only.  
- **Food store** never gets salon images: food products are in food groups; their pools are food-specific.  
- **Insufficient images:** if a group’s pool is exhausted, we leave the product without an image (placeholder) instead of assigning from another category.  
- **No regression:** draft preview and public preview still resolve images by stable key; only the **source** of assigned URLs (per-group vs one pool) changed. Hero/avatar and kids path unchanged.

---

## Verification

1. **Beauty store:** Create/store with nails, pedicure, manicure. Run Auto Image (Day 2). Confirm no food/dessert images on beauty items.  
2. **Food store:** Store with burgers, drinks, desserts. Run Auto Image. Confirm no salon/beauty images on food items.  
3. **Mixed store:** e.g. spa with both "Facial" and "Green Smoothie". Confirm each gets images from its own group only.  
4. **Exhausted pool:** Use a category with very few library results; confirm products in that group show placeholder when pool is empty, and no image from another group is used.  
5. **Dev console:** With dev build, check for `[imageFill]` logs (itemId, itemName, category, groupKey, chosenImageKey) and for any `[imageFill] possible semantic mismatch` warnings.

---

## Files touched

- `apps/dashboard/cardbey-marketing-dashboard/src/lib/images/assignImages.ts`  
  - Added `getGroupKey`, `buildPoolQueryForGroup`, `semanticMismatchWarning`.  
  - Replaced single global pool with per-group pools (`groupPools`, `getOrCreateGroupPool`, `pickNextFromGroupPool`).  
  - Hero/avatar still use `pickNextFromPool()` with a dedicated store-level pool.  
  - Non-kids product loop now assigns only from the product’s group; on exhausted pool, leaves placeholder and logs (dev).  
  - Dev logs and semantic mismatch warning as above.  
- `docs/IMAGE_ASSIGNMENT_PER_GROUP_FIX.md` (this file).

**runAutofillImages** (backend): unchanged; it already does per-item generation with category hints.
