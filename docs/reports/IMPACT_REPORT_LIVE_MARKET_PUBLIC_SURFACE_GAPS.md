# Impact Report: Live Market public surface wiring gaps

**Date:** 2026-08-14  
**Issue:** Owner published Live session successfully, but feed hero badge and storefront Live section missing (CAPITAL GROUP).

## Root cause (updated)

1. **Feed:** Core attaches `store.liveMarket` correctly. Client `mapPublicStoreFeedItemFromApi` **dropped** `liveMarket` (fixed).
2. **Storefront mount path:** Live UI was only on legacy path under projection cutover (fixed).
3. **Slug gate bug (current):** `StorefrontLiveSection` / badge required `preview.slug`, but `publicStoreToMiniWebsitePreview` never set `slug`/`storeSlug` on published previews → Live UI never mounted on `/s/:slug` even when API returned a session.

## Smallest safe patch (this turn)

1. Add `slug` / `storeSlug` to mini-website preview mapper + DraftPreview.
2. Resolve live slug from `publishedPublicStore.slug || preview.slug || preview.storeSlug`.
3. Scroll to `#live` after the public session section loads.
