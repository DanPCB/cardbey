# Impact Report: Feed back on Search-opened storefronts

## Goal

Stores opened from Search (or shared `/s/:slug` links) have no way back to the Cardbey global frontpage. Feed-entry stores show a top-left **Feed** pill via `?from=feed`.

## What could break

1. **Featured picks overlap** — chip shares top-left with Feed; must use `--feed-origin` offset whenever Feed is shown.
2. **Swipe-down-to-feed** — enabling full `feedOrigin` for Search would also load feed transition/discovery tail (undesired). Keep those gated.
3. **Draft preview** — must not show Feed on `/preview/website/:draftId` (preview mode already omits overlay).

## Why

`FeedOriginOverlay` is mounted with `enabled={feedOrigin}` and `feedOrigin` is only true when `from=feed`. Discovery search hrefs are bare `/s/:slug` with no `from` param.

## Impact scope

- `CanonicalStorefrontRenderer.tsx` — always enable Feed back on public mode
- `FeedOriginOverlay.tsx` — optional swipe separate from button visibility
- `WebsitePreviewPage.tsx` — offset For You chip on published public storefronts
- Tests in `CanonicalStorefrontRenderer.test.tsx`

## Smallest safe patch

Always `<FeedOriginOverlay enabled onBack={returnToFeed} />` in public mode; `enableSwipeBack={feedOrigin}` only; chip offset when published; leave `feedOrigin` for transition/tail/scroll.

## No-parallel-stack proof

Reuses existing Feed overlay + `/` navigation; no new nav surface or Intent Runtime path.
