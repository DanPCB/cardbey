# Impact Report: Partner spotlight blank + content-only stream hero

## Problems

1. **Partner / Featured display window blank** under Space left rail **NỔI BẬT** — dark 9:16 frame with no media.
2. **Streamline / Space storefront hero** shows business logo (center) + avatar (bottom-left) by default; product wants **content only** until click-to-view.

## Root causes

1. `resolveBusinessSpotlight.showFeature` always sets `media.kind: 'image'`. Video shows (common on live) render in `<img>` and fail → empty `bg-slate-900` window. Spotlight also skips `resolveCoreMediaUrl`.
2. `activateFeedStore` sets `expandedStoreId` to the active store, auto-showing `BusinessIdentityCard` expanded + collapsed chrome on every centered card (`PublicFeedShell` / Space / marketplace).

## What could break

| Risk | Why | Mitigation |
|------|-----|------------|
| Featured spotlight shows video autoplay | Kind flips to video | Mute + existing intersection play; same as Shows |
| Users miss business identity | No auto logo/avatar | Hero tap expands identity; CTAs unchanged; auto-collapse still 8s |
| Feed tests expect auto-expand | Spec change | Update `feedOverlayState` + ArtifactCard media layout tests |
| Storefront `/s/:slug` still auto-reveals | Parallel hook | Remove 600ms auto-expand in `useStorefrontHeroIdentity` |

## Impact scope

- Space left rail `SpaceAffiliateSpotlight` (NỔI BẬT / partner window)
- Marketplace + Space streamline heroes via shared `feedOverlayState` / `ArtifactCard`
- Storefront mobile hero identity timing (`useStorefrontHeroIdentity`)
- Not changing: affiliate API, `/s/:slug` desktop always-on header, commerce publish paths

## Smallest safe patch

1. `resolveBusinessSpotlight.ts` — classify video vs image like featured-work media; safe poster.
2. `SpaceAffiliateSpotlight.tsx` — `resolveCoreMediaUrl` + image `onError` fallback.
3. `feedOverlayState.ts` — `activateFeedStore` leaves `expandedStoreId: null`.
4. `ArtifactCard.tsx` — mount identity only when expanded (or owner preview); hero tap reveals.
5. `useStorefrontHeroIdentity.ts` — no auto-reveal delay.
6. Update unit tests for new contracts.

## Proceed

Implement and ship dashboard → staging → live.
