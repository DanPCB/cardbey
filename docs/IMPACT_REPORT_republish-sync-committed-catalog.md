# Impact Report — Republish must sync committed catalog to live Products

**Date:** 2026-07-18  
**Symptom:** Preview/edit shows real extracted menu (e.g. Spa Packages, Catalog 19);
live `/s/:slug` still shows first-publish demo catalog (e.g. Anti-Aging Facials ×12).

## Root cause

`finishCommittedDraftRepublish` syncs hero/theme/miniWebsite and rebuilds projection,
but **never** rewrites `Product` rows. Public store prefers non-empty DB products over
projection commerce, so stale demo Products keep winning after Republish.

## (1) What could break

1. Republish replaces live Product list with draft preview items (intended when owner
   republishes after menu edit).
2. Empty draft items must not wipe the live catalog.
3. Catalog write failure should fail republish (not leave theme updated + catalog stale
   silently) — same severity as menu Apply store write.

## (2) Why

Committed early-exit path was designed for idempotent theme/hero refresh only.
Menu Apply already uses `applyDraftCatalogToCommittedStore`; Republish did not.

## (3) Impact scope

- Core: `publishDraftService.js` → `finishCommittedDraftRepublish`
- Live `/s/:slug` catalog after Republish
- No dashboard contract change (snapshot already syncs preview before publish)

## (4) Smallest safe patch

In `finishCommittedDraftRepublish`: prefer `canonicalPreviewOverride` when present;
if preview has items, call `applyDraftCatalogToCommittedStore` before projection rebuild.

## No-parallel-stack proof

Reuses `applyDraftCatalogToCommittedStore` / staged catalog publish helpers already used
by menu Apply and first publish. No second catalog engine.
