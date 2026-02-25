# Code Audit: Image Generation Mismatch (Union Road Sweets → Shoes/Bags)

**Scope:** Root causes of wrong-vertical images (e.g. sweets store showing shoes, bags) and why “Repair wrong images” fixes only hero/avatar. **No code changes in this document—suggestions only.**

---

## 1. Executive Summary

| Issue | Root cause (where) | Severity |
|-------|--------------------|----------|
| Product images are shoes/bags for a sweets store | Draft generation uses **product name + description** for image search; store name/vertical not used. Generic names (“retail 1”) → generic stock (shoes). | **P0** |
| Store name “sweets” not driving template or image search | Core draft service infers template from profile name but **no keyword for “sweets”/“desserts”/“mithai”**; falls back to retail/general. | **P0** |
| “100% ready to publish” despite wrong images | Readiness checks **presence of imageUrl only**, not vertical/correctness. | **P1** |
| Repair fixes only 2 images (hero/avatar) | (a) Backend **replaces preview.items entirely**; sending 30 items with only 2 imageUrl cleared the rest. (b) Provider query was too long (negative terms) so product search often returned no results. | **P0** (merge fix and skipNegativeTerms applied) |
| product.name undefined → TypeError | Draft/API can return products without `name`; UI called `.trim()` without guard. | **P1** (guard applied in ProductReviewCard) |

---

## 2. Data Flow (Where Images Come From)

### 2.1 Initial draft generation (Core)

**File:** `apps/core/cardbey-core/src/services/draftStore/draftStoreService.js`

- **Products:** Built from template (e.g. `templateItems[templateKey]`) or fallback 30 items named `${profile.type || 'Product'} ${i+1}` (e.g. “retail 1”, “Product 1”).
- **Template key** comes from:
  - `input.templateId`, or
  - `profile.type` mapped (cafe, bakery, florist, restaurant, **retail**, general), or
  - **Inference from profile.name** (lines 339–345): only `cafe`, `restaurant`, `bakery`, `florist` are matched by regex. **No “sweets”, “desserts”, “mithai”, “indian sweets”.**
- So for “Union Road sweets”, name inference does **not** set a food template; type often stays “retail”/“general” → product names “retail 1”, “retail 2”, etc.

**Image assignment (same file, ~363–391):**

- For each product: `generateImageUrlForDraftItem(p.name, p.description, styleName)`.
- **Inputs to image search:** product **name**, product **description**, **style** (warm/modern/vibrant/minimal). **Store name and business type are not passed** to this call.
- So search is effectively “retail 1 Quality item modern” (or similar) → Pexels returns generic retail/stock (shoes, bags, etc.).

**Hero/avatar:**

- Hero: `generateHeroForDraft({ storeName: profile.name, businessType: profile.type })` → **does** use store name (e.g. “Union Road sweets hero banner”), so hero can be correct.
- Avatar: first product with an image → if first product is a shoe, avatar is a shoe.

**Conclusion:** The **single biggest cause** of wrong product images is that **draft generation never uses store name or vertical when searching for product images**; it uses only product name + description + style. Generic product names produce wrong-vertical results.

---

## 3. Menu visual agent (product image search)

**File:** `apps/core/cardbey-core/src/services/menuVisualAgent/menuVisualAgent.ts`

- `generateImageUrlForDraftItem(name, description, styleName)` builds:
  - `searchText = [name, descSnippet, styleKeywords].filter(Boolean).join(' ').slice(0, 200)`.
- Then calls Pexels (or OpenAI) with that string. **No store name, no business type, no vertical.**
- So “retail 1”, “Quality item”, “modern” → Pexels returns whatever matches (often shoes/office/retail).

**Suggestion:** Add an optional parameter (e.g. `storeContext: { storeName?: string; businessType?: string }`). When present, prepend or append vertical-related terms (e.g. from store name: “sweets”, “desserts”) to the search text so the API returns on-vertical results. Alternatively, call a small classifier that maps store name/type → “food” and append “desserts” or “sweets” to the query.

---

## 4. Readiness / “100% ready to publish”

**Files:**  
- `apps/dashboard/cardbey-marketing-dashboard/src/lib/storeReadiness.ts`  
- `StoreDraftReview.tsx` (e.g. ~4038–4041)

