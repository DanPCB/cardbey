# Impact Report — StorePhotoStrip + two-column published layout

## What could break
- Public `/s/:slug` first viewport (hero, CTA, mobile chrome)
- Draft/preview routes sharing `WebsitePreviewPage`
- Unclaimed ACCC “representative image” disclosure
- Sticky panel overlapping mobile nav / bottom chrome

## Why
- Follow-up to StoreInfoPanel: make enriched contact feel Google-panel-like without a full mini-website rewrite
- Full hero removal for all modes would break owner draft preview and projection cutover

## Impact scope
- Dashboard: `StorePhotoStrip`, `WebsitePreviewPage` published layout only
- No core API changes

## Smallest safe patch
1. Add `StorePhotoStrip` (hero + up to 2 product images; unclaimed representative-image label)
2. On **published standalone only** (non-projection): replace fullscreen `HeroSection` with `StorePhotoStrip`
3. Keep `StoreInfoPanel` under disclosure (max-w-3xl) — true sticky two-column content wrap deferred (requires extracting ~400 lines of sections into a child component for balanced JSX)

## Deferred
- Sticky two-column body (content left / panel right) via extracted `PublishedStorefrontBody`
- Photo strip on projection-cutover path
