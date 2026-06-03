# Hero / Background Legacy Retirement

Status: **complete** (phases 1–5). Canonical hero pipeline is platform law; legacy paths are
guarded or retired. See **§8 Frozen contract** for the schema every surface must honor.

> Safety: changes applied in small, surgical phases per the workspace
> `development-safety-rule`. Future hero work must extend the canonical pipeline only.

---

## 8. Frozen canonical contract (platform law)

Every write path must produce (or mirror) this shape on `DraftStore.preview` and published artifacts:

```ts
{
  heroMediaType: 'image' | 'video'
  heroVideoUrl?: string | null   // canonical video URL when mediaType === 'video'
  heroVideo?: string | null      // legacy mirror of heroVideoUrl
  heroImageUrl?: string | null   // image hero OR poster-only when video
  heroPosterUrl?: string | null
  hero?: {
    type: 'image' | 'video'
    videoUrl?: string
    imageUrl?: string  // poster when video; primary image when image hero
    url?: string
  }
}
```

**Invariants (enforced at publish via `enforcePublishHeroCanonical`):**

1. If `heroVideoUrl` is set → `heroMediaType === 'video'`.
2. If `heroMediaType === 'video'` → `heroImageUrl` is poster-only, never primary media.
3. Video always wins over stale `heroImageUrl` / `hero.imageUrl` during publish and snapshot build.

**Compatibility fallbacks (read-only):** `Business.heroImageUrl`, `stylePreferences.heroVideo`,
`hero.url`, `bannerUrl` — readers must prefer `heroVideo` / `heroVideoUrl` / `heroMediaType`
before image fallbacks.

**Logging policy:**

| Keep | Remove |
|---|---|
| `[hero-canonical-mismatch]` warnings at publish | `[hero-publish-debug]`, `[hero-video-debug]`, `[hero-audit]` |
| `[hero-legacy-blocked]` in dev/test (`heroLegacyGuard`) | Ad-hoc hero field console dumps |
| Upload failure / structured publish errors | |

**Regression tests:** `heroVideoPublishPipeline.test.js`, `heroPublishInvariant.test.js`,
`publishSnapshotService.test.js`, `heroVideoPublicRenderer.test.ts` (dashboard).

---

## 1. Canonical path (the only allowed hero flow)

```
                    upload / URL / draft pick
                              │
                              ▼
        useHeroUpdate / heroMediaPersist   (frontend single service)
                              │  PATCH /stores/:id/hero  |  POST /stores/:id/upload/hero
                              ▼
                    updateHeroForStore()                 (backend single write entry)
                              │
                              ▼
            writeCanonicalHeroMediaToPreview(preview, canonical)   ◄── ONLY writer
                              │   (video wins; image replaces only when explicit)
                              ▼
                  DraftStore.preview (canonical fields)
                              │
              ┌───────────────┴────────────────┐
              ▼                                 ▼
  resolveCanonicalHeroMediaFromPreview()   publishSnapshot (canonical hero)
        (read / resolve)                          │
              │                                   ▼
              ▼                          live /s/:slug projection
     resolveHeroMediaFromPreview()  ───►  MiniWebsiteLayout
              │                                   │
              ▼                                   ▼
        HeroMediaBackground()  ◄────── single renderer (image + video) ──────►
```

### Canonical rules
- **Video wins over image.** A still image never overrides an existing video hero.
- **Explicit image upload may replace video** (`heroWriteIntent: 'image_upload' | 'image_select'`,
  or `allowReplaceVideoWithImage: true`).
- **Legacy `hero.imageUrl` / top-level `heroImageUrl` are read-only fallback** for old data.
- **No writer** may set `heroImageUrl` / `heroVideoUrl` / `heroMediaType` directly outside the
  canonical writer (or the guarded pipeline / publish-rehydrate helpers).
- **No renderer** may render `heroImageUrl` directly as the hero background; use
  `HeroMediaBackground`.
- **CNet playlist upload is untouched** (separate subsystem).

---

## 2. Canonical building blocks (already present)

| Concern | Function | Location |
|---|---|---|
| Write canonical hero | `writeCanonicalHeroMediaToPreview()` | `apps/core/cardbey-core/src/services/draftStore/draftPreviewHeroSync.js` |
| Resolve canonical hero | `resolveCanonicalHeroMediaFromPreview()` | same file |
| Read canonical hero | `readCanonicalHeroFromPreview()` | same file |
| Guarded pipeline still-hero | `applyPipelineGeneratedHeroImage()` | same file |
| Protect video from image-only overwrite | `protectVideoHeroFromImageOnlyOverwrite()` | same file |
| Single backend write entry | `updateHeroForStore()` | `heroUpdateService.js` |
| Frontend resolve | `resolveHeroMediaFromPreview()` / `resolveEffectiveHeroMedia()` | `components/mini-website/heroMediaUtils.ts` |
| Normalize / canonical type | `normalizeHeroMedia()` / `CanonicalHeroMedia` | `lib/artifactMedia/normalizeHeroMedia.ts` |
| Single renderer | `HeroMediaBackground` | `components/mini-website/HeroMediaBackground.tsx` |
| Single upload/persist hook | `useHeroUpdate` / `heroMediaPersist` | `hooks/useHeroUpdate.ts`, `lib/heroMediaPersist.ts` |
| Publish invariant enforcement | `enforcePublishHeroCanonical()` | `heroPublishInvariant.js` |

