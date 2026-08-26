# Space Post → Global Projection V1

**Date:** 2026-08-27  
**Related:** `docs/MOBILE_BUSINESS_SPACE_POST_NAV_V1.md`, `docs/reports/IMPACT_REPORT_MOBILE_SPACE_POSTING_PHASE2.md`

---

## Authoritative content model

| Choice | Detail |
|--------|--------|
| **SSOT** | `StoreActivityEvent` with `source: 'public_lifecycle'` and `eventType: SPACE_UPDATE` |
| **Not used** | New `SpacePost` table, `BusinessEvent` ledger, Content Studio rows, CreatorContent |
| **Media companion** | Optional `featuredWorks` Show via `upsertStoreShow` (URL reference; no binary duplicate) |

Emit path: `publishSpaceUpdate` → `emitPublicStoreLifecycleEvent` → attached on public store DTO as `recentActivity` via `attachPublicStoreAwarenessSignals`.

---

## API

```
POST /api/stores/:storeId/space-updates
Auth: requireAuth
Owner: assertStoreOwner (or platform admin)
Idempotency: Idempotency-Key header or body.idempotencyKey → metadata.entityId (24h dedupe)
```

Body (V1):

- `text` (or media)
- `mediaUrl` / `mediaKind` (optional; http(s) only)
- `productId` / `serviceId` / `promotionId` (optional; must belong to store)
- `distribution`: `SPACE_ONLY` | `GLOBAL_ELIGIBLE`
- `attachToShows` (default true when media present)

Server derives: store identity, actor, timestamps. Client-submitted owner identity is ignored.

---

## Identity

| Space | Publish identity |
|-------|------------------|
| Business Space | **AS BUSINESS** (`actorIdentity: business`) |
| Personal Space | Person path **not** writing to this store API; Global person posts not forced |

---

## Distribution

| Intent | Space feed | Global |
|--------|------------|--------|
| `SPACE_ONLY` | Yes (`recentActivity`) | No rank bump |
| `GLOBAL_ELIGIBLE` | Yes | `bumpPublicFeedRankForStore` updates `Business.publishedAt` |

**Important:** Global feed (`GET /api/public/stores/feed`) is **store-card** ordered, not a second post row. V1 Global projection = eligibility via rank bump of the **same** business artifact. One logical publication; Space shows the update card; Global surfaces the business higher / refreshed.

Do **not** treat every operational lifecycle event as Global — only explicit Space posts with `GLOBAL_ELIGIBLE`.

---

## Round trip

```
Business Space → Post (compose) → SPACE_UPDATE
  ├── Business Space Content (recentActivity)
  └── GLOBAL_ELIGIBLE → publishedAt bump
        → Global feed store card
        → open Space (`/space/:storeId`) via existing feed navigation
        → same Business Space
```

Source event id preserved on Space feed as `lifecycle:{eventId}`.

---

## Shows

When media is present and `attachToShows !== false`, publish creates/updates a Show work referencing the same `mediaUrl`. Space Shows tab reads `featuredWorks` — no second binary upload required for the link.

---

## Personal Space boundary

Global feed today is business/store oriented. Personal Update/Photo remain Performer-prepared (`autoSubmit: false`) and are labeled **not Global yet**. Do not invent person Global cards in V1.

---

## Permission / safety proofs (unit)

- Unauthenticated → 401 via `requireAuth`
- Non-owner → 403
- Invalid media URL → 400
- Cross-store catalog id → 400
- Idempotent retry → 200 + `deduped: true`, no second event / no second rank bump

---

## Cache / invalidation

After publish, dashboard calls `emitStoreProfileUpdated(storeId)` so Space re-resolves store (preview + public awareness merge). Does not force location/connections/Live refetch unless those listeners already share the event.
