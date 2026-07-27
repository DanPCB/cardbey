# Impact Report — Canonical Store Projection (Duplicate Catalog Pipelines)

**Date:** 2026-07-16  
**Symptom:** `/s/herbal-head-spa` shows Catalog (24) real services; `/preview/website/:id` shows Catalog (5) Classic/Gel manicure + General.

## Phase 1 — Data-flow audit (divergence)

### Live `/s/:slug`

```
PublicStoreSlugRoute
  → GET /api/public/stores/:slug
  → Business + Product(+ PublishedBusinessArtifact)
  → publicStoreToMiniWebsitePreview
  → WebsitePreviewPage (publishedPublicStore)
```

### Preview `/preview/website/:draftId?generationRunId=`

```
CanonicalStorefrontRenderer mode=preview
  → WebsitePreviewPage
  → GET /api/draft-store/:id  (or temp draft by generationRunId)
  → DraftStore.preview.items / .categories   ← independent catalog
  → same WebsitePreviewPage renderer
```

**Divergence:** Same UI; **different catalogs**. Preview did not read published Products.

### Dependency graphs (before)

```
Preview → DraftStore.preview → (may be mock / template) → Renderer
Live    → Business.Product (+ artifact) → Mapper → Renderer
```

### Smoking gun (demo manicure ×5)

`apps/core/cardbey-core/src/engines/menu/extractMenu.js` → `mockMenuRowsForContext`  
Regex historically included bare `\bspa\b`, so “Herbal Head Spa” got Classic/Gel/Spa Pedicure demos written into the draft.

Also present in templates (not primary for this bug): `templateItemsData.js`, `structuredTemplates.js`, `beautyBlueprints.js`.

---

## What could break (this patch)

1. Preview of a **live** store always shows **published** catalog — unpublished draft catalog edits won’t appear until they are in published Products (or we add Projection Revision later).
2. If live GET fails, preview falls back to draft catalog (logged).
3. Mock menu fallback becomes empty unless `ALLOW_MOCK_MENU_FALLBACK=true` or `NODE_ENV=test` — failed OCR can yield empty menus instead of invented manicures (desired).

## Impact scope

- `WebsitePreviewPage.loadDraftFromServer` (dashboard)
- `lib/storeProjection/*` (new)
- `extractMenu.js` mock + `PLACEHOLDER_MENU_ITEM_NAMES`
- **Not** Performer runway / Business Import Kernel

## Smallest safe patch (implemented)

1. **Store Projection helper** overlays live catalog onto draft shell when `isLive` or demo-manicure detected.
2. **Quarantine mock menus** in production (no spa→nails keyword).
3. Treat manicure mock names as placeholder extraction.

## Phase 7 — Manual Projection Editor (this slice)

| Capability | Status |
|------------|--------|
| Inline Catalog / Products editor in Manual mode | ✅ `ManualCatalogEditorPanel` |
| Categories create / rename / delete | ✅ |
| Items add / edit / delete / duplicate / move category | ✅ |
| Save via `save_draft_preview` (Runtime Authority) | ✅ Projection revision on draft |
| Drag-drop hierarchy / variants / bulk / undo / image AI | Deferred |
| Diff viewer Published vs Preview vs Manual | Deferred |
| Server `StoreProjection` + DB revision table | Deferred |

**Entry:** Performer → Manual → Catalog / Services or Products.

## Still deferred

| Item | Status |
|------|--------|
| Named server `StoreProjection` API + DB revision | Deferred — client overlay reuses live mapper |
| generationRunId migration/delete of stale draft catalogs | Deferred — runtime prefer-live covers display |
| DnD nest/reorder, duration variants, bulk ops, image toolkit | Deferred |
| Field-level diff viewer | Deferred |

## Acceptance (this PR)

- ✔ Live and Preview show same catalog when store is live / draft was demo-stale  
- ✔ No new spa→manicure demos written on failed extract  
- ✔ Single read path for catalog on preview (`publicStoreToMiniWebsitePreview`)  
- ✔ generationRunId no longer treated as independent catalog source for live stores  
- ◐ Full StoreProjection server model / Manual CRUD / Diff viewer — follow-up  

## Architectural principle (immutable)

```
Business Import Kernel → Business Knowledge → Canonical Store Projection
        → Preview / Live / Owner Editor / Marketplace / Mobile / TV
```
