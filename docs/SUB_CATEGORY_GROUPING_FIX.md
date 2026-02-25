# Sub-Category Grouping Fix – Diff Summary

## Files changed

### 1. `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/review/subCategoryGrouping.ts`

- **Added `getIntentKey(product, categoryName?)`**  
  Single normalized intent resolver used for bucketing and ordering:
  - Reads, in order: `product.intent` → `product.intentSection` → `product.intentKey` → `product.type` → `product.kind`.
  - Normalizes with `toLowerCase().trim()`; handles `undefined`/`null`.
  - If none set: infers from tags (service/food/drink) or category name (food/drink), else returns `'buy'`.

- **Bucket keyword lists**  
  - Food: `FOOD_INTENT_KEYS` = eat, drink, food, beverage, menu, meal, dish, drinks, foods.  
  - Products: `PRODUCTS_INTENT_KEYS` = buy, product, products, shop, shopping, retail.  
  - Services: `SERVICES_INTENT_KEYS` = discover, book, booking, service, services, appointment, consultation.

- **`getSubCategoryBucket`**  
  Now uses `getIntentKey(product, categoryName)`:
  - Food: `getIntentKey` in food set or `tagsContainFoodOrDrink(product)`.
  - Services: `getIntentKey` in services set or `isServiceProduct(product)`.
  - Products: `getIntentKey` in products set or fallback.

- **`getIntentForProduct`**  
  Uses `getIntentKey` and maps to eat/drink/buy/book/discover for ordering within buckets.

- **`tagsContainFoodOrDrink(product)`**  
  New helper: true if any tag matches EAT_KEYWORDS or DRINK_KEYWORDS.

### 2. `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx`

- **DEV-only logging (step 1)**  
  - `useRef` + `useEffect` when `groupingMode === 'categories'` and `displaySections.length > 0`.  
  - Logs first 3 products of the first section once per section/data change.  
  - Logged shape: `id`, `name`, `intent`, `intentSection`, `intentKey`, `type`, `kind`, `categoryId`, `tags`, `keys` (all product keys).  
  - Console label: `[StoreDraftReview] Categories view – first 3 products (DEV):`.

- **No other changes**  
  Categories-mode rendering already uses `groupProductsBySubCategory`, `SUB_CATEGORY_ORDER`, `SUB_CATEGORY_LABELS` and renders Food → Products → Services sub-headings only when a bucket has items. Intent Sections mode unchanged.

## Product fields used for intent detection (step 1 → step 2)

- **Primary (in order):**  
  `product.intent` → `product.intentSection` → `product.intentKey` → `product.type` → `product.kind`  
  All normalized with `toLowerCase().trim()`.

- **Fallbacks (no explicit intent field):**  
  - `product.type === 'service'` or tags matching BOOK_KEYWORDS → services.  
  - Category name matching DRINK_KEYWORDS/EAT_KEYWORDS → drink/eat.  
  - Tags matching EAT_KEYWORDS/DRINK_KEYWORDS → food.  
  - Default: `'buy'` → products bucket.

Runtime confirmation: after deploying, open Draft Review → Group by: Categories and check the browser console for `[StoreDraftReview] Categories view – first 3 products (DEV):` to see which of these fields are present and their values; bucketing is implemented to use whatever exists (intent/intentSection/intentKey/type/kind/tags/category).

## Verification checklist

- Draft Review → Group by: Categories: under each category (e.g. cat_0), sub-section headings **Food**, **Products**, **Services** appear only for non-empty buckets; order is always Food → Products → Services.
- Buy items → under **Products**; Discover/service-like → under **Services**; Eat/Drink/food-like → under **Food** (Food first).
- Intent Sections mode unchanged.
- No backend/API/hero/avatar/auth/routing/published-preview changes.
