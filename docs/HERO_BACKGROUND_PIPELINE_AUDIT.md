# Hero background upload / display pipeline audit

**Date:** 2026-06-03  
**Symptom:** Hero video upload saves successfully; preview or live view can stay blank/grey/static, or show a stale image/poster instead of video.

**Safety note:** Shared `/uploads` static + Range route and `ensureWebCompatibleVideoBuffer` also serve CNet/playlist uploads. Changes to those paths must stay narrow (`/uploads/media/*` only) or playlist-specific.

---

## A. Path map (surface → function → endpoint → storage → renderer)

| Surface | Frontend entry | Upload / persist | Backend endpoint / service | DB / preview fields | Renderer |
|--------|----------------|------------------|----------------------------|---------------------|----------|
| Website preview (iframe `/preview/website/:id?embedded=true`) | `HeroImageEditor` → `useHeroUpdate.uploadHero` | `uploadHeroMediaFile` | `POST /api/stores/:storeId/upload/hero` | `DraftStore.preview`: `heroVideoUrl`, `heroVideo`, `heroMediaType`, `hero`, `website.sections[hero]`; `Business.heroImageUrl`, `stylePreferences.heroVideo` | `WebsitePreviewPage` → `HeroSection` → **`HeroMediaBackground`** |
| Website preview (draft picker / URL) | `HeroImageEditor` → `useHeroUpdate.persistHero` | `patchHeroToDraft` | `PATCH /api/stores/:storeId/draft/hero` | same | same |
| Store draft review modal | `StoreDraftReview` → `uploadHeroMediaFile` or `apiPATCH .../draft/hero` | mixed | upload/hero or draft/hero | same | `StoreReviewHero` → **`HeroMediaBackground`** |
| Business profile editor | `BusinessProfileEditor` → `useHeroUpdate` | upload/hero | same | same + business row | profile form preview (image URL field); hero via canonical sync |
| Performer console (open hero editor) | `heroImageApi` / `openManualHeroImageEditor` | upload/hero | same | same | iframe → WebsitePreviewPage |
| Live public store `/s/:slug` (mini-website layout) | N/A (published data) | publish snapshot | `publishDraft` / `publishSnapshotService` | `Business` + published projection; snapshot `hero` | **`MiniWebsiteLayout`** → **`HeroMediaBackground`** |
| Live public store (slug route, website sections) | N/A | N/A | `GET /api/public/stores/:slug` | `heroUrl`, `heroVideo`, `bannerUrl` | `PublicStoreSlugRoute` → `WebsitePreviewPage` (published) → **HeroMediaBackground** |
| Legacy storefront (non–mini-website) | N/A | N/A | storefront API | `heroImageUrl` / banner | `PublicStorePage` classic layout |
| CNet / playlist media | Contents studio / upload routes | `POST /api/uploads/create` | `upload.js` + `ensureWebCompatibleVideoBuffer` | `Media` table, S3/local key | players / playlists (**not** draft hero) |
| Pipeline store / mini-website generation | orchestrator / draft generate | `patchDraftPreview` (automated) | `draftStoreService.generateDraft*` | may set **image-only** `hero.imageUrl` | preview after generation |
| Publish / republish | `PublishModal` | `publishDraft` | `publishDraftService` + `publishSnapshotService` | `publishSnapshot.hero`, canonical top-level fields | live site via snapshot → public API |
| Manual preview PATCH | various editors | `patchDraftPreview` | `draftStoreService.patchDraftPreview` | merges hero fields; `syncHeroFieldsIntoPreviewWebsite` | next GET draft / preview |

### Canonical resolution (frontend)

- **Single resolver:** `normalizeHeroMedia` (`lib/artifactMedia/normalizeHeroMedia.ts`) via `resolveHeroMediaFromPreview` / `mergePreviewHeroFields` (`heroMediaUtils.ts`).
- **Backend canonical:** `resolveCanonicalHeroMediaFromPreview` / `writeCanonicalHeroMediaToPreview` (`draftPreviewHeroSync.js`).
- **Rule:** `videoUrl` wins; `heroImageUrl` / `hero.imageUrl` are poster or image-only; stale `heroMediaType: "image"` must not drop video (handled in `mergePreviewHeroFields` + `pickPreviewVideoUrl` + backend `protectVideoHeroFromImageOnlyOverwrite`).