---

## 3. Enforcement (Phase 1 — done)

`apps/core/cardbey-core/src/services/draftStore/heroLegacyGuard.js`
- `warnDirectLegacyHeroWrite(source, meta)` — dev/test logs
  `[hero-legacy-blocked] direct legacy hero write blocked`; **no-op in production**.
- `guardLegacyHeroWrite(source, patch, meta)` — logs/blocks when a non-canonical source
  carries legacy hero fields.
- `assertNoDirectLegacyHeroWrite(fn)` — test helper; runs `fn` with `HERO_LEGACY_STRICT=1`
  so a direct legacy write throws.
- Enable strict blocking by setting env `HERO_LEGACY_STRICT=1` (tests / local audit only).

---

## 4. Legacy paths — audit & disposition

| # | Path | File:line | Disposition | Phase |
|---|---|---|---|---|
| W1 | image-only store-build hero writer | `draftStoreService.js:949-950` | route through guarded canonical writer | 2 |
| W2 | image-only draft preview hero writer | `draftStoreService.js:2398-2399` | route through guarded canonical writer | 2 |
| W3 | website sections generator hero writer | `websiteSectionsGenerator.js:39` | guard with `applyPipelineGeneratedHeroImage` | 2 |
| W4 | `buildHeroPreviewPatchFromUrls` (duplicate writer) | `heroUpdateService.js:80` | delegate to canonical writer | 3 |
| W5 | publish snapshot rehydrate direct writes | `publishSnapshotService.js:156-177` | mark canonical (allowed boundary) + assert contract | 3 |
| R1 | `backgroundImage: url(${publicHeroUrl})` | `StorePreviewPage.tsx:2101,2722,3274` | render via `HeroMediaBackground` | 4 |
| R2 | nav-capsule `heroImageUrl` resolve | `MiniWebsiteLayout.tsx:919-921` | keep (reads canonical, not a bg renderer) | review |

### Retained fallback fields (read-only)
- `heroImageUrl` (top-level + `Business.heroImageUrl`) — legacy reader compatibility only.
- `hero.imageUrl` / `hero.url` — used as poster / image fallback by the canonical resolver.
- These are still **written by the canonical writer** as backward-compatible mirror fields; no
  other writer should set them.

### Explicitly NOT touched
- CNet / signage / playlist upload (`adapters/cnet.js`, `engines/signage/*`, playlist routes).
- Promo banner `heroImageUrl` (`StorePreviewPage` promo banner `<img>`, `StorePromotionsPage`).
- Shared media infrastructure (`resolveCoreMediaUrl`, upload storage, S3 helpers).

---

## 5. Risk list

| Risk | Affected | Mitigation |
|---|---|---|
| Regenerate / store-build wipes user video hero | store creation, regenerate | route W1–W3 through video-guarded helper; regression test |
| Republish drops canonical video | publish / `/s/:slug` | preserve `snapshotToPreviewShape` contract; test publish keeps video |
| Profile save breaks hero field | business profile editor | leave read mapping intact; canonical mirror only |
| Over-edit of 3k-line `StorePreviewPage` | preview surface | touch only the 3 hero-background blocks; leave promo banners |
| Scope creep beyond surgical limit | whole repo | one phase at a time, ≤5 files/phase |

---

## 6. Validation checklist (acceptance)

- [x] Create mini website still works
- [x] Upload image hero works
- [x] Upload video hero works
- [x] Refresh preview keeps video
- [x] Republish live keeps video
- [x] Old store-generation step cannot overwrite video
- [x] No duplicate hero upload services (single `useHeroUpdate` / `heroMediaPersist`)
- [x] Public/frontscreen video heroes render (reels `<video>`, mini-site `HeroMediaBackground`)
- [x] Business profile background uses canonical path
- [x] CNet playlist upload unaffected
- [ ] `HERO_LEGACY_STRICT=1` full-repo audit (optional periodic CI)

---

## 7. Phase log

- **Phase 1 (done):** enforcement guard `heroLegacyGuard.js` (+ test) and this document.
- **Phase 2 (done):** W1/W2 use only `applyPipelineGeneratedHeroImage`; W3 guarded; `pipelineHeroStoreGeneration.test.js`.
- **Phase 3 (done):** `buildHeroPreviewPatchFromUrls` + `snapshotToPreviewShape` canonical; publish snapshot hero fingerprint drift.
- **Phase 4 (done):** `StorePreviewPage` → `HeroMediaBackground`; promo banners unchanged.
- **Phase 5 (done):** Removed temp debug logs; `enforcePublishHeroCanonical` at all publish boundaries; `heroVideoPublishPipeline.test.js`; frontscreen video mapping; doc frozen contract.

### Remaining legacy audit (non-blocking)

Search periodically for writers bypassing canonical pipeline:

```
heroImageUrl =
preview.hero =
backgroundImage: url(
```

Anything not routing through `resolveCanonicalHeroMediaFromPreview` /
`writeCanonicalHeroMediaToPreview` / `enforcePublishHeroCanonical` should be retired or guarded.
