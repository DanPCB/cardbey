# Phase 1 — Draft Review Content Adapters (Shows / Featured Content)

**Authorization:** `ACK PHASE_1_DRAFT_REVIEW_CONTENT_ADAPTERS`  
**Date:** 2026-08-21  
**Verdict:** `PHASE_1_CANONICAL_SHOWS_MANUAL_EDITING_READY`

## Phase 0 checkpoint

| Repo | SHA | Message |
|------|-----|---------|
| Parent (cardbey) | `07052b321` | chore(website-editing): Phase 0 canonical Draft Review entry checkpoint |
| Dashboard submodule | `729e427b` | chore(website-editing): Phase 0 Draft Review entry checkpoint |

Not pushed. Unrelated dirty `server.js` noise was stripped before the checkpoint so only Website Editing mounts were included.

## Canonical Shows source

| Layer | Location |
|-------|----------|
| Public UI | `StoreShowSection` / `resolveFeaturedWorks` (`storeFeaturedWorks.ts`) |
| Persistence | `Business.storefrontSettings.featuredWorks` (JSON array) |
| Mirror | `Business.stylePreferences.miniWebsite.sections[]` where `type === 'show'` |
| Upload path | `showVideoUploadService.js` (writes same JSON) |
| New Phase 1 API | `GET/PATCH/POST /api/stores/:storeId/shows…` → `storeShowsService.js` |

**No new Shows table / CMS.** Adapter is a thin management surface over the existing JSON representation.

### Root cause of unrelated Shows (e.g. “Assessment”, “Basic Package”)

Public `resolveFeaturedWorks` merges multiple buckets (`featuredWorks`, creatives, campaign assets, show-section items, **and product/hero fallbacks**). Seeded or imported `featuredWorks` (and/or section items) can contain titles unrelated to the store vertical. Phase 1 does **not** repair production data; owners can now hide/archive those items. Deterministic `relevanceWarning` flags flower-store + consulting/package-style titles for review.

## Adapter architecture

- Registry: `features/storeDraft/adapters/draftContentAdapters.ts` (`catalog` | `shows`)
- Host: `StoreDraftReview` content selector (`data-testid="draft-content-adapter-tabs"`)
- Shows panel: `ShowsReviewPanel` + `ShowEditDrawer` (reuses ProductEditDrawer shell patterns: overlay, focus, unsaved warning, mobile sheet)
- Deep links: `?section=shows&itemId=…` (Phase 0 URL builder already allowed `shows`)
- Catalog path, draft patch, and publish path unchanged
- Performer create-store orchestra untouched

## Mutation & lifecycle contracts

Statuses on each work: `DRAFT` | `PUBLISHED` | `HIDDEN` | `ARCHIVED` (legacy unset ≡ `PUBLISHED`).

| Action | Behaviour |
|--------|-----------|
| Hide | Immediate `HIDDEN`; removed from public projection; feed rank bump |
| Archive | Soft `ARCHIVED`; recoverable list filter |
| Restore | Defaults to `HIDDEN` (non-public); publish requires explicit confirm |
| Publish Show | Explicit `confirmed: true` endpoint |
| Public filter | `filterPublicFeaturedWorks` / `resolveFeaturedWorks` drop non-published |

Server validates store ownership (or platform admin). Optional `AuditEvent` write (`store_shows_update`) when available.

## Owner & admin paths

- Owner: My Stores / Overview → Website Editing → Shows tab
- Admin: Account Management **Edit Website** → same Draft Review + Shows adapter (`entry=admin`)
- Same Business `featuredWorks` + same DraftStore revision for catalog; Shows mutations target the store JSON (canonical for Shows)

## Translations

`features.miJob.review.*` was missing from the loaded i18n bundle (duplicate/`deepMerge` wipe). Fixed by `src/i18n/storeDraftReviewResources.js` deep-merged after other resources for **en** and **vi**. Test asserts keys do not render raw.

## Legacy Store Edit convergence

| | |
|--|--|
| Route / entry | My Stores **Store Edit** → `resolveCommittedStoreWebsiteEditorTarget` → `/preview/website/:draftId` |
| Capabilities | Mini-website presentation (style, hero, section anchors including `#show`) |
| Persistence | Preview / mini-website composition path — **not** Draft Review catalog patch |
| Overlap | Both can touch show-section presentation; Phase 1 Shows management is Draft Review → `featuredWorks` |
| Gaps vs Draft Review | Presentation chrome, style picker, Replace menu flows still live in Store Edit / preview |
| **Recommendation** | **Retain temporarily** as presentation editor. After named gaps close (hero/style/section chrome in Website Editing), **redirect/delegate** Store Edit → canonical Website Editing. Do **not** grow Store Edit into a second general manual CMS. |

## Tests

| Suite | Result |
|-------|--------|
| Core `resolveWebsiteEditingContext` (9) | pass |
| Core `storeShowsService` (6) | pass |
| Dashboard adapters + i18n + public filter | pass |
| Dashboard Phase 0 websiteEditing | pass |

## Phase 2 / 3 gaps

- Performer automatic/manual fork controls
- General AI regeneration / field-level provenance UI
- Dedicated admin audit UI (AuditEvent write exists; no isolated audit table invented)
- Full Store Edit → Website Editing redirect
- Production BB Flowers data cleanup (owner hide/archive only in Phase 1)
- Optional: move Shows overlays into DraftStore revision until publish (today lifecycle writes store JSON immediately for hide — intentional)

## Files changed (Phase 1)

**Core:** `storeShowsService.js`, `storeShowsRoutes.js`, `server.js` (mount), `showVideoUploadService.js`, `resolveWebsiteEditingContext.js` (init lock), tests  

**Dashboard:** adapters, `ShowsReviewPanel`, `ShowEditDrawer`, `storeShowsApi.ts`, `StoreDraftReview.tsx`, `storeFeaturedWorks.ts`, `storeDraftReviewResources.js`, `i18n.js`, tests  

**Docs:** this report
