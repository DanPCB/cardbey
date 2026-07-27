# Impact Report — Menu import layout review UI

**Date:** 2026-07-18  
**Scope:** Dashboard Performer `MenuUploadModal` review step  
**Goal:** Show layout specialist regions (bbox overlay) + section-grouped menu document in review, improving visual + information outcome.

## What could break

1. Modal layout if overlay image fails to load (PDF-only imports).
2. Clients assuming flat-only list — apply path must still use flat `items`.
3. Type mismatch if Core omits `menuDocument.layout` (UI must degrade to section list / flat list).

## Why

Core already returns `menuDocument.layout.regions[]` with normalized bboxes. Review still showed a flat name/price list, so layout structure was invisible to the owner.

## Impact scope

- Types: `menuImportApi.ts` (`menuDocument`, layout, source asset URL)
- New: `MenuImportLayoutReview.tsx` (overlay + sections)
- Wire: `postBuildInlineUi.tsx` `MenuUploadModal` review branch
- Apply/catalog path unchanged (still flat `items`)

## Smallest safe patch

Additive review UI only. No Core changes. Soft-fallback when layout/image missing.

## No-parallel-stack proof

Consumes existing menu-import job fields; no second import pipeline or wizard.
