# Impact Report — Storefront Design Library Phase 7 (Owner Acceptance)

**Date:** 2026-07-22  
**Status:** Implemented (flag-gated; advisory + per-draft preview only)  
**Parent plan:** `docs/PLAN_STOREFRONT_DESIGN_LIBRARY_PHASE0.md`  
**Prior phases:** 1–6 (contracts → classification → commerce policy → scoring → projection → shadow render)

---

## 1. What could break

| Risk | Mitigation |
|------|------------|
| Accidental public cutover | Acceptance never sets `isDesignLibraryAuthoritative()`; public routes unchanged |
| Accept without owner intent | Requires `confirm: true`; rejects otherwise |
| Accept unsafe projection | Blocks when `safeForPreview === false` |
| Stale accepted preview after re-finalize | Fingerprint of projection fields; mismatch → legacy fallback |
| Apply accepted VM to wrong actor | Preview resolve requires draft owner / platform_admin / admin |
| Persist schema migration | Acceptance stored on existing `DraftStore.preview.meta` JSON only |
| Silent publish | No publish path reads acceptance |

---

## 2. Why

Phase 6 proved shadow preview. Phase 7 lets an owner/admin **explicitly accept or reject** the recommended structure for **one draft’s controlled preview**, without making the design library globally authoritative.

---

## 3. Impact scope

| Area | Change |
|------|--------|
| `acceptance/` | Comparison package, validator, accept/reject, preview resolve, persist helper |
| Draft routes | `GET …/projection-comparison`, `POST …/projection-acceptance`; preview prefers accepted source |
| Flags | `ENABLE_STOREFRONT_PROJECTION_ACCEPTANCE_V1` / `features.projectionAcceptanceV1` |
| Finalize | Unchanged (still advisory classify→policy→score→project→shadow) |
| Public storefront | **Unchanged** |
| Dashboard | No mandatory UI (API ready for optional later surface) |

---

## 4. Smallest safe patch (shipped)

1. Acceptance module + fingerprint of **projection only** (not ephemeral render summary).  
2. Owner comparison builder (Current vs Recommended labels).  
3. Decision APIs with confirm gate.  
4. `resolveAcceptedPreviewSource` for authorised draft preview only.  
5. Persist `meta.designLibraryProjectionAcceptance` on draft preview.  
6. Flag default: off in production; on non-prod/staging when unset.

---

## 5. Acceptance decision contract

```js
POST /api/draft-store/:draftId/projection-acceptance
{ "decision": "accept" | "reject", "confirm": true, "applyToDraftPreview": true, "note": "optional" }
```

- **Accept + applyToDraftPreview:** subsequent `GET …/projection-preview` may return projected VM for authorised actors.  
- **Reject:** clears apply; preview stays legacy.  
- **Fingerprint stale / flags off / unauthorized:** resolve falls back to legacy.

Event: `storefront.projection_acceptance.decided`.

---

## 6. Authority proof

| Check | Result |
|-------|--------|
| `isDesignLibraryAuthoritative()` | Always `false` |
| Acceptance `authoritative` field | Always `false` |
| Public production cutover | Not implemented |
| Publish snapshot mutation | None |

---

## 7. Verification

```bash
pnpm exec vitest run src/lib/storefrontDesignLibrary
# 104 tests across Phases 1–7
```

---

## 8. Recommended Phase 8

**Split:** 8A accepted-draft **preview render** (no public/publish) → 8B controlled publish snapshots. See `docs/IMPACT_REPORT_STOREFRONT_DESIGN_LIBRARY_PHASE8A_PREVIEW_RENDER.md` (awaiting acknowledgment).
