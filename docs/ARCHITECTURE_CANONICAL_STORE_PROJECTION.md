# Architecture — Canonical Store Projection

## Immutable flow

```
Business Import Kernel
        │
        ▼
Business Knowledge Graph / Business + Product
        │
        ▼
Canonical Store Projection  (read model)
        │
 ┌──────┼───────────────┐
 ▼      ▼               ▼
Preview Live Website  Owner Editor
        │
        ▼
Marketplace / Mobile / TV / API
```

## Current implementation (Phase 1)

| Consumer | Catalog source |
|----------|----------------|
| Live `/s/:slug` | `GET /api/public/stores/:slug` → `publicStoreToMiniWebsitePreview` |
| Preview `/preview/website/*` | Draft shell + **overlay live catalog** via `resolveCanonicalStoreProjectionForPreview` when live / demo-stale |
| Owner editors | DraftStore for edits; display after publish = live Products |

`generationRunId` / draftId = revision identity (theme, hero overlays, mission linkage). **Not** a second product database.

## Module

- Dashboard: `src/lib/storeProjection/storeProjection.ts`
- Mapper: `src/lib/publicMiniWebsiteMapper.ts` (`publicStoreToMiniWebsitePreview`)

## Forbidden

- Building Preview catalog from `extractMenu` mocks when OCR fails
- Matching bare `spa` → nail salon demos
- Treating `DraftStore.preview.items` as truth for published stores
