# Phase 0 Completion Report — Canonical Draft Review Website Editing Entry

## Verdict

**`PHASE_0_CANONICAL_DRAFT_REVIEW_ENTRY_READY`**

## Exact files changed

### Core (`apps/core/cardbey-core`)

| File | Change |
|------|--------|
| `src/services/websiteEditing/resolveWebsiteEditingContext.js` | **New** — canonical resolver |
| `src/routes/websiteEditingRoutes.js` | **New** — owner GET context routes |
| `src/routes/admin/accountManagementRoutes.js` | Admin GET website-editing-context |
| `src/server.js` | Already mounts `websiteEditingRoutes` at `/api/stores` |
| `tests/websiteEditing/resolveWebsiteEditingContext.test.js` | **New** — 7 tests |

### Dashboard (`apps/dashboard/cardbey-marketing-dashboard`)

| File | Change |
|------|--------|
| `src/lib/websiteEditing/resolveWebsiteEditingTarget.ts` | **New** — client resolver |
| `src/lib/websiteEditing/buildWebsiteEditingReviewUrl.ts` | **New** — Draft Review URL builder |
| `src/lib/websiteEditing/safeWebsiteEditingReturnTo.ts` | **New** — open-redirect guard |
| `src/lib/websiteEditing/websiteEditingPhase0.test.ts` | **New** — 7 tests |
| `src/components/websiteEditing/WebsiteEditingContextBanner.tsx` | **New** — mode banners |
| `src/pages/myStores/MyStoresPage.tsx` | Owner **Website Editing** entry |
| `src/features/business-builder/pages/OverviewPage.tsx` | Owner dashboard entry |
| `src/pages/controlCenter/AccountManagementPage.tsx` | Admin **Edit Website** |
| `src/pages/store/StoreReviewPage.tsx` | Banner when `websiteEditing=1` |

### Docs (parent monorepo)

| File | Change |
|------|--------|
| `docs/reports/PLAN_MERGE_DRAFT_REVIEW_WEBSITE_EDITING_V1.md` | Plan |
| `docs/reports/PHASE_0_WEBSITE_EDITING_IDENTITY_RESOLUTION.md` | Identity resolution |
| `docs/reports/IMPACT_REPORT_STORE_SHOWS_CMS_V1.md` | Earlier impact (superseded approach for Phase 1+) |
| `docs/reports/IMPLEMENTATION_REPORT_PHASE_0_WEBSITE_EDITING.md` | This report |

## Resolver contract and order

1. Explicit `revisionId` / `draftId` (must match store when both given)  
2. Existing DraftStore for store  
3. Legacy `generationRunId` → draft (optional)  
4. Initialise editable DraftStore via create-from-store contract (same Business only)

`generationRunId` is **not** required to open Website Editing.

## Owner route / navigation

- **My Stores** → **Website Editing** → `resolveWebsiteEditingTarget({ entry: 'owner' })` → `/app/store/{id}/review?websiteEditing=1&…`
- **Business Overview** → **Open Website Editing** (same resolver)
- `returnTo`: `/my-stores` or overview URL (sanitised)

## Admin route / navigation

- **Control Center → Account Management** → Edit Website panel (store id) or per-row **Edit Website** on duplicate stores  
- Same Draft Review URL with `entry=admin`  
- Server: `GET /api/admin/platform/account-management/stores/:storeId/website-editing-context` (`requireAdmin`)

## Legacy URL compatibility

- Existing `/app/store/.../review?generationRunId=…` still works  
- Resolver accepts optional `generationRunId` and maps to draft context  
- New URLs omit `generationRunId` when not needed  

## Identity / duplicates / live content

- No new Business created  
- Init creates/reuses **DraftStore** only (`source: website-editing-phase0` or existing edit draft)  
- Response always includes `liveUnchanged: true`  
- Opening the page does not call publish  

## Permission enforcement

- Owner: `Business.userId === req.userId`  
- Cross-store draft: `403 cross_store_draft`  
- Admin support: `isPlatformAdmin`  
- Non-admin + `adminSupport`: `403`  

## Tests run

| Suite | Result |
|-------|--------|
| `tests/websiteEditing/resolveWebsiteEditingContext.test.js` | **7 passed** |
| `src/lib/websiteEditing/websiteEditingPhase0.test.ts` | **7 passed** |

## Local verification notes

- Entry wiring verified in My Stores, Overview, Account Management, StoreReviewPage banner  
- Full browser smoke (owner + admin click-through) should be done on a running Core + Vite pair before merge  
- Screenshots not captured in this agent session  

## Phase 1 blockers / notes

1. Shows / Featured Content still need Draft Review adapters (Phase 1) — not in Phase 0  
2. Pre-existing untranslated `miJob.review.*` keys remain (Phase 1 polish)  
3. `create-from-store` historically may omit `committedStoreId`; resolver still finds drafts via `input.storeId`  
4. “Store Edit” on My Stores still opens mini-website preview (legacy) — distinct from Website Editing → Draft Review; do not confuse in Phase 1 docs  

## Git status (at completion)

| Repo | Branch | HEAD (short) |
|------|--------|--------------|
| Parent `C:\Projects\cardbey` | `fix/upload-ask-presentoptions-storename` | `ba2d292f0` |
| Core submodule | `fix/upload-ask-presentoptions-storename` | (dirty: Phase 0 files) |
| Dashboard submodule | `fix/upload-ask-create-store-zero-confidence-gate` | (dirty: Phase 0 files) |

Working tree: Phase 0 files uncommitted (not pushed). Performer create-store orchestra: **unchanged**.
