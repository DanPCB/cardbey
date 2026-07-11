# Impact Report: Frontpage Mobile Right Rail Clipping → TikTok Overlay Architecture

**Date:** 2026-07-09  
**Surface:** Global frontpage (`/`) + public storefront hero  
**Status:** Implemented

## Architecture (deterministic)

| Layer | z-index | Notes |
|-------|---------|--------|
| Hero media | 0 | Image/video only |
| Localized scrims | 5 | Title column + CTA pocket + bottom safe fade |
| Content (title/CTA) | 10 | Interactive text/buttons |
| Right action rail | 40 | Independent stacking; never under decorative overlays |
| PIL dock | 45 | Above rail |
| Header | 50 | Chrome |
| Bottom navigation | 60 | Chrome |
| QR / modal | 110–120 | Temporary |
| PIL sheet | 1000 | Modal sheet |

## What changed

1. **Removed full-bleed hero scrim** from `ArtifactCard` media layer.
2. **Localized title scrim** (`data-feed-title-scrim`) — left ~68%, horizontal fade before rail.
3. **Localized CTA scrim** (`data-feed-cta-scrim`) — pocket under primary CTA; clears right gutter.
4. **Bottom safe-area fade** — soft 0→0.15→transparent (~80–120px); no hard mid-band.
5. **Stacking trap fix** — `feed-stage-column` uses `max-lg:z-auto` so fixed rail participates in root stacking.
6. **ImmersiveScreenShell / PublicStoreHeroBackground** — full-screen masks replaced with safe-fade + localized title column.
7. **Storefront mobile** — CSS `::before` title/CTA pockets on business-detail / CTA zones.

## What could break (mitigated)

| Risk | Mitigation |
|------|------------|
| Text less readable on bright heroes | Contrast sampler still picks light/default title+CTA peaks |
| Dual rail mount / QR state | Single rail retained; only stacking escape via `z-auto` |
| PIL under bottom nav | Spatially above nav; z 45 vs 60 only matters on overlap |
| Desktop theatre shift | Desktop keeps stage `z-0`; rail absolute inside column |

## Files touched

- `feedCardMediaOverlay.ts` + test
- `useFeedHeroContrastScrim.ts`
- `ArtifactCard.tsx` + media layout test
- `PublicFeedShell.tsx`
- `FloatingFeedActionRail.tsx`
- `PublicActionRail.tsx` + test
- `ImmersiveScreenShell.tsx` + test
- `PublicStoreHeroBackground.tsx`
- `WebsitePreviewPage.tsx` (storefront hero zones)
- `PerformerEntryPopup.tsx` (PIL z-45)
- `overlayZones.ts`
- `SpaceHero.test.tsx`
- `index.css`

## Follow-up (2026-07-09 screenshots)

Hard top/bottom icon cuts were **overflow clipping**, not only gradients:

1. Rail stack had `overflow-y: auto` + `max-height: 100%` → hard-clipped heart / QR bubble.
2. Header/bottom-nav `::before` fades lived in z-50/z-60 contexts → painted over rail at z-40.
3. Safari clipped `position: fixed` rail inside `overflow-hidden` ancestors.

Fixes: `overflow: visible` on mobile rail stack; remove chrome `::before` fades; portal mobile rail to `document.body`; left-restricted safe-area fade at z-5.