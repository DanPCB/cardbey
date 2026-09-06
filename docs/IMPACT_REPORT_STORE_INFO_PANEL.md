# Impact Report — StoreInfoPanel on public /s/:slug

## What could break
- Public storefront layout / first-viewport UX for all `/s/:slug` pages
- Mobile chrome, hero, catalog, and claim disclosure order
- Preview routes that share `WebsitePreviewPage` if panel is not gated to published standalone

## Why
- Prompt asks to remove fullscreen hero and replace with Google-style two-column layout
- Current path is `PublicStoreSlugRoute` → `CanonicalStorefrontRenderer` → `WebsitePreviewPage` (single-column themed mini-website)
- Contact data is already on the public DTO and in `businessDetails*` / details sheet — visibility is the gap, not data

## Impact scope
- Dashboard storefront only (`WebsitePreviewPage` + new `StoreInfoPanel`)
- No core API / mapper changes required (products already on DTO)

## Smallest safe patch (this change)
1. Add `StoreInfoPanel` (Tailwind + lucide, matching storefront tokens) that renders phone / address / hours / website / directions / claim CTA from already-resolved fields
2. Mount **once** after `UnclaimedDisclosureBanner` on **published standalone** only
3. Extend `formatTradingHours` to accept Places-shaped `weekdayText` (camelCase)
4. **Do not** remove hero, **do not** rewrite to two-column sticky layout, **do not** invent `ClaimJourneyProgress` (does not exist on storefront)

## Deferred
- `StorePhotoStrip` / hero replacement
- Desktop sticky two-column layout
- Moving BusinessHealthReport into claim CTA (BI surface, not this page)
- Phase 2 seeding (blocked on persistent disk)

## Workstream 1 / 3
- Disk mount is Render dashboard only — set `BUSINESS_CANDIDATE_DIR=/var/data/businessCandidates` after mount
- Phase 2 must wait until `/var/data` is writable
