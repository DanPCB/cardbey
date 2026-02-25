# Impact Report: Hero/Avatar Single Source of Truth

## 1) What could break

- **Draft Review / Publish Review** could show different hero/avatar if we change resolver order or field names.
- **Public storefront** could regress if we change how `previewData.heroImageUrl` / `avatarUrl` are set (e.g. overwriting with null).
- **Publish flow** is unchanged on the frontend; backend must continue to copy draft hero/avatar into the store on publish.

## 2) Root cause (why images differ across 3 screens)

| Page | Data source | Hero/avatar fields used | Issue |
|------|-------------|-------------------------|--------|
| **Draft Review** | Draft (GET draft-store, normalized) | `getResolvedStoreHeroUrl(draft)`, `getResolvedStoreAvatarUrl(draft)` → `preview.hero.imageUrl`, `preview.avatar.imageUrl`, `store.profileHeroUrl`, `meta.profileAvatarUrl` | Correct. |
| **Publish Review** | Same draft | Same resolvers, same draft shape | Correct. |
| **Public Storefront** | Draft route: `normalizeDraftResponse(response)` → `PreviewData`; Store route: GET `/api/store/:id/preview` → `response.preview` | `resolveStoreHeroImage(preview)` / `resolveStoreAvatarImage(preview)` expect **top-level** `preview.heroImageUrl` and `preview.avatarUrl` | **Mismatch:** Draft API returns `preview.hero.imageUrl` and `preview.avatar.imageUrl` (nested). Public resolvers do not read nested shape, so they fall back to `images[0]` or first product image → **different image**. |

So: **different pages use different field shapes and different resolvers.** Draft/Publish use draft-shaped `preview.hero` / `preview.avatar`; public page uses PreviewLike `heroImageUrl` / `avatarUrl` and never gets the nested draft shape.

## 3) Impact scope

- **Draft Review**: No change (still uses `getResolvedStoreHeroUrl` / `getResolvedStoreAvatarUrl`).
- **Publish Review**: No change.
- **Public Storefront (draftId route)**: Fix: when normalizing draft response to `PreviewData`, set `heroImageUrl` and `avatarUrl` from the **same** draft resolvers so the public page shows the same hero/avatar as draft/publish-review.
- **Public Storefront (storeId route)**: Backend must return `heroImageUrl`/`avatarUrl` in store preview (copy from store record populated at publish). Frontend already uses `visualUrl` query when opened from dashboard; we add deterministic fallback in storeMedia for draft-shaped preview.

## 4) Smallest safe patch

1. **StorePreviewPage** – In `normalizeDraftResponse`, after determining the preview object from raw/raw.draft/raw.data:
   - Build a draft-like object `{ preview, store, meta }` from the raw response.
   - Call `getResolvedStoreHeroUrl(draftLike)` and `getResolvedStoreAvatarUrl(draftLike, businessData)` (same as Draft Review).
   - Set `heroImageUrl` and `avatarUrl` on the returned `PreviewData` so `resolveStoreHeroImage` / `resolveStoreAvatarImage` (and `visualUrl` when absent) see the same values as the draft.
2. **storeMedia** – In `resolveStoreHeroImage` and `resolveStoreAvatarImage`, support **draft-shaped** preview: if `preview.hero?.imageUrl` or `preview.avatar?.imageUrl` exist, use them first (then existing `heroImageUrl`/`avatarUrl`, then `images[0]`, then first product). So both draft-shaped and preview-shaped payloads resolve the same way.
3. **Backend (out of scope for this repo)** – On publish, copy draft hero/avatar into the store/business record and ensure GET `/api/store/:id/preview` includes `heroImageUrl` and `avatarUrl` from that record. No frontend change required for that.

No change to: applyDraftPatch, mergeDraftWithPatch (already preserve hero/avatar), or to the publish request payload (backend owns copy).

---

## Backend requirements (for full consistency)

- **On publish:** When committing draft to store, copy draft hero and avatar into the published store/business record (e.g. `store.profileHeroUrl`, `store.profileAvatarUrl` or equivalent). Use draft.preview.hero.imageUrl and draft.preview.avatar.imageUrl (or meta.profileHeroUrl / meta.profileAvatarUrl) as source. Do not recompute or re-pick.
- **GET /api/store/:id/preview:** Response must include `preview.heroImageUrl` and `preview.avatarUrl` from the store record so the public storefront shows the same images after publish.
- **Draft PATCH:** Missing keys in patch must mean "no change", not "set to null". (Frontend mergeDraftWithPatch already only applies storeVisuals when keys are present.)

---

## Manual verification steps

1. Create a draft and set/pick hero + avatar (upload or generate).
2. Confirm **Draft Review** shows the chosen hero and avatar.
3. Go to **Publish Review** (or publish step); confirm same hero/avatar.
4. Click **View storefront** (or open public URL with same store/draft). Confirm **Public Storefront** shows the same hero and avatar.
5. Run **Generate tags** (or any catalog refetch). Confirm hero/avatar remain unchanged on all three pages.
6. Publish to live. Open public storefront URL (by storeId). Confirm hero/avatar match (requires backend to copy draft hero/avatar into store and return them in store preview).
