# Image Autofill (Day 2)

Optional image-enrichment module: internal library + one pluggable provider (Pexels), text-similarity ranking, mismatch guard, and a single-shot “Auto-fill missing images” action. **Does not change** the store creation spine (Quick Create → Draft Review → Publish → Live).

## Enable / disable

- **Enable (dev):**  
  - `localStorage`: set `cardbey.imageAutofill = "1"`  
  - Or env: `VITE_ENABLE_IMAGE_AUTOFILL=true`
- **Provider (optional):**  
  - `VITE_IMAGE_PROVIDER=pexels` (default)  
  - `VITE_IMAGE_PROVIDER_KEY=<your-pexels-api-key>`
- **Repair mode (Phase-1 safety):** Replace existing images that fail vertical guard. Env: `VITE_ENABLE_IMAGE_AUTOFILL_REPAIR=true` or `localStorage.setItem('cardbey.imageAutofill.repair','1')`. When off (default): keep existing image. When on: run vertical guard on existing image (title + alt + url); if it fails, treat as missing and assign new candidate.
- **Disable:**  
  - Remove `cardbey.imageAutofill` from localStorage, or set `VITE_ENABLE_IMAGE_AUTOFILL=false`.  
  - The “Auto-fill missing images” button is hidden when the feature is disabled; no provider or library calls run.

## Behavior

1. **Library first:** Seed dataset in `src/lib/images/data/seedLibrary.json` is queried by `businessType`, `category`, `tags`, `q`.
2. **Provider (optional):** If env key is set, Pexels search runs and results are merged with library candidates.
3. **Ranking:** Text-similarity score; mismatch guard (e.g. food item vs lamp/lightbulb) returns null.
4. **Assignment:** Only items **without** an existing image get a candidate; stable keys (`getItemStableKey`) are used so reordering does not attach wrong images.
5. **Patch:** `assignImagesToDraft` builds `{ preview: { items: [ { id, imageUrl? } ] } }`; only `imageUrl` for filled items is set. PATCH `/api/draft-store/:draftId` is called once; then refetch so UI shows new images (via `draftNormalize` merging `preview.items[].imageUrl` into products).

## Rollback

1. Set `VITE_ENABLE_IMAGE_AUTOFILL=false` (and remove `cardbey.imageAutofill` from localStorage).
2. The “Auto-fill missing images” button disappears; no autofill or provider calls.
3. **Rollback file list** (if reverting code):  
   - `src/lib/images/types.ts`  
   - `src/lib/images/data/seedLibrary.json`  
   - `src/lib/images/library.ts`  
   - `src/lib/images/providers/types.ts`  
   - `src/lib/images/providers/pexels.ts`  
   - `src/lib/images/ranking.ts`  
   - `src/lib/images/assignImages.ts`  
   - `src/lib/images/featureFlags.ts`  
   - `src/lib/draftNormalize.ts` (revert imageUrl merge and no-overwrite guard)  
   - `src/features/storeDraft/StoreDraftReview.tsx` (remove Day 2 button, `imageAutofillDay2Loading` state, and imports for `isImageAutofillEnabled`, `assignImagesToDraft`)  
   - `tests/draftNormalize.test.ts` (remove imageUrl merge tests)  
   - `tests/imageAutofillDay2.test.ts` (delete file)

## Files

- **Library:** `src/lib/images/library.ts`, `src/lib/images/data/seedLibrary.json`, `src/lib/images/types.ts`
- **Provider:** `src/lib/images/providers/types.ts`, `src/lib/images/providers/pexels.ts`
- **Guards:** `src/lib/images/guards.ts` (vertical guardrails: food, trades, florist, default; required/negative terms)
- **Query:** `src/lib/images/query.ts` (safe image query builder: generic name check, buildImageQuery, buildProviderQuery)
- **Ranking:** `src/lib/images/ranking.ts` (getCandidateText, passesVerticalGuard, hard reject on guard failure)
- **Assignment:** `src/lib/images/assignImages.ts`
- **Flags:** `src/lib/images/featureFlags.ts`
- **UI:** “Auto-fill missing images” button in Draft Review (when flag on), calling `assignImagesToDraft` then PATCH draft-store.
- **Normalization:** `draftNormalize.ts` merges `preview.items[].imageUrl` into `products` so refetch shows images.

## Tests

- `tests/draftNormalize.test.ts`: merges `imageUrl` from `preview.items` into products; does not overwrite when product already has imageUrl.
- `tests/imageAutofillDay2.test.ts`: library search, stable key, ranking (Energy Bar vs light bulb), threshold returns null, assign only fills missing / does not overwrite.
- `tests/imageAutofillGuards.test.ts`: vertical inference, generic name, buildImageQuery/buildProviderQuery, passesVerticalGuard, dessert vs shoe/lamp, plumbing vs cake, no overwrite.

**Test commands:**

```bash
cd apps/dashboard/cardbey-marketing-dashboard
npm test -- --run tests/imageAutofillDay2.test.ts tests/imageAutofillGuards.test.ts tests/draftNormalize.test.ts
```

Expected: all tests in these files pass.

## Vertical enforcement (Phase 1)

**Store vertical must dominate.** Priority order:

1. **store.businessType**  
2. **store.name** keywords  
3. **categories**  
4. **tags**

If store indicates **dessert / bakery / cafe / food / drink / restaurant** → vertical = `"food"`. Never fall back to default when store vertical is known.

- **Generic product names blocked:** Names containing "general", "item", "product", "retail", numeric suffix, or ≤2 meaningful tokens are never used in the query. Query is built only from **storeVertical + category + tags**. If category is also generic (general/other/product/retail), query = **storeVertical only**.
- **Hero fallback:** Hero image is **not** the first product blindly. It is the **first product image that passes `passesVerticalGuard(storeVertical)`**. If none found, hero stays undefined (placeholder).

## Quality checks (Phase 1)

- **Desserts/food:** Desserts and food stores must never show shoes, fashion, lamps, or light bulbs.
- **Trades (plumbing, etc.):** Plumbing and trades stores must never show cakes, desserts, or restaurant food.
- **Florist:** Flower stores get flower/bouquet imagery; no plumbing or electronics.
- Autofill uses **business type + category + tags** (and never generic product names) to build queries and applies **vertical guardrails** (required/negative terms) so wrong-vertical candidates are rejected.

## Debug tip

- The `assignImagesToDraft` result includes `assignedReasons` (key → `{ assignedFrom, assignedQuery }`); it is not persisted to the server. When `localStorage.cardbey.debug` is `"true"`, you can log this in the UI to see which query and source (library vs provider) was used per item.

## Manual checklist

1. **Dessert store must never show non-food images:** Create a dessert/bakery/cafe store → Quick Create → Draft Review. Hero and product images must be food/dessert only (no shoes, office, person, lamps).
2. **Plumbing store:** Create store “Union Road Plumbing” → open Draft Review → enable autofill → “Auto-fill missing images” → confirm plumbing-like images, not unrelated (e.g. shoes).
3. **Cafe/food:** Create cafe/food store → autofill → confirm food/drink images.
4. **Provider disabled:** Unset `VITE_IMAGE_PROVIDER_KEY` → autofill → library-only or placeholders; no errors.
5. **Repair mode:** Set `cardbey.imageAutofill.repair=1` → run "Auto-fill missing images" on a draft with wrong image → wrong image replaced. With repair off → existing image unchanged.
6. **Trades vs food:** Plumbing store + autofill → no cakes or restaurant food.
