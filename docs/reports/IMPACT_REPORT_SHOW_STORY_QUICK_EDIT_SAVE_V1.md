# IMPACT REPORT — Show 404 + Story committed-draft save (v1)

## Intent

Fix Website Edit inline drawers:
1. Edit Show → `404 Show not found` when card is a synthetic/fallback work not yet in `featuredWorks`.
2. Edit Story → blocked when draft status is `committed`.

## What could break

1. Show upsert-create-on-miss could add entries to featuredWorks that were previously display-only fallbacks (intended).
2. Story save via mini-website or new draft must not wipe website theme/sections (merge carefully).
3. Wrong storeId if commerceStoreId is still a draft id.

## Why

Shows from `resolveFeaturedWorks` may use ids like `fallback-product-*` / `work-N` that are not persisted. PATCH requires existing id.
Story always PATCHes the draft; committed drafts reject non-hero patches.

## Smallest safe patch

1. Core `upsertStoreShow`: if `workId` missing from list, **create** with that id (true upsert).
2. `ShowQuickEditDrawer`: keep PATCH; 404 should disappear after upsert.
3. `StoryQuickEditDrawer`: on committed-draft error → resolve business storeId → `apiPATCH` mini-website sections; else `ensureDraftForStore` + patch new draft (same pattern as ServiceQuickEditDrawer).

## Also ship

Unlimited image suggest (prior turn) with these fixes in the same deploy if committing.
