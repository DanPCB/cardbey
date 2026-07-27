# Impact Report: Hero chrome fade for Feed/Featured + back-to-hero

## Goal

1. Fade **Feed** and **Featured picks** the same way as business identity when leaving the hero.
2. Add a small up-arrow control (bottom-right) to scroll quickly back to the store hero/homepage when off-hero.

## What could break

1. **Feed / Featured hard to tap while fading** — `pointer-events: none` when nearly gone.
2. **Back-to-hero overlaps calendar FAB / CTA** — place above nav on the right with modest size; only visible off-hero.
3. **Multiple IntersectionObservers on `#hero`** — shared hook keeps one observer per mount; 3–4 observers is fine.

## Why

Identity fade already lives in `StorefrontPersistentMobileChrome`. Feed and Featured are separate fixed portals and stayed opaque. No off-hero escape to store home except bottom-nav Home.

## Impact scope

- New `useStorefrontHeroVisibility` hook (shared opacity formula)
- `FeedOriginOverlay`, `StorefrontMobileForYouChip`, `StorefrontPersistentMobileChrome`
- New small back-to-hero control in `WebsitePreviewPage` mobile chrome
- Mobile storefront with bottom nav only

## Smallest safe patch

Shared hook; apply opacity to Feed + Featured; inverse-opacity up-arrow → `scrollToAnchor('hero')`. No Core/API changes.

## No-parallel-stack proof

Reuses existing hero scroll target and chrome pattern; no new product surface or Intent Runtime path.
