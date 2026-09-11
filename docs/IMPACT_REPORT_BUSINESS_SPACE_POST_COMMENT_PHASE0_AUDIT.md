# PHASE 0 AUDIT — Business Space Post + Comment Convergence

**Date:** 2026-09-11  
**Scope:** `/space/:id` `+ Post` and `Write a comment…`  
**Rule:** Audit only — no implementation in this document’s phase.

---

## 1. AUDIT VERDICT

| Domain | Decision |
|--------|----------|
| **Post / Activity** | **`CANONICAL_CONTRACT_EXISTS_BUT_NEEDS_BRIDGE`** |
| **Comments** | **`NO_CANONICAL_CONTRACT_FOUND`** |

**Mission stop rule:** Comments have no create/list persistence API and no Comment entity. Building a new comment domain in this mission would violate “reuse before create.” **Do not implement comments until a separate canonical comment contract is approved.**

**Post path:** Canonical publisher already exists (`publishSpaceUpdate` → `StoreActivityEvent` / `SPACE_UPDATE`). UI `+ Post` is largely wired. Remaining gaps are UX/refresh/proof and Global projection semantics (store-card rank bump ≠ activity-row in Global feed).

---

## A. CANONICAL ACTIVITY SSOT

| Item | Evidence |
|------|----------|
| **Entity** | `StoreActivityEvent` (`apps/core/cardbey-core/prisma/schema.prisma`) |
| **Event contract** | `eventType: SPACE_UPDATE`, `source: 'public_lifecycle'` |
| **Doc SSOT** | `docs/SPACE_POST_GLOBAL_PROJECTION_V1.md` — explicitly rejects a `SpacePost` table |
| **Create/write** | `POST /api/stores/:storeId/space-updates` → `spacePostRoutes.js` → `lib/spacePosts/publishSpaceUpdate.js` → `emitPublicStoreLifecycleEvent` |
| **Auth** | `requireAuth` + `assertStoreOwner` / platform admin; client identity ignored; server sets `actorIdentity: 'business'` |
| **Read (Space)** | Public store DTO `recentActivity` via `attachPublicStoreAwarenessSignals` → `listPublicStoreLifecycleEvents` → Space timeline projection |
| **Identifiers** | DB: `StoreActivityEvent.id`. Space feed: `sourceId` = event id; artifact id `timeline:lifecycle:{eventId}` |
| **Dashboard publish client** | `lib/space/publishSpaceUpdate.ts` |
| **Compose UI** | `SpacePostSheet.tsx`, `SpacePostComposePanel.tsx` |

---

## B. BUSINESS SPACE CURRENT PATH

| Item | Evidence |
|------|----------|
| **Route** | `SpacePage.tsx` → `BusinessSpaceTheatreCanvas` → `PublicFeedShell` |
| **Feed source** | `useBusinessSpaceScopedFeed` / `businessTimelineProjection` / `projectBusinessTimelineToFeedArtifacts` |
| **Canonical IDs?** | Yes for lifecycle posts (`sourceId` = `StoreActivityEvent.id`) |
| **Central card** | Same `FeedArtifact` shell as Global; content is Space-scoped timeline (lifecycle + shows/live), **not** a copy of Global store-feed rows |
| **`+ Post` button** | `PublicFeedChrome` → `GlobalCreateLauncher` (`spaceMode` + owner → `'post'`) → `SpacePostSheet` → **wired** publish API (not a stub) |
| **Refresh** | `emitStoreProfileUpdated` → Space re-resolve; no optimistic prepend found; no dedicated Global feed query invalidation on post |

---

## C. COMMENT SSOT

| Item | Evidence |
|------|----------|
| **Prisma Comment model** | **None** |
| **Create/list API** | **None** |
| **Counter only** | `ContentInteractionMetrics.commentsCount` — read in summaries, **never incremented** |
| **Global comments** | Stub: `openComments()` toast “coming soon” (`socialInteractionApi.ts`); floating rail has no comment control |
| **Business Space UI** | `BusinessActivityComposerSlot.tsx` — resolves active artifact `contentId`/`contentType`, calls `openComments`, shows placeholder; file header: “Comments API is a platform gap” |
| **Doc status** | `docs/BUSINESS_SPACE_SOCIAL_LAYER_V1.md` — Comment = **UI_ONLY** |
| **Forbidden fork** | Docs forbid `BusinessSpaceComment` — must use future content-interactions keying |

**Keying intent (when comments exist):** `contentType` + `contentId` via `resolveActivityInteractionTarget` (`lib/social/resolveArtifactInteractionTarget.ts`), not a Space-only table.

---

## D. MEDIA PATH

