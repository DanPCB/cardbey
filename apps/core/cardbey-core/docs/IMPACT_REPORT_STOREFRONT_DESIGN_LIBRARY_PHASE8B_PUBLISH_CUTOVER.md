# Impact Report — Storefront Design Library Phase 8B (Controlled Publish Cutover)

**Date:** 2026-07-22  
**Status:** 8B-Core implemented (flag-gated; draft-store publish entrypoint only)  
**Parent plan:** `docs/PLAN_STOREFRONT_DESIGN_LIBRARY_PHASE0.md`  
**Prior:** Phases 1–8A (advisory pipeline → accept → auth preview). 8A proven green on AAA Plumbing accept/reject.

---

## Locked goal

```
Accepted + eligible?
  YES → Projection Publish Snapshot  →  publishDraft (this store only)
  NO  → Legacy Publish Snapshot      →  publishDraft (unchanged path)
```

- **Alternatives**, not “projection mutates legacy snapshot.”  
- Rollback = republish with rejection / legacy path.  
- **Never global.** `isDesignLibraryAuthoritative()` stays `false`.  
- **Does not** rewrite stored draft `preview.website.sections` as the cutover mechanism.

---

## 1. What could break

| Risk | Why | Mitigation |
|------|-----|------------|
| Live public storefront changes unexpectedly | Publish writes `Business.stylePreferences.miniWebsite.sections` | Flag off by default in production; require accepted + fingerprint; fail closed → legacy |
| All publish entrypoints cut over | Branch inside shared `publishDraft` | Branch only on `POST /api/draft-store/:draftId/publish` (snapshot entrypoint), not stores/tools/automation |
| Stale acceptance publishes wrong structure | Fingerprint drift after re-finalize | Same fingerprint check as 8A; mismatch → legacy + explicit reason |
| Mutating draft in place | Breaks rollback / preview honesty | Build alternate snapshot in memory; do not overwrite draft sections for cutover |
| Confusion with `publishedArtifactProjection` | Hooks may rewrite sections post-publish | Document interaction; preserve catalog identity; do not replace that subsystem |
| Capability gaps on public | Projection VM ≠ legacy section schema | Thin adapter projection→website.sections; fail closed to legacy if adapt/validate fails |
| Global authority flip | Phase 9 territory | Never set `isDesignLibraryAuthoritative()` |

---

## 2. Why

8A proved owner accept + dual preview packages. Missing piece: an **accepted** projection can become the **published structure for that one store**, without making design library globally authoritative or mutating the stored legacy draft as the cutover.

---

## 3. Impact scope

| Area | 8B change | Unchanged |
|------|-----------|-----------|
| Flag | `ENABLE_STOREFRONT_PROJECTION_PUBLISH_V1` / `features.projectionPublishV1` | Preview / acceptance flags remain distinct |
| New module | `storefrontDesignLibrary/publishCutover/` (preview-adjacent, publish-only helpers) | `previewRendering/` stays preview-only |
| Draft publish route | Branch snapshot source before `publishDraft` | Other publish entrypoints stay legacy |
| Acceptance | Read-only gate (accepted + fingerprint + apply) | Accept rules unchanged |
| Public renderer | Consumes published website as today | No new public authority flag |
| Dashboard | Optional status line later | No required UI for 8B-Core |

---

## 4. Smallest safe patch (proposed)

### 4.1 Flag

```
ENABLE_STOREFRONT_PROJECTION_PUBLISH_V1
```

- Requires design library V1.  
- Default: **off** in production when unset; on non-prod/staging when unset (same family).  
- Independent of preview-render flag (acceptance + publish are different concerns).

### 4.2 Eligibility (fail closed → legacy)

Projection publish snapshot only when **all** hold:

1. Publish request is `draft_store` snapshot publish (this route)  
2. Design library enabled  
3. Acceptance feature enabled  
4. **Publish cutover flag** enabled  
5. Draft has `status === 'accepted'` acceptance  
6. `applyToDraftPreview === true` (same intent as 8A)  
7. Fingerprint matches current projection  
8. Projection → publish website package builds + validates  

