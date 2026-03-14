# Image Source Map – Store + Menu Generation

Precise trace: data fields → API responses → UI mapping → rendered `<img src>`. No refactors; reference only.

---

## 1. Code paths

### Store generation (Create with AI → Generate)

- **Entry (frontend):** `StoreReviewPage` with `jobId` / `generationRunId`; orchestration starts via `runOrchestraJob` / `startOrchestraTask` (e.g. `ImproveDropdown`, `CreateStoreWithAutofill`). Job polling: `useOrchestraJobUnified` → `GET /api/mi/orchestra/job/:id`.
- **Backend:** `miRoutes.js` → `runBuildStoreJob` / orchestra worker; `draftStoreService.js` → `generateDraftTwoModes` → `buildCatalog` → `saveDraftBase` → **`finalizeDraft`**.
- **Image assignment during generation:**  
  **`draftStoreService.js`** `finalizeDraft` (lines ~211–250): loads `generateImageForDraftItem` from `menuVisualAgent.ts`; for first 30 items in batches of 5, calls `generateImageForDraftItem(p.name, p.description, styleName, opts)` and sets **`item.imageUrl`**, **`item.imageSource`**, **`item.imageQuery`**, **`item.imageConfidence`** on each item; then writes `preview` (with `items`) via status transition (no separate `patchDraftPreview` for this path). So **item images are written during generation** into `draft.preview.items[].imageUrl` (and metadata).
- **MI worker autofill (separate from initial generate):** **`miRoutes.js`** `runAutofillImages` (~1290–1375): uses `generateImageForDraftItem`, sets same four fields on items, then **`patchDraftPreview(draft.id, { items })`** to persist.

**References:**  
`apps/core/cardbey-core/src/services/draftStore/draftStoreService.js` (finalizeDraft, patchDraftPreview), `apps/core/cardbey-core/src/routes/miRoutes.js` (runAutofillImages), `apps/core/cardbey-core/src/services/menuVisualAgent/menuVisualAgent.ts` (generateImageForDraftItem).

### Menu item generation

- **Same as above:** menu items come from **`draft.preview.items`** (and optionally `preview.catalog.products`). Items are created in `buildCatalog` / template path; **images are attached in `finalizeDraft`** (and/or later via MI autofill worker). No separate “menu item generation” service; it’s draft generation + optional autofill.

### Menu item card rendering (Draft Review)

- **Component:** **`ProductReviewCard`** in `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/review/ProductReviewCard.tsx`.
- **Data flow:** **`StoreDraftReview.tsx`** builds `effectiveDraft.catalog.products`; for each product it resolves image with **`getItemImage(product, { itemImageMap, imageByKey: imageByStableKey })`** from **`lib/itemImageMapping.ts`**. Result is `displayImageUrl`; product is enhanced as `{ ...product, imageUrl: displayImageUrl ?? null }` and passed to `ProductReviewCard` with **`imageUrl={displayImageUrl}`**.
- **Rendered `<img src>`:** **`ProductReviewCard`** uses a `resolvedImageUrl` useMemo: **`imageUrl || product.imageUrl`** → if relative, prepend `window.location.origin`; else use as-is; fallback **`/placeholders/business-generic.svg`** when no URL. Final `<img src={resolvedImageUrl}>` at line ~264.

**References:**  
`StoreDraftReview.tsx` (getItemImage, displayImageUrl, ProductReviewCard), `itemImageMapping.ts` (getItemImage, buildImageByStableKey), `ProductReviewCard.tsx` (resolvedImageUrl, img src).

### Product edit modal image rendering

- **Component:** **`ProductEditDrawer`** in `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/review/ProductEditDrawer.tsx`.
- **Source:** **`getCurrentImageUrl()`**: 1) **`itemImageMap?.get(product.id)`** (SSE updates), 2) **`product.imageUrl`**, 3) **`product.images?.[0]`** if string and starts with `http`. Rendered as `<img src={currentImage}>` when present.

