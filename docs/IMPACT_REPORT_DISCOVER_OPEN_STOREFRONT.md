# Impact Report — Discover card opens /s/:slug storefront

## What could break
- Discover taps that previously opened `/business/:slug` (BI / claim health page)
- Discovery-only cards with no published Business may 404 on `/s/:slug`
- Feed/list deep links and analytics that assumed profileUrl

## Why
- Users expect phone/address/`StoreInfoPanel` after tapping a Discover card
- Those live on public storefront `/s/:slug`, while `/business/:slug` is the Health Report / claim surface
- Card code routed `source === 'discovery'` to `profileUrl` (`/business/...`)

## Impact scope
- Dashboard Discover: `BusinessDiscoveryCard`, `DiscoverListView`, shared href helper
- Claim badge / Claim modal unchanged (still governed claim)

## Smallest safe patch
- Resolve open href to `/s/${slug}` for all Discover card/list opens
- Keep Unclaimed/New badge → `onClaim` (claim modal)
- Document that BI remains at `/business/:slug` (direct URL / future secondary link)

## Rollback
- Restore discovery → `profileUrl ?? /b/:slug` branch
