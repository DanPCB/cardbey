# IMPLEMENTATION REPORT — Style Convergence C2 (Draft persistence)

**Authorization:** `ACK STYLE_CONVERGENCE_C1_RUNTIME_CLOSURE_AND_C2_DRAFT_PERSISTENCE`  
**Date:** 2026-08-21

## Gate 1 — C1 runtime

**Verdict:** `STYLE_CONVERGENCE_C1_RUNTIME_VERIFIED`

| Check | Result |
| ----- | ------ |
| Core with `websiteEditingRoutes` (server.js mount; createApp also lists same mount) | Pass on `:3041` with flag ON |
| Owner `GET …/design-projection` → `design_presentation_projection.v1` | Pass |
| Correct store + draft revision | Pass |
| Provenance/conflicts present | Pass |
| Cross-store 403 | Pass |
| Unauth 401 | Pass |
| Admin GET under account-management (requireAdmin + adminSupport, allowInit false) | Added |
| No draft init / no DraftStore mutate / no Business theme mutate on GET | Pass |
| Flag OFF → `NOT_ENABLED` (`:3042`) | Pass |
| Route integration tests | `websiteEditingDesignProjection.route.test.js` |

Corrective commit: `243c23f67` (route tests + admin read path).  
Note: full `createCardbeyApp()` boot remains blocked by unrelated missing WIP modules (`registerPerformerCapabilities`); canonical HTTP entry `server.js` mounts the same router.

---

## Gate 2 — C2 draft persistence

**Verdict:** `STYLE_CONVERGENCE_C2_DRAFT_PERSISTENCE_READY`

### Canonical draft design structure

`DraftStore.preview.website.designPresentationV1` (`contractVersion: designPresentationV1`):

- `templateId`, `designTokensRef`, `heroRef`, `layoutVariant`
- `provenance` (source, bootstrapSource, actorId, updatedAt)
- `baseRevisionFingerprint`, `compositionRelation`

Also mirrors `preview.website.theme.templateId` for existing theme consumers.

### Preset mapping

Canonical IDs: `minimal` | `bold` | `editorial` | `warm` | `dark`  
Legacy labels: `Dark Luxury` / `dark_luxury` → `dark`. Unsupported labels → `unsupported_preset`. Arbitrary CSS/token blobs → `unsafe_payload`.

### Hero reuse

`executeSetHero` → `updateHeroForStore(..., { draftOnly: true })`  
New `draftOnly` skips `syncBusinessHeroProfile`. Existing `HeroImageEditor` path unchanged (may still sync Business when not using Design adapter).

### APIs / commands

| Method | Path |
| ------ | ---- |
| POST | `/api/stores/:storeId/website-editing/design/template` |
| POST | `/api/stores/:storeId/website-editing/design/hero` |
| POST | `/api/admin/platform/account-management/stores/:storeId/website-editing/design/template` (reason required) |

Flags + auth + store/draft association + OCC (`expectedFingerprint` = `draftId:updatedAt`) + AuditEvent.

### Precedence after mutation

1. Explicit `designPresentationV1`  
2. Other DraftStore theme/hero  
3. Composition/adoption (reference; may be marked stale)  
4. Business style prefs  
5. miniWebsite  
6. Defaults  

### Staleness

`setTemplate` / `setHero` may set `compositionAdoption` / `designAdoption` / `websiteDirection` → `status: stale` (metadata only). Does not auto-publish or rewrite miniWebsite theme.

### Audit / concurrency

Audit: `entityType=DraftStore`, action `website_editing.design.{command}.{result}`, safe previous/next ids, no media URLs.  
OCC: `409 revision_conflict` on fingerprint mismatch.

### Dashboard

Flag-gated Design panel pilot: preset select + Save draft style; hero uses existing WE hero editor. Hidden when flag OFF. Style & preview CTA unchanged.

### Tests / evidence

- Unit: `designAdapterC2.test.js`, updated contract tests  
- API verify: `tmp/.../c2-draft-persistence-results.json` — all P* pass  
- Public Business hero + miniWebsite theme unchanged; same draft id; envelope + theme persisted  

### Preview consumption

Draft Design projection updates immediately. **Canonical Style & preview chip consumption of the same draft theme is C4** — reported truthfully; not forced in C2.

### Explicit non-goals honored

No C3 UI move · no Style & preview redirect · no Publish change · flags default OFF in committed examples · no push/deploy · BB Flowers untouched.