### Video hero protection (backend, 2026-06-03)

- **Guard:** `protectVideoHeroFromImageOnlyOverwrite` / `applyPipelineGeneratedHeroImage` in `draftPreviewHeroSync.js`.
- **Applied at:** `patchDraftPreview` (all hero patches), `finalizeDraft`, `generateDraft`, `storeBuildQaAutoFix`.
- **Explicit image replace allowed:** `heroWriteIntent` (`image_upload`, `image_select`), `allowReplaceVideoWithImage`, or `isExplicitUserImageHeroReplace` (upload shape with `heroMediaType: image` + null video fields).
- **Dev log:** `[hero-audit] protected video hero from image-only overwrite`.

### Media serving (Core)

| Check | Status |
|-------|--------|
| `GET/HEAD /uploads/media/:filename` explicit Range handler | ✅ `server.js` (before `express.static`) |
| `Content-Type: video/mp4` | ✅ `uploadsStatic.js` + route |
| `Accept-Ranges: bytes`, `Content-Range`, `Content-Length` | ✅ |
| CORS `Access-Control-Allow-Origin: *` | ✅ global `/uploads` + route |
| Auth on `/uploads` | ✅ none (public static) |
| Hero upload transcode (faststart H.264) | ✅ `POST .../upload/hero` → `ensureWebCompatibleVideoBuffer` |
| Playlist upload transcode | ✅ `upload.js` (separate path) |
| Dev desktop URL | ✅ `resolveCoreMediaUrl` → `127.0.0.1:3001`; embedded iframe → same-origin `/uploads/...` via Vite proxy |

---

## B. Conflict table

| Path | Can overwrite video? | Can overwrite image? | Legacy field used? | Risk |
|------|---------------------|----------------------|--------------------|------|
| `POST /upload/hero` (video) | Sets video; clears image unless poster | Clears image hero | `hero`, top-level, `website.sections` via sync | Low if transcode succeeds |
| `POST /upload/hero` (image) | Clears `heroVideo*` | Sets image | same | Low |
| `PATCH /draft/hero` | Via `buildHeroPreviewPatchFromUrls` | same | same | Medium if body sends image-only |
| `patchDraftPreview` (partial merge) | Preserves existing hero if omitted | Preserves if omitted | Full blob merge | Low unless caller sends stale top-level `heroMediaType: image` |
| `patchDraftPreview` (hero in payload) | Overwrites per patch | Overwrites | `syncHeroFieldsIntoPreviewWebsite` | Medium |
| `draftStoreService` generate / enrich (lines ~877, ~2281) | **Can omit video** | Sets `heroImageUrl` from Pexels/image only | `preview.hero = { imageUrl }` | **High** on regen after video upload |
| `mergePreviewHeroFields` (frontend) | Fixed: video wins over stale image type | Repoints image to poster when video | Reads all legacy keys | Low (regression tests exist) |
| `buildHeroPatchPayload` (video branch) | — | **Was writing `heroImageUrl: videoUrl`** | PATCH to draft/hero | **High** → stale image slot = mp4 URL |
| `WebsitePreviewPage` refetch after upload | `applyServerDraft` replaces `heroMedia` from API | same | GET draft top-level | Medium; mitigated by `handleHeroPersisted` keep-upload |
| `GET /api/draft-store/:id` top-level | Exposes `heroVideoUrl` | `heroImageUrl` may be poster or legacy | `readCanonicalHeroFromPreview` | Low |
| `publishSnapshot` / `snapshotToPreviewShape` | Keeps video in snapshot | Poster in `heroImageUrl` | snapshot.hero | Low (tests exist) |
| `syncBusinessHeroProfile` | Stores video in `stylePreferences.heroVideo` | **`Business.heroImageUrl = image \|\| video`** | business row | Medium for profile readers expecting image-only column |
| **`MiniWebsiteLayout` live renderer** | **Ignores video entirely** | Uses `heroImageUrl` as CSS bg only | `heroImageUrl` / `preview.heroImageUrl` | **Critical** for `/s/:slug` + `PublicStorePage` |
| `readCanonicalHeroFromPreview` with `heroMediaType: image` | **Nulls video** | Forces image mode | explicit type | Medium if stale type on draft |
| `express.static` + `/uploads/media` route | No | No | — | Low (playlist uses same tree; route is media-only) |

