# IMPACT REPORT — Business Space Social V1 (Post + Comment)

**Date:** 2026-09-11  
**Status:** User-locked product decisions — proceed  
**Related:** `IMPACT_REPORT_BUSINESS_SPACE_POST_COMMENT_PHASE0_AUDIT.md`

## Goal

1. Complete existing `+ Post` → `publishSpaceUpdate` → `StoreActivityEvent` path (no new post domain).
2. Add one platform `Comment` model + API reusable by Space/Global.
3. Wire Business Space comment UI; sync `commentsCount`.
4. Global activity-row projection deferred (`FOLLOW_UP`).

## What could break

| Risk | Why | Mitigation |
|------|-----|------------|
| Migration fails on staging/prod | New table | Minimal postgres migration only; sqlite via db push for local |
| commentsCount drift | Dual counter | Count from Comment rows; sync metrics on write/list |
| Unauthorized posts | Client storeId spoof | Keep assertStoreOwner on space-updates |
| Spoofed comment actors | Client actorId | Server derives from requireAuth userId |
| Composer still stub | Missed wire | Replace openComments path in BusinessActivityComposerSlot |

## Smallest safe patch

- Prisma `Comment` + migration
- `activityCommentService` + routes under content-interactions + `/api/activities/:id/comments` alias
- Dashboard comment client + composer slot
- Post refresh already via `emitStoreProfileUpdated` — verify only

## Explicitly not doing

- Global activity-row projection V2
- Nested replies UI, comment reactions, moderation console
- BusinessSpaceComment / SpacePost tables
