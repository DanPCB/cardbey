# Hero image update audit (V1)

## Problem

Four UI surfaces could change the store hero/background, but they wrote to different targets and did not stay in sync.

## Path audit (before fix)

| Path | Surface | URL | Write target (before) | Gaps |
|------|---------|-----|----------------------|------|
| **A** | `HeroImageEditor` on website preview | `/app?missionId=…` | `POST …/upload/hero` + `PATCH …/draft/hero` → `DraftStore.preview` only | `Business.heroImageUrl` not updated; profile page stale |
| **B** | `BusinessProfileEditor` | `/dashboard/stores/:storeId/profile` | `POST …/upload/hero` (no draftId) + `updateStore` on Save → `Business` | Draft preview often stale until Save; weak `syncDraftMedia` |
| **C** | `StoreDraftReview` modal | `/app/store/:storeId/review?…` | Raw `fetch` upload + `PATCH …/draft/hero` | Duplicate upload logic; no Business sync |
| **D** | `StorePreviewPage` | `/preview/store/:storeId` | Display only | No edit surface (read-only) |

### Canonical read sources

- **Draft preview:** `DraftStore.preview` → `hero`, `heroImageUrl`, `heroVideo`, `heroMediaType`
- **Business profile:** `Business.heroImageUrl` + `stylePreferences.heroVideo`
- **Live site (`/s/:slug`):** `PublishedArtifact` projection `heroUrl` (after republish only)

## Proposed canonical write order

1. `POST /api/stores/:storeId/upload/hero` (single multer upload)
2. `updateHeroForStore()` in `heroUpdateService.js`:
   - `patchDraftPreview` when draft resolved
   - `Business.heroImageUrl` + style preferences when store id known
   - Refresh publish snapshot on draft (no live projection push)
3. **Never** auto-republish
4. User republish → live `heroUrl` updates

`PATCH /api/stores/:storeId/draft/hero` uses the same service for URL/draft-picker flows.

## Implementation

### Backend

| File | Change |
|------|--------|
| `src/services/draftStore/heroUpdateService.js` | Unified `updateHeroForStore`, `getHeroSyncStateForStore`, `buildHeroPreviewPatchFromUrls` |
| `src/routes/stores.js` | `GET /:storeId/hero`; `PATCH …/draft/hero` and `POST …/upload/hero` call `updateHeroForStore` |
| `src/services/draftStore/draftStoreService.js` | `heroMediaType` in committed preview allowlist (committed-draft upload fix) |

### Frontend

| File | Change |
|------|--------|
| `src/hooks/useHeroUpdate.ts` | Shared `uploadHero`, `persistHero`, sync state |
| `src/components/hero/HeroSyncNotice.tsx` | Unpublished hero banner |
| `src/components/mini-website/HeroImageEditor.tsx` | Upload via hook; skip redundant PATCH after multipart |
| `src/components/business/BusinessProfileEditor.tsx` | Profile upload via hook; sync notice |
| `src/features/storeDraft/StoreDraftReview.tsx` | Review modal upload via `uploadHeroMediaFile` (same endpoint) |

Path **C** `applyHero` (paste/product) still uses `apiPATCH …/draft/hero`, which now routes through `updateHeroForStore` on the server.

## Risk assessment

| Change | Risk | Mitigation |
|--------|------|------------|
| Business update on draft hero PATCH | Live `/s/:slug` could change if projection refreshed incorrectly | `syncBusinessHeroProfile` does not push live projection; republish still required for artifact |
| Double-write on Path A upload | Extra PATCH removed on frontend after POST | POST already calls `updateHeroForStore` |
| Profile upload without Save | Hero visible before other profile fields saved | Only hero fields updated immediately; other fields still need Save |
| Committed draft hero PATCH | Was blocked for `heroMediaType` | Allowlist includes `heroMediaType` |

## Validation checklist

- [ ] Upload from preview overlay → profile page shows same hero
- [ ] Upload from profile → preview overlay shows same hero
- [ ] Upload from review modal → profile + preview match
- [ ] Republish → `/s/:slug` shows latest hero
- [ ] `GET /api/stores/:storeId/hero` reports `hasUnpublishedHeroChanges` when draft ≠ live
- [ ] No surface shows stale hero after another surface updates

## Results (post-implementation)

- **Single backend service:** `heroUpdateService.js` owns draft + business writes.
- **Single upload endpoint:** `POST /api/stores/:storeId/upload/hero` for all file uploads.
- **Sync read API:** `GET /api/stores/:storeId/hero` for dashboard indicators.
- **Shared hook:** `useHeroUpdate` for dashboard surfaces A–C.

## Fix: video inSync + hasUnpublishedHeroChanges (2026-06)

- **`inSync`:** Compare draft video URL to `businessVideoUrl` (canonical), not stale `business.heroImageUrl` poster.
- **`syncBusinessHeroProfile`:** `heroImageUrl = heroImage || heroVideo`; always write row; video draft patch no longer keeps old `existingHero.imageUrl` on `heroImageUrl`.
- **`hasUnpublishedHeroChanges`:** `isLive && draftNorm && (liveNorm == null || draftNorm !== liveNorm)`.
- Tests: `heroUpdateService.test.js`.
