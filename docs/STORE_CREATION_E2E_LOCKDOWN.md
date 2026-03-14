# Store Creation → Draft → Publish E2E Lockdown

**Goal:** Phase 0 E2E flow works reliably: Create with AI → Draft Review → Publish → Public Store Preview.

## E2E Path Traced

1. **Create with AI**  
   `CreatePage` → `handleGenerate` → `quickStartCreateJob` (quickStart.ts) → `POST /api/mi/orchestra/start` → navigate to `buildDraftReviewUrl({ jobId, generationRunId })` or `buildPreviewDraftUrl` (guest).

2. **Backend draft pipeline**  
   Orchestra start creates/gets draft; pipeline: `resolveGenerationParams` → `buildCatalog` (items get `id: item_${draftId}_${i}`) → `saveDraftBase` → `finalizeDraft` (item images, hero, avatar; status → `ready`).  
   Optional MI job **autofill_product_images**: `runAutofillImages` (miRoutes.js) fills missing `item.imageUrl`, ensures `item.id` when missing, then `patchDraftPreview(draft.id, { items })`.

3. **Draft review**  
   `StoreReviewPage` / `StoreDraftReview`: resolve draft by `jobId` + `generationRunId` (GET orchestra job or GET stores/temp/draft) → get `draftId` → `GET /api/draft-store/:draftId` (or `/draft-store/:draftId/preview`).

4. **Publish**  
   `handlePublish` → pre-publish PATCH draft (hero/avatar/catalog) → `publishStore` → `POST /api/store/publish` (storeId + generationRunId) → backend commit draft to store → success → navigate to `/preview/store/:storeId?view=public&postPublish=1`.

5. **Public store**  
   Route `/preview/store/:storeId` → `StorePreviewPage` → `loadStorePreview(storeId)` → `GET /api/store/:storeId/preview` (or context + store). No draft dependency; store loaded by storeId only.

## Data Guarantees Verified

- **draftId after generation:** From orchestra start response or GET job/draft; present once job creates draft.
- **preview.items[].id:** Backend `buildCatalog` and `runAutofillImages` set `item.id` when missing (`item_${draftId}_${i}` or `item_${draft.id}_${i}`). GET draft-store returns items with id.
- **item.imageUrl after autofill:** `finalizeDraft` and `runAutofillImages` set `item.imageUrl`; `patchDraftPreview` persists. GET draft-store returns updated preview.
- **Publish:** Commit converts draft → store; response includes `publishedStoreId` and `storefrontUrl`.
- **Public route:** Loads store by slug/storeId via store preview/context; no draftId.

## Files Touched (minimal patches)

| File | Change |
|------|--------|
| `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx` | Guard publish: if no `draftId` or `baseDraft.status === 'generating'`, toast and return before setting loading. |
| `apps/dashboard/cardbey-marketing-dashboard/src/components/preview/grid/ProductCard.tsx` | `onError` on product image: fallback `src` to `/placeholders/business-generic.svg` on load failure. |
| `apps/dashboard/cardbey-marketing-dashboard/src/pages/public/StorePreviewPage.tsx` | `onError` on cart item images (3 places): same placeholder fallback so broken URLs don’t show broken icon. |

## Defensive Checks Added

1. **Draft incomplete → block publish**  
   - No `draftId`: toast “Draft not loaded. Please wait or refresh the page.” and return.  
   - `baseDraft.status === 'generating'`: toast “Draft is still generating. Please wait.” and return.

2. **Publish failure**  
   - Existing: `!result.ok` → toast error; `finally` → `setIsPublishing(false)`. No change.

3. **Missing / broken imageUrl**  
   - `ProductReviewCard` already used `resolvedImageUrl` fallback and `onError` to placeholder.  
   - `ProductCard` (public grid): added `onError` to use placeholder.  
   - StorePreviewPage cart item `<img>`s: added `onError` to use placeholder (3 spots).

## Hidden Fragilities (for awareness)

1. **draftId vs jobId**  
   Review URL is keyed by `jobId` + `generationRunId`. `draftId` comes from job/draft response. If the job response is slow or missing `draftId`, the review page may show “Draft not loaded” until refetch; the new guard avoids publishing in that state.

2. **Guest → Publish**  
   Guest can open draft preview and “Sign in to publish”; after login, `claimGuestDraft` + `handlePublishRef.current?.()` run. If claim fails silently, publish can still run with the same draft (backend may resolve by generationRunId). No change in this patch.

3. **Public store without images**  
   `getItemImageWithSource` returns `{ url: null, source: 'placeholder' }` when no image; ProductCard and grid already render a non-image state. Placeholder and `onError` ensure no crash or broken image icon.

4. **Placeholder asset**  
   All fallbacks use `/placeholders/business-generic.svg`. If that file is missing, the browser will show a broken image for the fallback; ensure the asset exists in the dashboard’s public assets.

## Acceptance Criteria

- From empty account: Create store → See draft review → Publish → Open public store page.  
- No console errors from these paths.  
- No loading state stuck (publish always clears in `finally`; new guards return before setting loading).  
- No missing image crash (placeholders + onError fallbacks).
