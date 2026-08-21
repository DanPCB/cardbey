# Phase 0 — Canonical Website Editing identity resolution

**Verdict target:** `PHASE_0_CANONICAL_DRAFT_REVIEW_ENTRY_READY`  
**Date:** 2026-08-21

## Model

- **Performer** remains the create/improve runway (unchanged in Phase 0).
- **StoreDraftReview** (`/app/store/:storeId/review`) is the only manual Website Editing surface.
- Opening Website Editing resolves an editable **DraftStore** revision for the **same** Business. It never creates another Business/store.

## Resolver contract

### Core

`resolveWebsiteEditingContext(prisma, args)`  
File: `apps/core/cardbey-core/src/services/websiteEditing/resolveWebsiteEditingContext.js`

| Arg | Role |
|-----|------|
| `storeId` | Canonical Business id (optional if `draftId` provided) |
| `draftId` / `revisionId` | Explicit DraftStore id (`revisionId` aliases `draftId`) |
| `generationRunId` | Legacy optional; translated into draft context — **not required** |
| `adminSupport` | Requires `isPlatformAdmin` |
| `allowInit` | When true and store has no draft, initialise via create-from-store contract |

### Resolution order

1. Explicit `revisionId` / `draftId` — must belong to requested store when both present  
2. Existing DraftStore for store (`resolveDraftForStore`)  
3. Legacy `generationRunId` → draft (temp lineage)  
4. Initialise editable revision via existing create-from-store contract (same store only)

### Guarantees

- No new Business  
- Cross-store draft rejected (`cross_store_draft`)  
- Owner must own store; admin path requires platform admin  
- `liveUnchanged: true` — open does not publish  
- Init may create a **DraftStore** row only (idempotent with existing edit draft)

### HTTP

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/stores/:storeId/website-editing-context` | Owner of store |
| GET | `/api/stores/website-editing/by-draft/:draftId` | Draft access |
| GET | `/api/admin/platform/account-management/stores/:storeId/website-editing-context` | Platform admin |

## Client

`resolveWebsiteEditingTarget` → `buildWebsiteEditingReviewUrl`  
Opens: `/app/store/{storeId\|draft}/review?mode=draft&websiteEditing=1&entry=owner|admin&weKind=…&draftId=…`

Optional deep-link (Phase 1+): `section`, `itemId` (validated/ignored safely).  
`returnTo` sanitised to same-origin relative paths only.

## Entry points

| Who | Path |
|-----|------|
| Owner | My Stores → **Website Editing**; Business Overview → **Open Website Editing** |
| Admin | Control Center → Account Management → **Edit Website** (store id or duplicate-store row) |

## Mode labels (`weKind`)

- `generated_draft`
- `unpublished_revision`
- `published_with_revision`

Banner states live site is unchanged until publish; admin shows support mode.
