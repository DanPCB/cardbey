# Impact Report: Live Market storefront + feed surface wiring

**Date:** 2026-08-14  
**Scope:** Recover public livestream UI already implemented but unwired (screenshots: storefront scheduled live card, owner editor, feed “Live soon” badge).  
**Out of scope:** Batch B (notifications/email/SMS/guest RSVP), real broadcast provider / WHIP-WHEP, default-off flag flips in source.

## Diagnosis

| Surface | Code status | Gap |
|--------|-------------|-----|
| Owner `/app/back/live-market` | Wired | No code recovery needed (ops/flags + published session) |
| Storefront `#live-session-*` card + placeholder | Components exist | **Not mounted** on `WebsitePreviewPage` |
| Feed “Live soon” + compact countdown | Badge + core attach helper exist | **Attach never called**; badge **not mounted** on `ArtifactCard` |

## (1) What could break

- Public store list / feed responses gain optional `store.liveMarket` when `ENABLE_LIVE_MARKET_GLOBAL_FEED_V1` is on (extra batched queries).
- Published storefront pages may show Live section / hero badge when consume flags + published session exist.
- Feed cards may show Live soon overlay linking to `/s/:slug#live`.

## (2) Why

- `attachLiveMarketSummariesToPublicStoreResults` was restored but never invoked from `resolvePublicStoresForList`.
- `StorefrontLiveSection` / `StorefrontLiveHeroBadge` / `LiveMarketHeroBadge` were never imported into public renderers.

## (3) Impact scope

- Core: `resolvePublicStoreList.js` (feed + frontscreen list paths that use it).
- Dashboard: `WebsitePreviewPage.tsx`, `artifacts.ts`, `ArtifactCard.tsx`.
- Flag-gated: no change when Live Market / surface flags are off (default).

## (4) Smallest safe patch

1. Await `attachLiveMarketSummariesToPublicStoreResults` at end of `resolvePublicStoresForList`.
2. Mount storefront section + hero badge on published `WebsitePreviewPage` only.
3. Map `liveMarket` through `StoreFeedInput` → `FeedArtifact`; render `LiveMarketHeroBadge` (`mode="global"`) on `ArtifactCard` when present + global-feed Vite flag.
4. Keep streaming placeholder UI as-is (no provider). Do not change default-off flags in source.

## Confirmation

User confirmed: proceed with minimal wiring for all three surfaces; include streaming placeholder UI; no Batch B.
