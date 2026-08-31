# Cardbey Activity-Level Engagement V1

**Target:** `CARDBEY_ACTIVITY_ENGAGEMENT_V1_READY`  
**Date:** 2026-08-29  
**Verdict:** `CARDBEY_ACTIVITY_ENGAGEMENT_V1_READY` (with documented global projection boundary)

---

## Summary

Business Space and Global share `FloatingFeedActionRail` but previously resolved **all** like/save/share through `resolveEngagementStoreId` → store-level engagement. Timeline activities (`SPACE_UPDATE`, `SHOW`, etc.) could not own independent reactions.

This phase introduces **capability-aware interaction identity**:

| Level | Actions | Identity |
|-------|---------|----------|
| **Entity** | Follow, store hero Like/Save/Share | `storeId` |
| **Activity** | Timeline Like, Share recording | `content-interactions` via `sourceType` + `sourceId` |

No new tables, APIs, or rails were created. Existing `content-interactions` is the activity primitive.

---

## Architecture

```
BusinessTimelineItem (sourceType, sourceId)
        ↓ projectBusinessTimelineToFeedArtifacts
FeedArtifact (+ storeId, sourceType, sourceId, timelineItemType)
        ↓ resolveArtifactEngagement
┌───────────────────┬────────────────────────────┐
│ Entity (store)    │ Activity (content)         │
│ useStoreEngagement│ content-interactions API   │
│ Follow            │ toggleLove / shareContent  │
│ Hero Like/Save    │ per canonical contentId    │
└───────────────────┴────────────────────────────┘
        ↓ useFeedRailEngagement
FeedRailEngagementStats (capability-filtered)
```

**Key files:**

| File | Role |
|------|------|
| `resolveArtifactInteractionTarget.ts` | Canonical resolver — single source of truth |
| `useFeedRailEngagement.ts` | Hybrid hook for rail |
| `projectBusinessTimelineToFeedArtifacts.ts` | Propagates source identity |
| `FloatingFeedActionRail.tsx` | Wired to hybrid engagement |
| `FeedRailEngagementStats.tsx` | `showLike` / `showSave` / `showShare` caps |

---

## Canonical interaction keys

| Source | `contentType` | `contentId` | Notes |
|--------|---------------|-------------|-------|
| `public_lifecycle` (SPACE_UPDATE) | `feed_artifact` | `public_lifecycle:{sourceId}` | Cross-surface stable |
| `show_featured_work` | `show_item` | `{sourceId}` | Preserves storefront Show identity |
| `live_market_session` | `feed_artifact` | `live_market_session:{sourceId}` | Live session scoped |
| `public_lifecycle` (PROMOTION) + `promotionId` | `campaign` | `{promotionId}` | When commerce ref present |
| PROMOTION without `promotionId` | — | — | `PROMOTION_ACTIVITY_ENGAGEMENT_DEFERRED` |
| Store hero (`store:{id}`) | — | — | Entity scope only |

Uses `timelineSourceKey(sourceType, sourceId)` from `businessTimelineContract.ts`.

---

## Capability matrix

| Source type | Canonical identity | Like | Save | Share | Follow | Comments | Global cross-surface |
|-------------|-------------------|------|------|-------|--------|----------|---------------------|
| **STORE hero** | `storeId` | store | store | business URL | store | n/a | store card (same store engagement) |
| **SPACE_UPDATE** | `public_lifecycle:{sourceId}` | activity | hidden* | activity URL | store | future | resolver ready; **GLOBAL_ACTIVITY_PROJECTION_NOT_YET_EXPLICIT** |
| **SHOW** | `show_item:{workId}` | activity | hidden* | show URL | store | future | same as storefront Show |
| **LIVE** | `live_market_session:{sessionId}` | activity | hidden* | activity URL | store | future | session-scoped |
| **PROMOTION** (with id) | `campaign:{promotionId}` | activity | hidden* | activity URL | store | future | when promotion id present |
| **PROMOTION** (no id) | deferred | hidden | hidden | store URL | store | future | `PROMOTION_ACTIVITY_ENGAGEMENT_DEFERRED` |

\* Activity save not supported by `content-interactions` API — save hidden for activity scope (no fake store substitute).

---

## Invariants (proven in unit tests)

1. **Two updates, same store** — Like A ≠ Like B; Follow A = Follow B (store-level)
2. **Cross-business** — Same `sourceId` on different stores does not collide (metrics keyed by contentId; store metadata separate)
3. **Cross-surface resolver** — Same `sourceType` + `sourceId` → same `contentId` regardless of `artifact.id`
4. **Store hero** — Remains entity-scoped; distinct from SPACE_UPDATE like on same page
5. **Show identity** — `show_item` + work id preserved for storefront parity

---

## Global projection boundary

Global feed today often ranks a **store card** rather than an explicit `SPACE_UPDATE` row. This phase does **not** redesign Global feed projection.

- Resolver + API identity are **ready** when Global exposes the same `sourceType`/`sourceId` on artifacts
- Browser cross-surface round-trip marked: **`GLOBAL_ACTIVITY_PROJECTION_NOT_YET_EXPLICIT`**
- Store-level Global feed behaviour **unchanged** (no regression)

---

## content-interactions audit (reuse)

| Aspect | Status |
|--------|--------|
| Persistence | `ContentInteractionMetrics` + `ContentInteractionViewerState` |
| API | `GET/POST /api/public/content-interactions/:type/:id/{view,love,clap,share}` |
| Reactions | love (toggle), clap (increment), share (deduped) |
| Save | **Not supported** — activity save hidden on rail |
| Viewer | `x-cardbey-viewer-key` (anonymous OK) |
| Shows | `show_item` — operational on storefront |
| Feed | Now wired via `useFeedRailEngagement` |

No schema migration. No `BusinessActivityLike` / `GlobalActivityLike` tables.

---

## Telemetry

`useFeedRailEngagement` records `recordAttentionSignal` with:

- `surface`: `business_space` | `global_feed`
- `artifactId`, `sourceType`, `sourceId`, `storeId`
- `likeScope`: `store` | `activity` | `none`

---

## Tests (local)

```
31 passed — resolveArtifactInteractionTarget, useFeedRailEngagement,
projectBusinessTimelineToFeedArtifacts, FloatingFeedActionRail
```

Critical cases:

- SPACE_UPDATE source identity survives projection
- Two posts same business — independent like keys
- Cross-surface canonical contentId
- Store hero vs activity scope
- Follow remains store-level

---

## SOCIAL_PLATFORM_CAPABILITY_GAPS (unchanged)

Not in scope for this phase:

- Comments, Messenger, Notifications, Business DM
- Linked businesses, Follower list, Reviews
- Activity save (needs content-interactions extension)
- Desktop Post adaptation
- Global explicit SPACE_UPDATE row projection

---

## Related

- `docs/BUSINESS_SPACE_SOCIAL_LAYER_V1.md` (updated)
- `docs/reports/IMPACT_REPORT_CARDBEY_ACTIVITY_LEVEL_ENGAGEMENT_V1.md`