---

## C. Root-cause candidates (ranked)

1. **`MiniWebsiteLayout` bypasses `HeroMediaBackground`** — Live mini-website and `PublicStorePage` website mode use CSS `background-image` from `heroImageUrl` only; video URL is ignored → grey theme gradient or wrong still image.
2. **`buildHeroPatchPayload` (video) set `heroImageUrl` to video URL** — Pollutes image field; confuses resolvers/UI that read `heroImageUrl` first.
3. **Draft refetch overwrites optimistic video** — After upload, `loadDraftFromServer` → `setHeroMedia(result.heroMedia)`; if API preview blob is stale, video disappears until merge fixes apply.
4. **Pipeline `generateDraft` / image enrich writes image-only hero** — Regeneration can overwrite video with Pexels still.
5. **`readCanonicalHeroFromPreview` treats `heroMediaType: image` as authoritative** — Can null video if type stale (frontend merge mitigates on read path).
6. **Browser / iframe playback** — Resolved separately: remove `load()`, same-origin `/uploads` in embedded preview, transcode on upload (addressed in recent work).
7. **Publish snapshot not refreshed** — Rare if `updateHeroForStore` refresh fails silently (logged non-fatal).

---

## D. Minimal fix plan (no major rewrite)

| # | Change | Touches shared upload? | Risk |
|---|--------|------------------------|------|
| 1 | **`MiniWebsiteLayout`:** resolve hero via `resolveHeroMediaFromPreview` + render **`HeroMediaBackground`** | No | Low; aligns with WebsitePreviewPage |
| 2 | **`buildHeroPatchPayload`:** for video, set `heroImageUrl` to poster only, never `videoUrl` | No | Low |
| 3 | **`[hero-audit]` dev logs** at `updateHeroForStore`, `patchDraftPreview` (hero), publish snapshot hero, render | No | None in prod |
| 4 | Keep **`POST /upload/hero` transcode**; do not change `upload.js` playlist path | No | — |
| 5 | Optional follow-up: guard pipeline hero writes when `heroVideoUrl` already set | Orchestrator only | Medium — needs scoped test |
| 6 | Optional: `readCanonicalHeroFromPreview` — do not null video on `heroMediaType: image` if `heroVideoUrl` present | Backend read | Medium — add test |

**Explicitly out of scope:** Performer runway UX, Phase C graph, second hero endpoint, auto-republish on edit, CNet playlist behavior.

---

## E. Verification checklist

- [ ] Image hero upload → preview + live  
- [ ] Video hero upload → preview shows video (console: `loadedmetadata` → `playing`)  
- [ ] Refresh preview → video preserved (`heroVideoUrl` on GET draft)  
- [ ] Republish → `/s/:slug` shows video (after MiniWebsiteLayout fix)  
- [ ] Business profile background matches draft  
- [ ] Playlist upload still transcodes/serves via `/api/uploads/create`  
- [ ] `curl -I -H "Range: bytes=0-1023" http://127.0.0.1:3001/uploads/media/<file>.mp4` → 206 + `video/mp4`

---

## F. Key file index

**Backend:** `routes/stores.js` (upload/hero, draft/hero), `services/draftStore/heroUpdateService.js`, `draftPreviewHeroSync.js`, `draftStoreService.js` (`patchDraftPreview`), `publishSnapshotService.js`, `routes/draftStore.js` (GET), `routes/upload.js`, `lib/videoCompat.js`, `lib/uploadsStatic.js`, `server.js`  

**Frontend:** `heroMediaUtils.ts`, `normalizeHeroMedia.ts`, `HeroMediaBackground.tsx`, `WebsitePreviewPage.tsx`, `MiniWebsiteLayout.tsx`, `StoreReviewHero.tsx`, `HeroImageEditor.tsx`, `useHeroUpdate.ts`, `heroMediaUpload.ts`, `heroMediaPersist.ts`, `publicMiniWebsiteMapper.ts`, `resolveCoreMediaUrl.ts`
