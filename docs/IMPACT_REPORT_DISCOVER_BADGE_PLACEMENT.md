# Impact Report — Discover card badge placement

## What could break
- Discover card claim entry (separate Claim button removed)
- Visual distinction of unclaimed vs claimed cards

## Why
Claimed badges clutter claimed storefronts; Unclaimed + Claim is redundant; badges belonged top-left vs desired bottom-right.

## Impact scope
- `BusinessDiscoveryCard.tsx`, `DiscoverListView.tsx`

## Smallest safe patch
- Hide Claimed badges entirely
- Move New / Unclaimed / VN chips to bottom-right
- Unclaimed (neutral) is the sole claim control → existing claim modal
- Drop separate Claim button and amber-only claim CTA styling on the badge
