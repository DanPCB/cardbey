# Impact Report: PIL Activity Detection Concierge (Consumer)

## Summary

Adds observe-only activity detection (dwell, idle, scroll hesitation, cart pause, revisit) that surfaces proactive PIL offers via a new `ProactiveOffer` UI. Integrates with existing PIL event pipeline and governed concierge handoffs.

## What could break

1. **Duplicate proactive UI** — Activity offers could stack with existing `PilAssistant` queue items if both fire for the same session.
2. **Offer fatigue** — New triggers may increase nudge frequency despite cooldowns.
3. **Creator/owner surfaces** — If detection runs on builder routes, owners could see consumer concierge prompts.

## Why

- New `useActivityDetection` hook listens to DOM interaction and route changes.
- `ProactiveOffer` is a separate UI path from `ConciergeNudge` / `PilAssistant` queue (activity offers only).
- New observe-only `activity_*` PIL event types extend the event catalog.

## Impact scope

- **Affected**: Public feed, storefront (`/s/`, `/store/`), device pair routes, `ConciergeHost`, PIL event buffer.
- **Not affected**: Performer console execution, payments, campaigns, backend APIs.

## Smallest safe patch

1. Gate `useActivityDetection` with `enabled: isPublicVisitor && !isOwnerOrAdmin`.
2. Per-offer cooldowns in `pilConciergeService` + session caps reuse `CONCIERGE_LIMITS` patterns.
3. Activity offers use dedicated `proactiveOfferStore` — do not call `scheduleConciergeSuggestion` (avoids duplicate queue items).
4. All CTAs route through `executeConciergeCta` / governed Performer handoff (`autoSubmit: false`).

## Rollback

Remove `useActivityDetection` from `ConciergeHost` and delete `src/lib/pil/activity/*`, `ProactiveOffer.tsx`, `proactiveOfferStore.ts`.