| Media | Existing path | Reuse for + Post? |
|-------|---------------|-------------------|
| Image | `uploadFileThroughRuntime({ kind: 'hero' })` → performer runtime upload-hero | **Yes** (already used by `SpacePostComposePanel`) |
| Video | `uploadShowVideo(storeId, file)` → `POST /api/stores/:storeId/show-videos/upload` | **Yes** |
| Publish | Passes `mediaUrl` / `mediaKind` into space-updates; optional Show companion | **Yes** — no new storage domain |

---

## E. DUPLICATION RISKS — DO NOT EXTEND

| Risk | Action |
|------|--------|
| New `SpacePost` / `SocialPost` table | **Forbidden** — SSOT is `StoreActivityEvent` |
| `BusinessSpaceComment` table/domain | **Forbidden** until platform comment API exists |
| Dual Global post row | **Forbidden** — V1 Global = rank bump of store card, not second activity row |
| Reimplement fan-out inside Space UI | **Forbidden** — call `publishSpaceUpdate` / existing distribution flags only |
| Chat/threads (`ConversationThread`) as feed comments | **Wrong domain** |
| `ActivityEvent` (ops/telemetry) | **Wrong domain** |

---

## F. IMPLEMENTATION DECISION

### Posts / Activity
**`CANONICAL_CONTRACT_EXISTS_BUT_NEEDS_BRIDGE`**

Reuse:
- `publishSpaceUpdate` + `StoreActivityEvent` / `SPACE_UPDATE`
- Existing compose sheet + media uploads
- Space timeline projection

Bridge / prove (not new domain):
1. Confirm owner `+ Post` → composer → submit works end-to-end on target Space.
2. Immediate Space feed refresh without full reload (reuse `storeProfileUpdated` / reconcile by `sourceId`).
3. Global: **document and prove** existing V1 behavior (`GLOBAL_ELIGIBLE` → `publishedAt` bump → store card), **or** stop and get product approval before building Global **activity-row** projection (`GLOBAL_ACTIVITY_PROJECTION_NOT_YET_EXPLICIT` in docs).

### Comments
**`NO_CANONICAL_CONTRACT_FOUND`**

**STOP before implementing comments.**  
Required next step (out of band / separate mission): design canonical comment create+list on content-interactions (or approved SSOT), then wire `BusinessActivityComposerSlot` + Global to that API. Do not invent `BusinessSpaceComment`.

---

## Architecture contradiction (must not silently reinterpret)

Mission acceptance asks:

> Same canonical activity visible in Global with the **same activity ID**.

Existing locked V1 (`SPACE_POST_GLOBAL_PROJECTION_V1.md`) says:

> Global feed is **store-card** ordered; `GLOBAL_ELIGIBLE` only bumps `Business.publishedAt`. Space shows the update card; Global surfaces the **business** higher — **not** a second post row with the lifecycle event id.

**Evidence contradicts a literal “Global feed card id = StoreActivityEvent.id” acceptance.**  
Per mission operating rule: **stop and report before expanding scope** to invent Global activity-row fan-out.

---

## Phase 1 — Acceptance freeze (pending product confirm)

### POST — frozen against **existing** V1 contracts

| # | Criterion | Frozen interpretation |
|---|-----------|------------------------|
| 1–5 | Owner + Post → composer → one `SPACE_UPDATE` with business actor | **In scope** — reuse `publishSpaceUpdate` |
| 6–7 | Immediate Space appearance + survives refresh | **In scope** |
| 8–9 | “Visible in Global” + same ID | **BLOCKED pending product choice:** (A) accept rank-bump V1 as Global proof, or (B) approve new Global activity-row projection mission |
| 10 | No duplicate activity rows | **In scope** — enforce single `StoreActivityEvent` |

### COMMENT — frozen as **blocked**

| # | Criterion | Status |
|---|-----------|--------|
| All comment acceptance | Requires canonical comment API | **BLOCKED** — `NO_CANONICAL_CONTRACT_FOUND` |
| Remove “Comments are coming soon” | Only after runtime comments work | **Blocked** with comments |

### Fail-closed

| Rule | Status |
|------|--------|
| Unauthorized post → 401/403, no orphan | Already on `space-updates` — must remain |
| Comment without activity id | N/A until API exists — keep disabled/stub |

---

## Recommended next action (human gate)

1. **Confirm Global proof mode:** rank-bump V1 (**A**) vs new activity-row projection (**B**).
2. **Confirm comment mission:** separate platform mission to add content-interactions comment create/list **before** Space/Global UI activation.
3. Only after (1)–(2): proceed Phase 2+ for posts (and later comments).

**Do not start Phase 2–6 implementation until this gate is acknowledged.**
