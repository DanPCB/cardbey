# Hero/Avatar Consistency: Root Cause and Fix

## Confirmed bug
- **Draft Review** (/app/store/temp/review?mode=draft&jobId=...): hero = RED flowers, avatar = RED flowers.
- **Publish Review** (/app/store/temp/publish-review?jobId=...): hero = YELLOW bouquet, avatar = YELLOW bouquet.
- They must be identical for the same jobId/store.

## Root cause (with evidence)

### 1) Frontend: Publish-review and draft review use same API but different resolution
- **Draft Review** and **Publish Review** both use `StoreReviewPage` and load data via `GET /stores/temp/draft?generationRunId=...`. So both get the same API response.
- The API response shape: `draft.preview.hero.imageUrl`, `draft.preview.avatar.imageUrl`, `draft.preview.brand.logoUrl`, and optionally `store.profileHeroUrl`, `store.profileAvatarUrl` (from normalized draft).
- **Issue:** When building the `StoreDraft` for the UI, hero/avatar were taken from `store` and `meta` first. If the backend or normalizer did not put draft.preview.hero/avatar into the `store` object in the response, the frontend could end up with different values (e.g. store fallback from another source).
- **Evidence:** StoreReviewPage previously set `normalizedStore.profileHeroUrl = (s.profileHeroUrl) || metaVisuals?.profileHeroUrl` without preferring `draftPreview.hero` first. So when the draft response had hero only in `draft.preview.hero` and not in `store`, the converted StoreDraft could have empty or different store.profileHeroUrl, and the resolver could then fall back to something else (e.g. first product image → yellow bouquet).

### 2) Backend publish: Wrong fields used for hero/avatar
- Publish handler in `apps/core/cardbey-core/src/routes/stores.js` was setting:
  - `storeLogo = meta.logo || preview.logo`
  - `storeHeroImage = meta.heroImage || preview.heroImage`
- The draft shape from the frontend and draft-store flow uses:
  - **Hero:** `preview.hero.imageUrl`, `preview.heroImageUrl`, `meta.profileHeroUrl`
  - **Avatar:** `preview.avatar.imageUrl`, `preview.brand.logoUrl`, `meta.profileAvatarUrl`, `meta.logo`
- So `meta.heroImage` and `preview.heroImage` were often missing, and the backend wrote null or wrong values into the Business record. After publish, the store (business) had no or wrong hero/avatar, so any view that read from the store (or a fallback) showed different images.

### 3) No single resolver
- Draft Review and Publish Review resolved hero/avatar in multiple places with slightly different precedence. Using one shared resolver (`resolveBrandImages`) with strict rules (draft first, then store, then deterministic fallback) ensures both pages show the same image.

## What each page was reading before

| Page           | API / data source                    | Fields used for hero/avatar before fix |
|----------------|--------------------------------------|----------------------------------------|
| Draft Review   | GET /stores/temp/draft?generationRunId=... | getResolvedStoreHeroUrl(draft) etc. — draft.preview.hero first. So draft review often showed the correct (red) image. |
| Publish Review | Same GET /stores/temp/draft (when readonly) | Same draft response. But StoreReviewPage built normalizedStore from store/meta without forcing draft.preview.hero/avatar into it; so if the response had store with different or empty hero/avatar, the UI could show that (e.g. yellow) or a fallback. |
| Public storefront | GET /api/store/:id/preview or draft preview | heroImageUrl/avatarUrl from preview; already fixed in prior work to use draft-shaped preview and visualUrl param. |

## Fixes applied

### Frontend
1. **StoreReviewPage**
   - When building `normalizedStore`, **prefer draft.preview for hero/avatar**: `profileHeroUrl` and `profileAvatarUrl` are set from `draftPreview.hero` / `draftPreview.avatar` / `draftPreview.brand.logoUrl` when present; only then fall back to store/meta.
   - **Publish-review always uses draft endpoint:** `if (readonlyProp || mode === 'draft' || currentStoreId === 'temp')` so publish-review never loads published store instead of draft.
   - **DEBUG logs (cardbey.debug):** Log raw API `draft.hero`, `draft.avatar`, `store.profileHeroUrl`, `store.profileAvatarUrl` and the final resolved hero/avatar and source after building StoreDraft.

2. **resolveBrandImages.ts (new)**
   - Single resolver: `resolveBrandImages({ draft, store, options })` → `{ heroUrl, avatarUrl, heroSource, avatarSource }`.
   - Rules: draft.hero → store.hero → deterministic fallback; same for avatar. No randomness.

3. **StoreDraftReview**
   - Server hero (priority 3) and avatar use `resolveBrandImages` so both pages use the same resolver.
   - DEBUG log includes `avatarSource` from `resolveBrandImages`.

### Backend
4. **stores.js (POST /api/store/publish)**
   - Extract hero/avatar from the **draft shape** used by the frontend:
     - `storeLogo` = meta.profileAvatarUrl ?? meta.logo ?? preview.avatar?.imageUrl ?? preview.avatar?.url ?? preview.avatarImageUrl ?? preview.brand?.logoUrl ?? preview.logo.
     - `storeHeroImage` = meta.profileHeroUrl ?? preview.hero?.imageUrl ?? preview.heroImageUrl ?? preview.hero?.url ?? meta.heroImage ?? preview.heroImage.
     - `storeHeroVideo` = meta.profileHeroVideoUrl ?? meta.heroVideo ?? preview.hero?.videoUrl ?? preview.heroVideo.
   - So publish **copies the exact draft hero/avatar** into the Business record; no fallback to product images when draft has explicit selections.

### Patch/merge (unchanged)
- `applyDraftPatch` and `mergeDraftWithPatch` already preserve hero/avatar (missing keys = no change; partial refetch does not clear preview/store visuals).

## Verification
1. Set `localStorage.setItem('cardbey.debug', 'true')`, open Draft Review and Publish Review for the same jobId. In console you should see `[HERO_AVATAR_DEBUG]` and `[HERO_AVATAR]` with the same hero/avatar and source (e.g. draft.preview.hero / draft.preview.avatar).
2. For the same jobId, Draft Review and Publish Review must show the same hero and avatar.
3. Refresh Publish Review: images stay the same.
4. After publish, public storefront shows the same hero/avatar (backend now copies draft hero/avatar into Business).
