# IMPACT REPORT — Creator feed card title + CTA mapping

Date: 2026-08-27

## What could break

1. Creator lens cards show creator display name as hero instead of content title.
2. Non-video types always get CTA **Read** (Services shows Read instead of Hire).
3. Missing thumbnails fall back to QR shell (seed has null media).

## Why

`creatorFeedItemToArtifact` sets `ctaLabel: isVideo ? 'Watch' : 'Read'` and `storeName` to creator display name. Feed card UI uses `storeName` as the hero headline.

## Impact scope

- Dashboard only: `creatorContentToFeedArtifacts.ts` (+ unit test)
- Marketplace store cards unchanged
- Seed script optional: placeholder thumbnails (Core)

## Smallest safe patch

1. `ctaLabel` from `showcasePrimaryCta(type)` (Watch / Read / Hire / Buy Now / Join Live).
2. Hero `storeName` = content `title`; keep creator name in `verticalHint` / profile chip via existing avatar + slug.
3. Promote staging → main; gated live seed.
