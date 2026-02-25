# Hero + Avatar Draft Review Editor – Fix Summary

## Current canonical keys (GET /draft response)

The backend returns the draft row as-is in the response body under `draft`. Hero and avatar live in the **preview** object on that draft:

- **Hero:** `draft.preview.hero.imageUrl`
- **Avatar:** `draft.preview.avatar.imageUrl`

Response shape: `{ ok, storeId, generationRunId, status, draftId, draft, store, products, categories }`.  
So the single, stable location for hero/avatar is **`draft.preview.hero.imageUrl`** and **`draft.preview.avatar.imageUrl`**.  
If `draft.preview` is stored as a JSON string in the DB, the API still sends it as-is; the frontend parses it in `draftMedia.ts` (`parsePreview` / `getDraftPreviewFromPayload`).

---

## 1. Root cause

Hero and avatar were **never written during initial store generation**. In `generateDraft` (draftStoreService.js), the preview was built with `storeName`, `items`, `categories`, `brandColors`, etc., but **no `preview.hero` or `preview.avatar`**. Those were only added by separate MI tasks (e.g. `generate_store_hero`) that run after `build_store`. So when the job completed and the draft was marked `ready`, GET `/api/stores/temp/draft` often returned a draft without hero/avatar, and the UI showed placeholders. After refresh they were still missing because they were never persisted in the main generation step.

---

## 2. Minimal patch – files changed

### A) `apps/core/cardbey-core/src/services/draftStore/draftStoreService.js`

- **Import:** `generateHeroForDraft` from `../mi/heroGenerationService.ts`.
- **After building the initial `preview` (before the final `prisma.draftStore.update` that sets `status: 'ready'`):**
  - Call `generateHeroForDraft({ storeName: profile.name, businessType: profile.type, storeType: profile.type })` and set  
    `preview.hero = { imageUrl: hero?.imageUrl ?? null }`.
  - Set `preview.avatar = { imageUrl: firstProductWithImage?.imageUrl ?? null }` (first product with an image; no separate avatar generator).
- The same `preview` (including `hero` and `avatar`) is then written in the single update that sets `status: 'ready'`, so GET draft returns them and they persist after refresh.

### B) `apps/core/cardbey-core/src/routes/stores.js`

- In GET `/:storeId/draft`, in the existing dev/log block: when `status === 'ready'` and either hero or avatar URL is missing, log a **dev-only** warning:  
  `[Stores:GET draft] regression guard: draft ready but hero/avatar missing` with `generationRunId`, `previewKeys`, `heroMissing`, `avatarMissing`.

### C) No frontend code changes

- Frontend already uses **canonical keys first**: `resolveImageUrl.ts` → `getResolvedStoreHeroUrl` / `getResolvedStoreAvatarUrl` use `preview?.hero?.imageUrl` and `preview?.avatar?.imageUrl` first. `draftMedia.ts` passes the draft payload only (no published store) and parses `draft.preview` when it’s a string.
- `patchDraftPreview` already preserves existing `hero` and `avatar` when patching only items/categories (no wholesale overwrite of preview).

---

## 3. Acceptance criteria

| # | Criterion | Status |
|---|-----------|--------|
| 1 | GET `/api/stores/temp/draft?generationRunId=...` includes hero + avatar URLs in one stable place (`draft.preview.hero.imageUrl`, `draft.preview.avatar.imageUrl`) | Met: generation writes them in one update; GET returns `draft` with that preview. |
| 2 | Draft Review Editor at `/app/store/temp/review?mode=draft&jobId=...` shows hero background and avatar immediately after generation completes | Met: draft payload has canonical keys; UI resolves them via `resolveDraftHeroUrl` / `resolveDraftAvatarUrl`. |
| 3 | After refresh, hero + avatar still display (persisted in DB/draft preview) | Met: same preview is persisted in `generateDraft`; GET returns it. |
| 4 | One canonical schema; no duplicated hero/avatar fields | Met: backend writes only `preview.hero.imageUrl` and `preview.avatar.imageUrl`; frontend reads them first. |

---

## 4. Manual verification steps

1. **Generate a new store** (jobId flow).
2. **Open Draft Review Editor:** `/app/store/temp/review?mode=draft&jobId=...`.
3. **Verify** hero background image and avatar image appear once generation completes.
4. **Refresh the page** and confirm hero and avatar are still visible.

Avatar uses the first product image when available; if there are no product images, `preview.avatar.imageUrl` may be `null` (placeholder for avatar only). Hero comes from `generateHeroForDraft` during store generation.