- **Store readiness:** `computeStoreReadiness()` checks (for grid): “all items have imageUrl?” and “category featured image if magazine?”. It does **not** check whether imageUrl is correct for the store vertical.
- **Display completion:** `displayCompletion = (jobCompleted && hasMinimumForPublish) ? 100 : Math.min(100, completion)`. So when the MI job is completed and there is a name, visuals, categories, and products, the UI shows **100%** regardless of image content.

**Suggestion:** Either:
- Document that “100%” means “all required fields present,” not “content is correct,” and add a separate warning when vertical guard fails for hero/avatar or many products (e.g. “Some images may not match your store type—use Repair wrong images”), or
- Extend readiness to include a “vertical match” check (e.g. run guard on hero/avatar and sample of product imageUrls and reduce or cap readiness if many fail).

---

## 5. Repair wrong images (why only 2 fixed)

**Already addressed in code (for reference):**

1. **Backend replaces `preview.items` entirely**  
   `patchDraftPreview` merges incoming preview with existing, but when the client sends `preview.items: [ ...30 items... ]`, the backend **replaces** the whole array. Sending 30 items where only 2 had `imageUrl` (hero/avatar are separate) meant the other 28 items were stored with no imageUrl → “rest unfixed” and data loss.  
   **Fix applied:** Frontend now **merges** repair result with existing `draftForDay2Assign.preview.items` and sends only updated fields per item so unfixed items are not overwritten.

2. **Provider query too long**  
   `buildProviderQuery()` was appending all negative terms (e.g. “-shoe -shoes -trainer ...”) so the photo API received a very long string and often returned no results.  
   **Fix applied:** `skipNegativeTerms: true` for the provider call; guard still filters results when picking.

**Remaining risk:** If the draft’s `meta.storeName` is missing and only `brand.name` is set on the frontend, the repair path must receive store name from somewhere (e.g. `draftForDay2Assign` merging `brand.name` into `meta.storeName`). That merge is already in place in StoreDraftReview.

---

## 6. product.name undefined

**File:** `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/review/ProductReviewCard.tsx`

- Some products can have `name: undefined` (e.g. from API or incomplete catalog). Calling `product.name.trim()` threw.  
**Fix applied:** Use `(product.name ?? '').trim()` and display `product.name ?? 'Product'`.

**Suggestion:** Ensure the **source of truth** for products (draft generation and any API that returns draft/catalog) **always** sets `name` (e.g. fallback “Product” or “Item N”) so the UI does not depend on defensive null checks alone.

---

## 7. Recommended Fix Order (No Coding Here—Priorities Only)

| Priority | What | Where | Note |
|----------|------|-------|------|
| **P0** | Use store context (name/type) when generating **product** images at draft creation | Core: `draftStoreService.js` + `menuVisualAgent.ts` | Pass store name/type or vertical into `generateImageUrlForDraftItem` and add “sweets”/“desserts” (or vertical term) to search text when store is food. |
| **P0** | Extend name-based template inference to sweets/desserts | Core: `draftStoreService.js` (profile name regex) | Add e.g. `/\bsweets?\b|\bdesserts?\b|\bmithai\b|\bindian\s+sweets?\b/i` and map to a food/bakery template and product naming. |
| **P1** | Readiness / “100%” | Dashboard: `storeReadiness.ts` or StoreDraftReview | Either document “100% = fields present” and add a vertical-mismatch warning, or add a vertical-check step and cap/warn. |
| **P1** | Guarantee product.name in draft/API | Core: draft generation + any API returning catalog | Ensure every product has `name` set (fallback “Product” or “Item N”). |

---

## 8. Files to Touch for P0 Fixes (Reference Only)

- **Core – draft generation:**  
  `apps/core/cardbey-core/src/services/draftStore/draftStoreService.js`  
  - Name inference (sweets/desserts).  
  - Call to `generateImageUrlForDraftItem`: pass store name/type or a “vertical” hint.

- **Core – image search for draft items:**  
  `apps/core/cardbey-core/src/services/menuVisualAgent/menuVisualAgent.ts`  
  - `generateImageUrlForDraftItem`: add optional store/vertical context and include it in the Pexels (and OpenAI) search text so product images match the store type.

This audit does not implement any of the above; it only reports causes and suggests fixes.
