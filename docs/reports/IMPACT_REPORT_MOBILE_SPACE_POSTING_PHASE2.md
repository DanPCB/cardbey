# Impact Report — Mobile Space Posting Phase 2

**Date:** 2026-08-27  
**Target:** `MOBILE_SPACE_POSTING_V1_READY`  
**Scope:** Authoritative Space publish → Business Space feed → Global-eligible projection  
**Shell:** No redesign of Space mobile nav / Post sheet chrome

---

## (1) What could break

- Business Space Content feed could show wrong or duplicate lifecycle rows if `SPACE_UPDATE` is not filtered cleanly.
- Global public feed ranking could thrash if every Space-only post bumps `publishedAt`.
- Owner Shows could gain unintended DRAFT/PUBLISHED works when media is attached.
- Unauthenticated / non-owner callers could publish if auth is miswired.
- Space resolve path that prefers `/api/store/:id/preview` could continue omitting `recentActivity`, so posts never appear after refresh.
- Dashboard Post sheet could present dead “Update / Photo” actions that only open Performer.
- Unrelated monorepo WIP (contact-sync) could be mixed into this branch/PR if not isolated.

## (2) Why

- Public lifecycle events already power `recentActivity`; adding a new event type expands the public surface.
- Global feed is **store-card** ordered by `Business.publishedAt`, not post-card; rank bump is the existing projection lever.
- Shows are mutated via `featuredWorks` / `upsertStoreShow`.
- Preview resolve currently short-circuits before public store awareness attachment.
- Phase 1 Post nav only handed off to Performer (`autoSubmit: false`) without a write API.

## (3) Impact scope

| Area | Impact |
|------|--------|
| Core `StoreActivityEvent` + `public_lifecycle` | New `SPACE_UPDATE` type; list/project metadata |
| Core `POST /api/stores/:storeId/space-updates` | New owner publish route |
| Public store DTO `recentActivity` | Includes Space updates |
| Dashboard SpacePostSheet | Compose + publish for Update / Photo·Video |
| Business Space Content feed | Projects `SPACE_UPDATE` |
| Global feed | Rank bump only when `GLOBAL_ELIGIBLE` |
| Shows | Optional media reference when media present |
| Personal Space | Compose UI may exist; **no** Global person-post unless policy already supports it |
| Auth / idempotency | Owner-only; Idempotency-Key / entityId dedupe |

## (4) Smallest safe patch

1. **Reuse** `StoreActivityEvent` (`source: public_lifecycle`) — do **not** create `SpacePost` table.
2. Add `SPACE_UPDATE` + `publishSpaceUpdate` service + route under `/api/stores/:storeId/space-updates`.
3. `GLOBAL_ELIGIBLE` → `bumpPublicFeedRankForStore`; `SPACE_ONLY` → no rank bump.
4. Media → optional `upsertStoreShow` (reference URL, no binary copy).
5. Dashboard: compose panel + API client; map `SPACE_UPDATE` in activity adapter; enrich Space resolve with public `recentActivity`.
6. Personal: keep Performer for non-operational paths; document Global boundary.
7. Focused git branch from staging; leave contact-sync stash untouched.

**Proceeding with this minimal patch.**
