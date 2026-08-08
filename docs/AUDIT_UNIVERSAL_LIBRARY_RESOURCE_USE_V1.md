# AUDIT — Universal Library Resource Use V1

**Date:** 2026-08-08  
**Branch:** `feat/ul-resource-use-v1` (from staging)  
**Target verdict:** `UNIVERSAL_LIBRARY_RESOURCE_USE_V1_READY`

---

## Exact answers

### 1. Which existing component should own resource selection?

**`UniversalLibraryPage`** owns selection state (`detail` + `onSelectAsset`).  
**`ResourceCard`** discovers; **`ResourceDetailSheet`** is the action surface for Preview / Use this / Save.  
Do not invent a second picker.

Paths:
- `apps/dashboard/.../pages/library/UniversalLibraryPage.tsx`
- `.../components/ResourceCard.tsx`
- `.../components/ResourceDetailSheet.tsx`

### 2. Which existing URI method/API should validate reuse?

Canonical path (Dashboard client already present):

| Step | API | Client |
|------|-----|--------|
| Health | `GET /api/resource-intelligence/health` | `uriHealth` |
| Select + revalidate | `POST /api/resource-intelligence/select` | `uriSelect` |
| Confirm → draft | `POST /api/resource-intelligence/reuse/confirm` | `uriReuseConfirm` |
| Workspace place | `POST /api/resource-intelligence/workspace/place` | `uriWorkspacePlace` |
| Business task | `POST /api/resource-intelligence/tasks/run` · `/tasks/action` | `uriRunBusinessTask` / `uriCandidateAction` |

Dashboard clients: `apps/dashboard/.../lib/universalResourceIntelligence/api.ts`  
Core implementation (historical): commit `aa9a3f291` — `src/services/universalResourceIntelligence/**`  
**On this branch before restore:** Core URI **absent** (blocker).

Universal Library `/api/universal-library/*` is **catalogue authority only**, not reuse validation.

### 3. Which destinations already accept an external/library resource?

| Destination | Status |
|-------------|--------|
| Display playlist draft | URI `display_playlist_draft` / `CREATE_DISPLAY_PLAYLIST` (Core adapters when URI restored) |
| Promotion draft | URI `promotion_draft` / `CREATE_PROMOTION` |
| Storefront / landing hero | URI `storefront_hero_draft` / `CREATE_STOREFRONT_HERO` |
| Social content draft | URI `social_content_draft` / `CREATE_SOCIAL_POST` |
| Product media pickers | Accept `ContentAsset` URLs via **parallel Pexels path** — not UL/URI rights-gated |

### 4. Which destinations require a thin adapter?

All Library → product destinations need a **UL → URI** bridge (`UniversalAsset.id` → select/confirm or library-use endpoint wrapping `materializeDestination`).  
Performer needs `openPerformerIntent` + structured `sourceContext` (no new assistant).

### 5. Can provider-hosted resources remain provider-hosted?

**Yes.** Pexels UL sync uses `hostingMode=REFERENCE`; URI custody for Pexels is `PROVIDER_HOSTED` with `binaryStored: false`. Do not download provider binaries on Use.

### 6. What happens for REFERENCE_ONLY resources?

| Kind | Behavior |
|------|----------|
| Pexels catalogue `REFERENCE` | Preview/play via CDN; not Cardbey-owned binary |
| Creator `LIBRARY_ACCESS_MODE.REFERENCE_ONLY` | Often unpublished; not publication-eligible |
| URI guards | `publicationEligible: false` for REFERENCE_ONLY custody |

Use may create **drafts that keep provider reference**; never claim Cardbey ownership of the binary.

### 7. Is there already a reusable ResourceUseIntent / ResourceReference contract?

**No** TS/Prisma symbols named `ResourceUseIntent` / `ResourceReference` on this branch.  
Closest: URI docs `ReuseIntent` / `ExternalResourceUse` / `ReuseDecision` (restored with URI stack) + `UniversalAsset` + `UriContentAsset`.

V1 adds a thin **`LibraryResourceUseReference`** (Dashboard) wrapping UL id + URI decision ids — not a parallel DB.

---

## Blockers (pre-restore)

| ID | Missing | Risk if ignored |
|----|---------|-----------------|
| B1 | Core `universalResourceIntelligence` + `/api/resource-intelligence` | Parallel rights engine |
| B2 | URI reuse tables (`ensure-uri-reuse-tables.mjs`) | No audit trail (in-memory fallback exists for tests) |
| B3 | UL → URI id bridge | Cannot select/confirm from Library asset id |
| B4 | Public projection omitted `rightsStatus` | UI cannot truthfully gate Use |

---

## Smallest safe implementation plan

1. **Restore** URI Core from `aa9a3f291` (services, routes, ensure script) — do not rewrite rights.  
2. Wire `Features.universalResourceIntelligence` + server mount.  
3. Add **`useUniversalLibraryAsset`** bridge: load UL asset → rights/custody map → URI select/confirm or `materializeDestination` with `confirm: true`.  
4. Dashboard: detail rights truth, Use this chooser, Performer handoff, telemetry.  
5. Save: keep deferred (`requestSaveAssetToSuitcaseFuture`) unless Suitcase primitive is ready.  
6. Recommendations: no new engine; keep generic Recommended.

---

## Architectural boundaries (locked)

| Layer | Owns |
|-------|------|
| Universal Library | Discover → Understand → Select |
| URI | Validate → Resolve reuse → Handoff |
| Destination capabilities | Create **draft** only |
| Performer | Intent orchestration; confirm before execute |
| Safe Execution | Publish / messaging / billing / signage push |

**No silent publish. No new assistant. No mass download.**