**References:**  
`ProductEditDrawer.tsx` (getCurrentImageUrl, img around line 789).

### Public storefront / preview grid (menu cards)

- **Page:** **`StorePreviewPage.tsx`**; data from **`previewData`** (from **`getDraftStore(draftId)`** → **GET /api/draft-store/:draftId** or store preview API).
- **Preview shape:** **`PreviewData`**: `items[]` (each with `imageUrl?`), **`images: string[]`** (legacy array; sometimes used as index-based fallback).
- **Per-card image:** For each item, **`itemWithImage.imageUrl ?? finalPreviewData.images?.[originalIdx + 1] ?? catalogPreviewData.images?.[i + 1] ?? undefined`**. So: **1) item.imageUrl**, **2) finalPreviewData.images by index**, **3) catalogPreviewData.images by index**. Passed to **`ProductCard`** as **`imageUrl={...}`**; **`ProductCard`** uses **`imageUrl`** directly as `<img src={imageUrl}>` or shows no image (no explicit placeholder constant).
- **Hero/avatar:** **`resolveStoreHeroImage`** / **`resolveStoreAvatarImage`** in **`lib/storeMedia.ts`**: heroImageUrl / hero.imageUrl → images[0] → items[0].imageUrl; avatar similarly (avatarUrl, brand.logoUrl, images[0], items[0].imageUrl).

**References:**  
`StorePreviewPage.tsx` (finalPreviewData, catalogPreviewData, itemWithImage.imageUrl, images?.[i+1]), `storeMedia.ts`, `ProductCard.tsx` (imageUrl prop → img src).

---

## 2. Image fields involved

| Location | Fields |
|----------|--------|
| **Backend draft (DraftStore.preview)** | `preview.items[].imageUrl`, `preview.items[].imageSource`, `preview.items[].imageQuery`, `preview.items[].imageConfidence`, `preview.hero.imageUrl`, `preview.avatar.imageUrl`, `preview.catalog.products` (same items) |
| **API GET /api/draft-store/:id** | Returns `draft.preview` (object or stringified); `preview.items[].imageUrl` etc. |
| **API GET /api/stores/:storeId/draft** | Same draft shape; products = `preview.items` with description normalized |
| **Frontend PreviewData (StorePreviewPage)** | `items[].imageUrl`, **`images: string[]`** (index-based fallback; images[0] = logo, images[i+1] ≈ item i in some flows) |
| **Draft Review (StoreDraftReview)** | `product.imageUrl`, `product.images[]`, **itemImageMap** (Map<productId, url> from SSE), **imageByStableKey** (from buildImageByStableKey(items)) |
| **ProductReviewCard** | Prop **`imageUrl`**; internal **`resolvedImageUrl`** (url or `/placeholders/business-generic.svg`) |
| **ProductEditDrawer** | **`product.imageUrl`**, **`product.images[0]`**, **itemImageMap.get(product.id)** |
| **ProductCard (public grid)** | Prop **`imageUrl`** → direct `<img src>` |
| **Hero/avatar** | **resolveImageUrl.ts**: getResolvedStoreHeroUrl, getResolvedStoreAvatarUrl (preview.hero, preview.avatar, store, meta, brand). **storeMedia.ts**: resolveStoreHeroImage, resolveStoreAvatarImage (heroImageUrl, images[0], items[0].imageUrl). |

---

## 3. Precedence order for image selection (UI)

### Draft Review (StoreDraftReview → ProductReviewCard)

1. **item.imageUrl** (on product from draft)
2. **item.images[0]** (if string)
3. **itemImageMap.get(item.id)** (SSE / live updates)
4. **imageByKey.get(stableKey)** (stable key from id/sku/name|categoryId|price)
5. **Placeholder:** `/placeholders/business-generic.svg` (inside ProductReviewCard when no URL).

### Public preview grid (StorePreviewPage → ProductCard)

