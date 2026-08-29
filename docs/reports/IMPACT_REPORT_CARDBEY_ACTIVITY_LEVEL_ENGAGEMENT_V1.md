# Impact report: Activity-Level Engagement V1

**Date:** 2026-08-29  
**Verdict:** `CARDBEY_ACTIVITY_ENGAGEMENT_V1_READY`

---

## What could break

| Area | Risk | Mitigation |
|------|------|------------|
| Global store card like | Low | Store hero / `store:{id}` artifacts unchanged — still `useStoreEngagement` |
| Business timeline like counts | Medium | Now activity-scoped; users see per-post counts not store totals |
| Show storefront parity | Low | `show_item` + work id preserved — same keys as `StoreShowSection` |
| PROMOTION without promotionId | Low | Like hidden — no fake store substitute |
| Share double-recording | Low | Activity share records content-interactions after navigator share |
| Rail layout | Low | Conditional hide save/like via capability flags |

## Why

Store-level engagement on timeline cards conflated business popularity with content performance. Activity identity is required for continuous Business stream → Global eligibility.

## Impact scope

| File | Change |
|------|--------|
| `resolveArtifactInteractionTarget.ts` | New canonical resolver |
| `useFeedRailEngagement.ts` | Hybrid entity + activity hook |
| `FeedArtifact` | `storeId`, `sourceType`, `sourceId`, `timelineItemType`, `promotionId` |
| `projectBusinessTimelineToFeedArtifacts.ts` | Propagate source fields |
| `artifacts.ts` | `storeId` on store hero |
| `FloatingFeedActionRail.tsx` | Use hybrid hook |
| `FeedRailEngagementStats.tsx` | Capability visibility props |

**Not changed:** Global feed ranking, comment stubs, messenger, notifications, database schema.

## Smallest safe patch (applied)

Single resolver + hybrid hook rather than forking rail or API.

## Regression checklist

| Check | Result |
|-------|--------|
| No new engagement tables | ✓ |
| No `/business-space/likes` API | ✓ |
| Follow store-level | ✓ |
| Show `show_item` identity | ✓ |
| Store hero entity scope | ✓ |
| Global store cards unchanged | ✓ |
| Unit tests | 31 passed |

## Deferred

- `GLOBAL_ACTIVITY_PROJECTION_NOT_YET_EXPLICIT` — browser cross-surface when Global exposes SPACE_UPDATE rows
- `PROMOTION_ACTIVITY_ENGAGEMENT_DEFERRED` — promotions without stable `promotionId`
- Activity save — content-interactions has no save endpoint
