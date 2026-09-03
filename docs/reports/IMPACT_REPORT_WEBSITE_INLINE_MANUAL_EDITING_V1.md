# IMPACT — Website Inline Manual Editing V1

**Date:** 2026-09-03  
**Mission:** `WEBSITE_INLINE_MANUAL_EDITING_V1` (superseded / corrected by `STORE_EDITING_FLOW_CORRECTION_V1`)  
**Related:** `docs/reports/IMPACT_REPORT_STORE_EDITING_FLOW_CORRECTION_V1.md`

## Intent

Enable lightweight owner edits on Draft Preview (`/preview/website/...`) without forcing Content Studio for simple metadata changes, while keeping Content Studio for **new creation** and **advanced existing-Show** (video / clip / audio) work.

## What could break

| Risk | Why | Scope |
|------|-----|-------|
| Owner loses Advanced Show path | Drawer-only Advanced buried | Show editing on Draft Preview |
| Public storefront gains Edit chrome | Wiring `onEdit` without owner/draft gate | `/preview/store?view=public`, `/s/:slug` |
| My Stores / Catalog wrong target | Routing Edit Store to public gateway | Owner entry to Draft Preview |
| Duplicate Quick Edit surfaces | Catalog/My Stores drawers vs Draft Preview | Conflicting edit UX |

## Impact scope

- Draft Preview owner chrome (Shows, services, products, featured)
- Content Studio entry with `showWorkId` for Advanced
- My Stores / Catalog owner Edit Store routing (kept on `/preview/website`)
- Docs wording: Studio is not “new only”

## Smallest safe patch (as shipped)

1. Keep `ShowQuickEditDrawer` / `ServiceQuickEditDrawer` + `websiteItemEditTarget`
2. Expose on-card **Advanced** for Shows (`data-testid="show-work-advanced-edit"`)
3. Wire Quick Edit on Fixed + Quote + product + featured + draft catalog grid
4. Do **not** delete public storefront renderer; keep `view=public` as live view only
5. Remove broken/extra Quick Edit from My Stores / Catalog list pages (Edit Store → Draft Preview)

## Architecture lock (do not reopen)

- Content Studio = **new creation + advanced existing-Show editing**
- Draft Preview Quick Edit = simple metadata only
- Public storefront is **not** an owner editing step