Otherwise: legacy snapshot + explicit `publishSourceReason`.

**Not required for 8B:** `safeForControlledCutover === true` (often false due to renderer gaps). Owner already accepted for preview; publish is a separate confirmed action. Still fail closed on build/validation errors.

### 4.3 Resolver contract

```js
resolvePublishSnapshotSource({
  publishCutoverEnabled,
  acceptanceEnabled,
  acceptanceRecord,
  currentProjectionFingerprint,
  legacySnapshotPreview,   // from snapshotToPreviewShape(legacy)
  projectionPublishPackage // alternate preview-shaped package or null
})
→ {
  primarySource: 'legacy' | 'projection',
  reason: 'accepted_projection_publish' | 'publish_cutover_disabled' | 'no_acceptance' | 'acceptance_stale' | 'projection_package_invalid' | 'legacy_fallback',
  previewOverride,         // what publishDraft receives
  authoritative: false
}
```

### 4.4 Projection publish package

Build **in memory** from accepted projection + catalog (reuse adapters):

- Map projection render VM → `website.sections` (legacy-compatible types the public storefront already renders)  
- Carry blueprintId / fingerprint / acceptance meta under `meta.designLibraryPublish` (audit only)  
- Same catalog products/categories/hero as legacy snapshot (business truth unchanged)  
- `authoritative: false` on meta markers  

**Do not** persist this package onto DraftStore as a destructive rewrite of legacy sections.

### 4.5 Insertion point

`POST /api/draft-store/:draftId/publish` after legacy snapshot is loaded/`snapshotToPreviewShape`, **before** `publishDraft(..., canonicalPreviewOverride)`:

```
legacyPreview = snapshotToPreviewShape(snapshot)
resolved = resolvePublishSnapshotSource(...)
publishDraft({ canonicalPreviewOverride: resolved.previewOverride, ... })
```

Record reason on response / audit log (not required on Business for 8B-Core).

### 4.6 Forbidden

- Flipping `isDesignLibraryAuthoritative()`  
- Branching inside all `publishDraft` callers (stores API, tools, orchestra) in 8B-Core  
- Mutating draft `preview.website.sections` as the cutover  
- Layout editor  
- Auto-publish without existing publish confirmation UX  

---

## 5. Authority proof (target)

| Check | Result |
|-------|--------|
| `isDesignLibraryAuthoritative()` | `false` |
| Flag off | Always legacy publish |
| Not accepted / stale | Legacy publish |
| Accepted + flag on + valid package | Projection website on **this** Business only |
| Reject then republish | Legacy again (rollback) |

---

## 6. Verification plan

```bash
pnpm exec vitest run src/lib/storefrontDesignLibrary
# New: publishCutover resolver + package adapter tests
# Flag off → legacy
# Accepted + fp OK → projection previewOverride.website.sections differ from legacy when recommendation differs
# Stale → legacy
# Isolation: publishCutover not imported by public storefront loaders
```

Manual: AAA Plumbing — Accept → Publish with flag on → public store primary CTA / sections reflect recommendation; Reject → Publish → legacy.

---

## 7. Phase 9 (later)

Only after 8B stability: projection as normal publish path for accepted stores, then eventual canonical structure / global authority consideration.

---

## 8. Shipped (8B-Core)

| Item | Status |
|------|--------|
| Flag `ENABLE_STOREFRONT_PROJECTION_PUBLISH_V1` | Done |
| `publishCutover/` module | Done |
| Publish snapshot validator + fail closed | Done |
| Immutable `meta.designLibraryPublish` provenance | Done |
| `storefront.publish.completed` event | Done |
| Single entrypoint `POST …/draft-store/:draftId/publish` | Done |
| `isDesignLibraryAuthoritative() === false` | Proven |
| UI | Deferred (not in 8B-Core) |

**Verification:** `pnpm exec vitest run src/lib/storefrontDesignLibrary` (includes 14 Phase 8B tests).
