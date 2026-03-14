# Output Quality & Publish Readiness — Root Cause & Fixes

**Goal:** Fix vertical/template correctness (e.g. bakery shows bakery products, not cafe items) and make publish blockers actionable (exact missing fields + clear copy).

---

## 1. Root cause of wrong catalog content

### What was happening

- **Bakery** stores were showing **cafe/restaurant** items (e.g. "House Salad", "Soup of the Day") instead of bakery-appropriate products (Croissant, Sourdough Bread, Cake Slice, etc.).
- **Florist** and other verticals were already correct when the template key was resolved from profile/name; the bug was specific to **food sub-verticals** (food.bakery, food.restaurant, etc.).

### Exact cause

1. **Template key not resolved from vertical slug for food**  
   In `apps/core/cardbey-core/src/services/draftStore/draftStoreService.js`, the code only called `selectTemplateId(verticalSlugInput)` when **`!isFood && templateKey === 'cafe'`**. So when the classified vertical was **food.bakery** (`verticalSlugInput === 'food.bakery'`), `isFood` was true and we **never** overrode `templateKey`. The key stayed whatever it was from profile/input (often default or **cafe**), so the catalog used **cafe** template items (House Salad, Soup of the Day, etc.).

2. **Seed catalog builder (fallback path)**  
   In `apps/core/cardbey-core/src/services/store/seeds/seedCatalogBuilder.js`, `buildFoodSeed` only branched on **food.cafe** (for drinks). All other food verticals used the same generic **restaurant** list (Starters/Mains/Sides with House Salad, Soup of the Day, etc.). So when the seed builder was used for a bakery, it still produced restaurant-style items.

### Files involved

- **draftStoreService.js** — template key resolution (line ~858–862): only non-food verticals could override `templateKey` from `verticalSlugInput`.
- **seedCatalogBuilder.js** — `buildFoodSeed`: no bakery-specific categories/items.
- **verticalTaxonomy.js** — already defines `food.bakery` and keywords; no change.
- **selectTemplateId.js** — already returns `food_bakery` for `food.bakery`; no change.
- **templateItemsData.js** — already has `food_bakery` and `bakery` lists; no change.

---

## 2. Smallest safe fix (vertical correctness)

### A. draftStoreService.js

- **Change:** When `verticalSlugInput` is set, **always** resolve `templateKey` from it via `selectTemplateId(verticalSlugInput, audience)` (including for food). Removed the `!isFood && templateKey === 'cafe'` condition so **food.bakery** → `food_bakery` and the catalog uses bakery items from `getTemplateItems('food_bakery')`.
- **Audience:** Pass `profile.audience` when present so fashion/kids still get the right template.

### B. seedCatalogBuilder.js

- **Change:** In `buildFoodSeed`, added **`isBakery = slug === 'food.bakery'`**. When true, use bakery-appropriate category names (Pastries, Bread & Loaves, Sweets, Drinks, Desserts) and item names (Croissant, Danish, Sourdough Bread, Baguette, Cookie, Cake Slice, Coffee, etc.) instead of Starters/Mains/House Salad/Soup of the Day.

### C. Publish validation (actionable message)

- **StoreDraftReview.tsx**
  - **Price acceptance:** A product is considered to have a price if `priceV1?.amount != null` **or** (menuOnly && p.price) **or** `typeof p.price === 'string' && p.price.trim().length > 0`. So template items with `price: '$3.00'` now count toward "at least one product with name and price" and publish readiness is not stuck purely on `priceV1`.
  - **Actionable copy:** Added `publishValidationDetails` (useMemo) that computes:
    - missing name (store name empty)
    - count of products missing name
    - count of products missing price (for products that have a name)
    - count of products missing category
    - A single **message** string, e.g. `"Add: store name; 3 product(s) missing price; 5 product(s) missing category"`.
  - **Where used:**  
    - When user clicks Publish and validation fails: toast shows `publishValidationDetails.message` instead of a generic "Store name is required" / "Store must have at least one product with name and price".  
    - Publish button `title` when disabled (and not guest): shows the same message so users see exactly what to add before publishing.

---

## 3. Exact publish validation requirements

To be able to publish, the draft must satisfy **all** of:

| Requirement | Check | UI message when missing |
|-------------|--------|-------------------------|
| Store name | `effectiveDraft.meta?.storeName` non-empty after trim | "Add: store name" (or part of combined message) |
| At least one product | `catalog.products.length > 0` | "Add: at least one product" |
| That product has a name | For ≥1 product: `p.name` non-empty after trim | "N product(s) missing name" |
| That product has a price | For ≥1 product: `p.priceV1?.amount != null` or (menuOnly && p.price) or non-empty string `p.price` | "N product(s) missing price" |
| Category (informational in message) | Products without `categoryId` are counted and listed in the message | "N product(s) missing category" |

**Note:** Category is **not** a hard blocker for publish (the button can be enabled with products missing category). The message still tells the user how many products are missing category so they can fix them if desired. If you want category to be required for publish, the same `publishValidationDetails` structure can be used to add that rule.

---

## 4. Exact copy improvement for the publish blocker

- **Before:** Generic toasts: "Store name is required", "Store must have at least one product with name and price". Button title: "Add store name and at least one product with name and price to publish".
- **After:**  
  - Toasts and button title use **`publishValidationDetails.message`** when draft is not ready, e.g.:
    - "Add: store name"
    - "Add: at least one product"
    - "Add: 3 product(s) missing name"
    - "Add: 2 product(s) missing price; 4 product(s) missing category"
    - "Add: store name; 5 product(s) missing price"
  - Fallback if message is null: "Store name is required" / "Add at least one product with name and price" / "Add store name and at least one product with name and price to publish".

---

## 5. Manual verification checklist

### Bakery

- [ ] Start a **guest mission** with business type/name that classifies as **bakery** (e.g. "Bakery", "Joe's Bakehouse").
- [ ] Complete the mission and open **temp draft review**.
- [ ] **Catalog:** Product list shows bakery-appropriate items (e.g. Croissant, Sourdough Bread, Cinnamon Roll, Muffin, Cake Slice, Baguette, Cookie, Danish) and **not** House Salad, Soup of the Day, or other cafe/restaurant-only items.
- [ ] **Publish:** If store name and at least one product with name and price are present, Publish is enabled (or "Sign in to publish" for guest). If something is missing, the disabled Publish button title or toast shows the specific "Add: …" message (e.g. "Add: store name" or "Add: 2 product(s) missing price").

### Florist

- [ ] Start a guest mission that classifies as **florist** (e.g. "Union Road Florist").
- [ ] Complete and open temp draft review.
- [ ] **Catalog:** Products are florist-appropriate (e.g. Mixed Bouquet, Rose Arrangement, Sympathy Wreath, Tulip Bouquet) and not cafe/bakery items.
- [ ] **Publish:** Same as above; when validation fails, message is actionable (store name, product name/price/category counts as applicable).

### Publish readiness and 50%

- [ ] With a draft that has store name and products that have name + price (string or priceV1): **Publish** button is enabled (when signed in); readiness % can still be &lt; 100% (e.g. missing images/tags) but publish is **not** blocked by that.
- [ ] With a draft missing store name or all products missing name/price: **Publish** is disabled and the tooltip/message clearly states what to add (store name and/or product name/price/category counts).

---

## Summary

| Item | Result |
|------|--------|
| **Root cause of wrong catalog** | Template key was only overridden from vertical slug when `!isFood && templateKey === 'cafe'`, so food.bakery kept cafe template. Seed builder had no bakery branch. |
| **Smallest safe fix** | (1) draftStoreService: resolve `templateKey` from `verticalSlugInput` for all verticals (including food). (2) seedCatalogBuilder: add bakery categories/items in `buildFoodSeed` when slug === 'food.bakery'. (3) StoreDraftReview: accept string `price` for publish readiness; add `publishValidationDetails` and use its message in toasts and Publish button title. |
| **Publish validation requirements** | Store name; ≥1 product; that product has name and price (priceV1.amount or menuOnly+price or non-empty string price). Message can also list product(s) missing name, price, category. |
| **Copy improvement** | Replaced generic "Store name is required" / "Store must have at least one product with name and price" with "Add: store name", "Add: N product(s) missing name/price/category" as applicable. |