1. **item.imageUrl**
2. **finalPreviewData.images[originalIdx + 1]** or **finalPreviewData.images[i + 1]** (index-based)
3. **catalogPreviewData.images[i + 1]** (when category filtered)
4. No explicit placeholder; missing → no image (gradient/color only).

### Product edit drawer

1. **itemImageMap.get(product.id)**
2. **product.imageUrl**
3. **product.images[0]** (if http)

### Hero / avatar (draft + public)

- Hero: **heroImageUrl** / **preview.hero.imageUrl** → **preview.images[0]** → **preview.items[0].imageUrl**.
- Avatar: **avatarUrl** / **preview.avatar.imageUrl** / **brand.logoUrl** → **preview.images[0]** → **preview.items[0].imageUrl**.

---

## 4. Dev-only logging (per rendered card)

- **Flag:** `localStorage.getItem('cardbey.debugImageSource') === 'true'` (dev-only; not shipped to production).
- **Where:**
  - **StoreDraftReview:** When mapping products to ProductReviewCard, uses **getItemImageWithSource**; for each card logs **itemId**, **itemName**, **resolvedImageSrc**, **rule** (`item` | `itemImages` | `itemImageMap` | `imageByKey` | `placeholder`). File: `src/features/storeDraft/StoreDraftReview.tsx`.
  - **StorePreviewPage:** When rendering ProductCard (grouped and non-grouped grid), for each item logs **itemId**, **itemName**, **resolvedImageSrc**, **rule** (`item` | `imagesArray` | `placeholder`). File: `src/pages/public/StorePreviewPage.tsx`.
- **Helper:** **getItemImageWithSource** in **lib/itemImageMapping.ts** returns `{ url, source }` for Draft Review; public page computes rule inline.

---

## 5. Network / APIs and hotlinking

- **Which API returns image fields:**  
  - **GET /api/draft-store/:draftId** – returns draft with **preview** (items[].imageUrl, hero, avatar).  
  - **GET /api/stores/:storeId/draft** – same draft shape for that store.  
  - **GET /api/store/:storeId/context** (or preview) – store-level hero/avatar and possibly products with imageUrl.
- **Hotlinking vs CDN:** Item images are **external URLs** (Pexels, OpenAI) stored in **item.imageUrl** and used directly as **`<img src="https://...">`**. We do **not** import them to our CDN in the current flow; we hotlink. Hero/avatar may be the same or relative `/uploads/` after upload; **resolveImageUrl** leaves absolute URLs as-is and prefixes relative with origin for dashboard.

---

## 5b. Image source priority: internal first, then Pexels, AI fallback only

**Policy:** (1) **Internal data 100% when available** — items that already have `imageUrl` or `images[0]` (from catalog, seed, or upload) are never overwritten. (2) **Pexels** (and Unsplash where used) for the majority of fills. (3) **AI (OpenAI)** only as fallback (~10–20%) to avoid token burn and unrealistic product images.

| Flow | Order | Where |
|------|--------|--------|
| **Draft item autofill** (runAutofillImages) | 1. **Skip** items with existing `imageUrl` or `images[0]` (internal). 2. **Pexels** (confidence ≥ `IMAGE_PEXELS_MIN_CONFIDENCE`, default 0.45). 3. **OpenAI** | `miRoutes.js` (toEnrich filter), `menuVisualAgent.ts` → `generateImageForDraftItem` |
| **Menu images** (generateImagesForMenu) | 1. **Pexels** → 2. **Unsplash** → 3. **OpenAI** | `menuVisualAgent.ts` → `generateImagesForMenu` |
| **Suggest-images candidates** | 1. **Pexels** (multi) → 2. **OpenAI** (single) | `generateImageCandidatesForDraftItem` |

- **Env:** **`PEXELS_API_KEY`** (core) so Pexels is used. **`IMAGE_PEXELS_MIN_CONFIDENCE`** (0.2–0.9, default 0.45) to accept more Pexels and reduce AI fallback.

---

## 6. Why duplicates happen + minimum change

