# Impact Report — Republish leaves stale public store catalog in UI

**Date:** 2026-07-18  
**Symptom:** After Republish, `/s/:slug?postPublish=1` can still show the old demo
catalog (e.g. Anti-Aging Facials ×24) while preview and the live API already have the
real menu (e.g. Spa Packages ×19).

## Root cause (follow-up)

Core republish now rewrites `Product` rows (see
`IMPACT_REPORT_republish-sync-committed-catalog.md`). Production
`GET /api/public/stores/herbal-head-spa` returns the correct 19 items.

Dashboard republish only called `invalidatePublicFeedCache` (feed keys). It did **not**
invalidate `['publicStore', slug]`, so React Query can keep serving a pre-republish
payload on the post-publish navigate.

Separately, shallow merge of `canonicalPreviewOverride` can set `items: []` and skip
catalog sync when the snapshot catalog is empty — harden to prefer non-empty snapshot /
draft items and log first product names.

## (1) What could break

1. Extra refetch of public store after republish (intended; slightly more API traffic).
2. Catalog sync prefers snapshot items over stale draft items when both non-empty
   (intended for snapshot publish).
3. Empty catalogs still skip Product wipe (unchanged guard).

## (2) Why

Post-publish UX navigates to `/s/:slug` immediately; without cache invalidation the
owner sees the previous demo catalog until a full remount/refetch wins.

## (3) Impact scope

- Dashboard: `invalidatePublicFeedCache` (+ callers already covered), WebsitePreview /
  StoreDraftReview republish success path
- Core: `finishCommittedDraftRepublish` catalog item resolution + log fields

## (4) Smallest safe patch

1. Invalidate `['publicStore']` (and slug when known) alongside feed cache after publish.
2. Resolve republish catalog items with non-empty preference: override items → override
   catalog.products → base items → base catalog.products; log counts/first names.

## No-parallel-stack proof

Uses existing React Query keys and `applyDraftCatalogToCommittedStore`. No second
catalog or publish pipeline.
