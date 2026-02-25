# Draft Review Editor — Hero / Avatar / Categories Fix Report

**Goal:** Make Draft Review Editor (`/app/store/temp/review?mode=draft&jobId=...`) reliably show (1) hero image/video from store generation, (2) avatar/logo from store generation, (3) categories + persistence. **Constraints:** Do not touch Published Preview; use DRAFT payload only; minimal fix with one canonical resolver.

---

## Step 0 — Relevant code paths (file + line)

| Path | File | Line(s) |
|------|------|--------|
| Draft review page entry | `apps/dashboard/.../pages/store/StoreReviewPage.tsx` | 1–25, 1215–1225 |
| Draft editor component | `apps/dashboard/.../features/storeDraft/StoreDraftReview.tsx` | 1–110, 3198–3200, 3628–3690 |
| Hero component | `apps/dashboard/.../features/storeDraft/review/StoreReviewHero.tsx` | 1–95 |
| Avatar/logo rendering | `StoreDraftReview.tsx` (passes `logoUrl` to StoreReviewHero) | ~3632–3640 |
| Draft normalization | `apps/dashboard/.../lib/draftNormalize.ts` | 76–198 (normalizeDraftResponse; parses preview string) |
| Image URL resolver (canonical) | `apps/dashboard/.../lib/draftMedia.ts` (new) | resolveDraftHeroUrl, resolveDraftAvatarUrl, resolveDraftHeroVideoUrl |
| Low-level URL normalize | `apps/dashboard/.../lib/resolveImageUrl.ts` | resolveImageUrl, getResolvedStoreHeroUrl, getResolvedStoreAvatarUrl |
| Categories UI | `apps/dashboard/.../features/storeDraft/review/CategoryIndex.tsx` | 1–130 |
| Backend GET draft | `apps/core/.../routes/stores.js` | 291–404 (GET /:storeId/draft) |
| Backend patch preview | `apps/core/.../services/draftStore/draftStoreService.js` | 463–523 (patchDraftPreview) |

---

## (A) Root cause(s) with file/line

| # | Root cause | File(s) + line(s) |
|---|------------|-------------------|
| 1 | **Duplicate hero/avatar resolution** — Logic scattered in StoreDraftReview (getStoreHeroImage, getStoreLogoUrl, getStoreHeroVideo) and StoreReviewPage (getResolvedStoreHeroUrl/getResolvedStoreAvatarUrl). Some paths passed only `draft.store` (no preview), so hero/avatar from `draft.preview` were never read. | `StoreDraftReview.tsx` ~217–255 (removed helpers), ~614–615 (debug log used `draft.store` only), ~3289–3290, ~3332–3333, ~3596 |
| 2 | **Avatar fallback from businessData** — Draft editor used `getStoreLogoUrl(draftForLogo, businessData, true) || businessData?.profileAvatarUrl || businessData?.logo`, mixing draft with non-draft fallback. | `StoreDraftReview.tsx` ~3632 |
| 3 | **Backend patch could overwrite hero/avatar** — `patchDraftPreview` did `merged = { ...existing, ...incoming }`. If `incoming` had `hero: undefined` (e.g. from a patch that only sent `items`), spread could overwrite existing hero/avatar. | `apps/core/.../draftStoreService.js` ~479–483 |
| 4 | **Preview as string not parsed in one path** — Backend returns `draft.preview` as JSON string in some cases; frontend had parsing in draftNormalize but resolvers expected object. Single canonical resolver now parses string. | `draftNormalize.ts` already parses; new `draftMedia.ts` parses in resolver layer |

**Categories:** CategoryIndex already always renders and shows "Uncategorized (N)" when products exist and categories are empty. Categories come from draft payload (`draft.preview.categories` / response `categories`). No separate "Auto-categorize" button was changed; store generation and MI "Generate tags" drive categories.

---

## (B) Changes made

