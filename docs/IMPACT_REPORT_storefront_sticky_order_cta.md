# Impact Report — Floating “Order coffee” CTA over Shows / menu

**Date:** 2026-07-16  
**Symptom (live):** Hero CTA (“Order coffee”) sticks and paints over Shows, Featured picks, and product grids while scrolling.

## What could break

1. Mobile storefront CTA no longer sticks at the bottom while scrolling past the hero (by design).
2. Edge case: product cards could briefly cover the hero CTA *while still on the hero* if a stacking bug returns — mitigated by keeping CTA in hero flow with modest `z-index` and `overflow: hidden` on the hero section.

## Why

Live `main` (`b62e38b`) intentionally set:

- `.feed-card-cta-zone { position: sticky; z-index: 45 }`
- `[data-storefront-hero-beacon] { z-index: 40 }`

so the Order CTA stayed above scrolling show/product cards. That keeps the pill visible mid-page (clipped/overlap) — the bug in the screenshots.

## Impact scope

- Public mini-website / storefront mobile (`WebsitePreviewPage` + `index.css` under `[data-storefront-mobile-nav='1']`)
- French Baguette Cafe and any store with a long CTA label on mobile

## Smallest safe patch

In `apps/dashboard/.../src/index.css` (mobile storefront nav scope only):

- `position: sticky` → `position: relative`
- `bottom: auto`
- beacon `z-index: auto` (do not elevate hero above later sections)
- Keep catalog card `isolation` so in-card “Order” buttons stay clickable

Do **not** reintroduce sticky/elevated beacon for this CTA.

## Deploy

Needs **dashboard** deploy from a commit that includes this CSS change. Catalog hierarchy PR tip `7f81db5` still has sticky — must include this patch before/with merge to `main`.
