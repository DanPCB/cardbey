# Categories Generation + Auto-Categorize (Draft Review Only) – Fix Summary

## 1. Root cause

Categories were missing or showed only "Uncategorized" for two reasons:

1. **Backend shape:** `generateDraft` wrote `preview.categories = [profile.type]` — an array of **strings** (e.g. `["cafe"]`). The frontend expects `Category[]` with `{ id: string, name: string }`. When the UI did `categories.map(c => ({ id: c.id, name: c.name }))`, each `c` was a string, so `c.id` and `c.name` were undefined and the catalog ended up with categories that had no valid id/name. `buildIntentModel` and CategoryIndex then had nothing to show except "Uncategorized (N)" when products existed.

2. **No product→category link:** Products were not given `categoryId`, so even with one category in the list, products were treated as uncategorized.

So the bug was **backend writing the wrong shape** (strings instead of `{ id, name }`) and **not assigning product.categoryId**.

---

## 2. Canonical shape

- **Single source:** `draft.preview.categories` = `Array<{ id: string, name: string }>`.
- **Products:** `draft.preview.items` (or response `products`) with `product.categoryId` set to one of the category ids.
- GET response top-level `categories` is built from `preview.categories`; no extra category fields were added.

---

## 3. Files changed (minimal patch)

### Backend

**`apps/core/cardbey-core/src/services/draftStore/draftStoreService.js`**

- In `generateDraft` (Step 4):  
  - Define one category: `primaryCategoryId = cat_${draftId}_0`, `primaryCategoryName = profile.type || 'General'`.  
  - Set `preview.categories = [{ id: primaryCategoryId, name: primaryCategoryName }]`.  
  - Set `product.categoryId = primaryCategoryId` for every product, then set `preview.items = products`.
- New helpers (used only for auto-categorize):  
  - `recomputeDraftCategoriesFromItems(items)` — groups by `product.categoryName || product.category || product.categoryId`, returns `{ categories: [{ id, name }], items }` with each item’s `categoryId` set.  
  - `autoCategorizeDraft(draftId)` — loads draft, runs `recomputeDraftCategoriesFromItems` on `preview.items`, then `patchDraftPreview(draftId, { categories, items })` and returns updated draft.

**`apps/core/cardbey-core/src/routes/stores.js`**

- Import: `getDraft`, `autoCategorizeDraft` (in addition to existing `getDraftByGenerationRunId`).
- New route: `POST /:storeId/draft/auto-categorize` (optionalAuth).  
  - For `storeId === 'temp'`: require `generationRunId` in body or query; resolve draft via `getDraftByGenerationRunId`.  
  - Otherwise resolve draft via `resolveDraftForStore`.  
  - Call `autoCategorizeDraft(draft.id)`, then `getDraft(draft.id)`, and return the same shape as GET draft (ok, storeId, generationRunId, status, draftId, draft, store, products, categories).

### Frontend

**`apps/dashboard/cardbey-marketing-dashboard/src/lib/draftNormalize.ts`**

- Normalize `response.categories` to canonical `{ id, name }[]`:  
  - If element is object with `id` and `name`, use it (with fallbacks).  
  - If element is string, use `{ id: slugified(string), name: string }`.  
  - Otherwise `{ id: cat_${index}, name: 'Uncategorized' }`.  
  So legacy string categories from old drafts still render correctly.

**`apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx`**

- State: `isAutoCategorizing`.
- Handler: `handleAutoCategorize` — calls `apiPOST('stores/${effectiveStoreId}/draft/auto-categorize', { generationRunId })`, then `onRefresh()`, with loading and toast.
- UI: "Auto-categorize" button next to "Add Category" in the categories panel (Wand2 icon, disabled when no products or while request in flight).

---

## 4. Smoke test checklist

1. **New draft → products + categories present**  
   - Create a new store draft (quick start / jobId flow).  
   - Open `/app/store/temp/review?mode=draft&jobId=...`.  
   - **Expect:** Products list and categories panel both show; at least one category (e.g. business type) with products under it (or "Uncategorized (N)" if none assigned).  
   - In DevTools Network, GET `/api/stores/temp/draft?generationRunId=...` → response has `draft.preview.categories` as `[{ id, name }]` and `products` with `categoryId` set.

2. **Auto-categorize → updates and UI refreshes**  
   - On the same draft review page, click **Auto-categorize**.  
   - **Expect:** Request to POST `/api/stores/temp/draft/auto-categorize` with `{ generationRunId }`; success toast; draft refetches and category panel updates (e.g. categories recomputed from product names/fields).

3. **Refresh page → categories still there**  
   - Refresh the draft review page.  
   - **Expect:** Categories and products still match what was last saved (generation or auto-categorize).

---

## 5. Constraints respected

- No changes to hero/avatar logic.
- No changes to auth flow.
- No changes to published preview or storefront routes.
- No new duplicate category fields; only `draft.preview.categories` is used as canonical.
- Patch kept minimal and local to draft generation, draft normalization, and the new auto-categorize endpoint + button.