**Why duplicates happen:**

1. **Backend pool reuse:** In **finalizeDraft** and **runAutofillImages**, we pass **usedUrls** (Set) and **generateImageForDraftItem** penalizes reuse (-0.2) and accepts first Pexels candidate with confidence ≥ `IMAGE_PEXELS_MIN_CONFIDENCE` (default 0.45); then OpenAI fallback if none. So the same URL can still be assigned to multiple items if the pool is small or many items score similarly (e.g. same query “food photo” for many items).
2. **Day-2 assignImages (frontend):** **assignImages.ts** uses a **single pool** (searchLibrary, POOL_LIMIT 48) and **pickNextFromPool()** with **MAX_REUSE_PER_URL = 2**. So the **same image URL is allowed for up to 2 items** by design; that produces visible “duplicates” when the pool is small or items are similar.
3. **Index fallback on public page:** **StorePreviewPage** uses **finalPreviewData.images[originalIdx + 1]** when **item.imageUrl** is missing. If **images[]** is built from a short list or by index, multiple items can map to the same **images[i]** (e.g. images[1] for several items if ordering doesn’t match).

**Minimum change to stop duplicates:**

- **Backend:** Keep **usedUrls** and confidence; optionally **lower MAX_REUSE_PER_URL to 1** in **assignImages.ts** (frontend Day-2 autofill) and/or **increase pool size / diversity** so more items get distinct URLs.  
- **Backend generation:** In **finalizeDraft** / **runAutofillImages** we already pass **usedUrls**; ensure **usedUrls** is shared across the full batch (already is in the loop). No change needed there for dedup.  
- **Public page:** Prefer **item.imageUrl** only; **remove or demote** index-based **images[i+1]** fallback so we never show the same image for multiple items by index. If we keep a fallback, build it from a **key-based** map (e.g. imageByStableKey) instead of **images[originalIdx + 1]**.

---

## 7. Conclusion: Are item images written during generation?

**Yes.** During **store/menu generation**:

- **finalizeDraft** (draftStoreService.js) writes **item.imageUrl** (and imageSource, imageQuery, imageConfidence) onto **preview.items** for up to 30 items, then saves the draft (status transition with preview).
- **runAutofillImages** (miRoutes.js) writes the same fields and persists via **patchDraftPreview(draft.id, { items })**.

So item images **are** written. They can **appear duplicated** because: (1) pool reuse allows the same URL for multiple items (backend + frontend assignImages), and (2) the public preview page sometimes falls back to **images[ index ]**, which can map several items to the same image. They do **not** “drop” in the sense of not being saved; they drop only when **no candidate passes confidence** (then item keeps no imageUrl) or when the UI uses a **wrong fallback** (e.g. index-based **images[]**).

**File reference summary**

| Purpose | File(s) |
|--------|---------|
| Generation image assignment | `apps/core/cardbey-core/src/services/draftStore/draftStoreService.js` (finalizeDraft), `menuVisualAgent.ts` (generateImageForDraftItem) |
| MI autofill + persist | `apps/core/cardbey-core/src/routes/miRoutes.js` (runAutofillImages), draftStoreService (patchDraftPreview) |
| Draft API response | GET handler in `apps/core/cardbey-core/src/routes/draftStore.js` / stores.js (draft-store, stores temp draft) |
| Draft Review card image | `itemImageMapping.ts` (getItemImage), `StoreDraftReview.tsx`, `ProductReviewCard.tsx` |
| Edit drawer image | `ProductEditDrawer.tsx` (getCurrentImageUrl) |
| Public grid image | `StorePreviewPage.tsx` (itemWithImage.imageUrl, finalPreviewData.images), `ProductCard.tsx`, `storeMedia.ts` |
| Hero/avatar | `resolveImageUrl.ts`, `storeMedia.ts` |
| Day-2 autofill (pool) | `apps/dashboard/cardbey-marketing-dashboard/src/lib/images/assignImages.ts` |
