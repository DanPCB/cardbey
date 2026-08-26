# Impact Report — Mobile Business Space Post Nav V1

**Date:** 2026-08-26 (nav) / 2026-08-27 (Phase 2 publish)  
**Status:** Nav + publish API implemented; browser round-trip pending  
**See also:** `docs/reports/IMPACT_REPORT_MOBILE_SPACE_POSTING_PHASE2.md`, `docs/SPACE_POST_GLOBAL_PROJECTION_V1.md`

## What could break

1. **Global mobile nav** — if Space detection is wrong, Library/Create labels could rename on `/`.
2. **Create sheet** — wrong sheet on Global if launcher always uses Space Post sheet.
3. **Me routing** — Space Me → `/space/personal` may surprise users who expected `/me` hub.
4. **Shows** — Business Space mobile Shows staying on `?tab=shows` differs from desktop theatre exit-to-Global (intentional per brief).
5. **Visitor Post** — must not publish as business; fallback to Global Create sheet.
6. **Publish / Global** — `GLOBAL_ELIGIBLE` bumps store `publishedAt`; Space-only posts must not bump. Preview-first Space resolve must merge public `recentActivity` or posts vanish after refresh.

## Why

Business Space theatre remounts Global `PublicFeedMobileNav` with Global semantics. Product requires Space-owned Home / Shows / Post / Assistant / Me, then authoritative publish into Space feed + optional Global eligibility.

## Impact scope

- Mobile only (`lg:hidden` bottom nav / FAB).
- Dashboard: Post sheet/compose, activity adapter, resolve merge, nav/registry.
- Core: `SPACE_UPDATE` lifecycle + `POST /api/stores/:storeId/space-updates`.
- Desktop Business Space / Global frontpage labels unchanged aside from intentional Space Shows tab behavior.

## Smallest safe approach

1. Gate renames/routes on `resolveActiveSpaceContext()`.
2. Separate `SpacePostSheet` — leave Global `createActionRegistry`.
3. Reuse `StoreActivityEvent` / `public_lifecycle` — no `SpacePost` table.
4. Global = rank bump of same business artifact (store-card), not a duplicate Global post row.
5. Personal Global omitted until policy supports person content.

## Publish / Global distribution

Implemented in Phase 2. Browser proof of BUSINESS→POST→SPACE FEED→GLOBAL→SPACE still required for `MOBILE_SPACE_POSTING_V1_READY`.