| File | Change |
|------|--------|
| **apps/dashboard/.../src/lib/draftMedia.ts** | **New.** Canonical resolvers for Draft Review Editor only: `resolveDraftHeroUrl(payload)`, `resolveDraftAvatarUrl(payload)`, `resolveDraftHeroVideoUrl(payload)`. Parse `draft.preview` when string; build draft-like object from payload; call `resolveImageUrl` helpers; no businessData (draft-only). |
| **apps/dashboard/.../src/features/storeDraft/StoreDraftReview.tsx** | Removed local `getStoreHeroImage`, `getStoreHeroVideo`, `getStoreLogoUrl`. All hero/avatar resolution now via `resolveDraftHeroUrl`, `resolveDraftAvatarUrl`, `resolveDraftHeroVideoUrl` from `draftMedia`. Debug log uses full `draft as DraftPayload`. Avatar uses `resolveDraftAvatarUrl(draftForLogo)` only (no businessData). |
| **apps/dashboard/.../src/pages/store/StoreReviewPage.tsx** | Replaced `getResolvedStoreHeroUrl`/`getResolvedStoreAvatarUrl` with `resolveDraftHeroUrl`/`resolveDraftAvatarUrl` in setDraft and handleRefresh debug logs. Sticky preview merge unchanged (`incomingPreview ?? prev?.preview`). |
| **apps/core/.../services/draftStore/draftStoreService.js** | **patchDraftPreview:** Parse `draft.preview` when string into `existing`. Regression guard: if `merged.hero === undefined && existing.hero != null` keep `existing.hero`; same for `avatar` and `brand` (merge brand object). |

**Not changed:** Published Preview routes/components; route paths; draftNormalize (already parses string preview and treats empty object as undefined); CategoryIndex (already shows panel + Uncategorized (N)).

---

## (C) Acceptance checks + how to verify

1. **Generate a store → open draft editor → hero + avatar appear**  
   - Run store generation (e.g. from MI/Quick Start).  
   - Open `/app/store/temp/review?mode=draft&jobId=<jobId>&generationRunId=<gen>`.  
   - **Check:** Hero image or video at top; avatar/logo overlay visible when generation set them. If generation did not set hero/avatar, gradient placeholder and avatar placeholder are expected.

2. **Refresh the page → hero + avatar still appear (no flicker to placeholder)**  
   - Same URL; refresh (F5).  
   - **Check:** Hero and avatar still show (no flash to placeholder then back). If they disappear, check Network: `GET /api/stores/temp/draft?generationRunId=...` response must contain `draft.preview` with `hero`/`avatar` (or `brand.logoUrl`).

3. **Categories visible and persist after refresh**  
   - **Check:** Left sidebar (desktop) or categories strip (mobile) shows categories or "Uncategorized (N)". Refresh; categories (or Uncategorized) still visible.

4. **No draft editor code path uses published preview data**  
   - **Check:** Draft editor uses only `GET /api/stores/:storeId/draft?generationRunId=...` for data. Hero/avatar come from `resolveDraftHeroUrl`/`resolveDraftAvatarUrl` (draft payload only; no businessData for avatar).

5. **No duplicated resolve-hero/avatar logic**  
   - **Check:** Single canonical module: `src/lib/draftMedia.ts`. StoreDraftReview and StoreReviewPage (debug) use only these resolvers; no local getStoreHeroImage/getStoreLogoUrl/getStoreHeroVideo.

---

## How to verify manually (exact URL + network)

1. **URL:**  
   `http://localhost:5174/app/store/temp/review?mode=draft&jobId=<jobId>&generationRunId=<gen>`  
   (Use real `jobId` and `generationRunId` from a completed store generation.)

2. **Network (DevTools → Network → XHR/Fetch):**  
   - Find: `GET .../stores/temp/draft?generationRunId=...`  
   - **Check response:**  
     - `draft` present.  
     - `draft.preview` present (object or string). If string, frontend parses it in draftMedia.  
     - Hero: `draft.preview.hero.imageUrl` or `draft.preview.heroImageUrl` or `draft.preview.hero.url`.  
     - Avatar: `draft.preview.avatar.imageUrl` or `draft.preview.brand.logoUrl` or `draft.preview.avatarImageUrl`.  
     - Categories: `categories` array at top level or inside preview.

3. **If hero/avatar URLs exist in response but UI shows placeholders:**  
   - Confirm dashboard uses `resolveDraftHeroUrl`/`resolveDraftAvatarUrl` (only `draftMedia`).  
   - Copy hero URL from response → open in new tab → must return 200 (or remote 200). If 404, fix URL shape or proxy.

4. **If hero/avatar missing in GET draft response:**  
   - Backend: ensure store generation (or MI generate hero) writes to `draft.preview.hero` / `draft.preview.avatar` (or brand) and that `patchDraftPreview` does not overwrite them (regression guard in place).
