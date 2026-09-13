# Impact Report — Discover cards → global frontpage + Claim CTA 20%

## What could break
- Discover card destinations (currently `/space/:id` after last ship)
- Right-rail Discover card hrefs if also retargeted
- Claim CTA tap target size / layout on unclaimed feed cards

## Why
- Product: Discover store cards (SME grid, marked 1) should open Cardbey global frontpage (`/`), not Space or `/s/:slug`
- Claim My Business Space primary button is oversized; shrink to ~20% of current width

## Impact scope
- `resolveDiscoverOpenHref` → `/` (with optional store deep-link query)
- `DiscoveryClaimCta` layout width
- Does not remove claim flow or `/space` routes

## Smallest safe patch
1. Discover open href → global frontpage
2. Claim CTA container `width: 20%` (centered, with a usable min-width)
