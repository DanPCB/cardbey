# UNIFIED SPACE GLOBAL COMPOSITION V2 — Live gate

**Date:** 2026-08-25  
**Dashboard:** `6ecffb69` (+ category filter follow-up)  
**Monorepo bumps:** staging [#208](https://github.com/DanPCB/cardbey/pull/208), main [#209](https://github.com/DanPCB/cardbey/pull/209)  
**Screenshots:** `docs/screenshots/unified-space-v2/`  
**Artifact:** `docs/screenshots/unified-space-v2/live-acceptance.json`

## Verdict

**`PARTIAL`**

Composition convergence and blank expanded-stage fix are live and verified on MMM, AWE, Personal, and Global. BrayBrook Space acceptance is blocked by **store resolve 404** (not by layout).

## Live checks

| Surface | Compact theatre | Expand media | Collapse | Notes |
|---------|-----------------|--------------|----------|-------|
| Global `/` | feed-theatre present | n/a | n/a | No visual regression observed |
| MMM Fashion | PASS (left/center/right) | PASS (img, full viewport, no `desktop-center`) | PASS | Visit store rail; no architecture Store card |
| AWE Financial | PASS | PASS | PASS | Same |
| Personal | PASS | PASS (dark grounded fallback) | PASS | No Ask Performer when signed out |
| BrayBrook | FAIL resolve | n/a | n/a | `/space/cmq7kux1e00agk85m6836gund` → “not available”; discovery finds store but `/api/store/:id/preview` and public store 404 |

## Explicit criteria

1. No white/blank expanded viewport — **PASS** (MMM/AWE media; Personal/gradient dark stage)  
2. Hero media renders when grounded — **PASS** (MMM/AWE)  
3. No giant full-width Space banner — **PASS**  
4. Space follows Global composition — **PASS**  
5. Right rail contextual — **PASS** when data; collapses when empty  
6. Left rail Space nav — **PASS**  
7. Public never sees Ask Performer — **PASS**  
8. No invented business data — **PASS** (filter untitled categories follow-up)  
9. Store reachable via Visit store — **PASS** (MMM/AWE)  
10. Global zero regression — **PASS** (theatre intact)

## Remaining defects (exact)

1. **BrayBrook Space resolve:** store id is indexed in discovery (`/s/braybrook-bakery`) but Space resolve returns fallback unavailable (`preview`/`public` 404). Needs store/public publish path fix — outside this UI composition pass.  
2. **Sparse right rail** on businesses without hours/location/social — by design (collapse empty modules).  
3. **Secondary categories** may still show low-quality grounded labels like `Other` when present in catalog.

## Do not claim

`UNIFIED_SPACE_GLOBAL_COMPOSITION_V2_READY` until BrayBrook Space loads real bakery identity + media on the same theatre shell.
