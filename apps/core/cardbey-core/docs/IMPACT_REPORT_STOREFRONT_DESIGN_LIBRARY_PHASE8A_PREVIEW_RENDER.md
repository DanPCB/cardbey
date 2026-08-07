# Impact Report — Storefront Design Library Phase 8A (Accepted Draft Preview Rendering)

**Date:** 2026-07-22  
**Status:** 8A-Core implemented (flag-gated; auth preview only). 8A-UI deferred as separate patch.  
**Parent plan:** `docs/PLAN_STOREFRONT_DESIGN_LIBRARY_PHASE0.md`  
**Prior phases:** 1–7 (advisory pipeline through owner acceptance)

---

## Split (locked)

| Sub-phase | Goal | This report |
|-----------|------|-------------|
| **8A** | Accepted projection → projection render source → **owner / editor / auth preview only** | **In scope** |
| **8B** | Accepted? → publish projection snapshot **OR** legacy snapshot (single store; never global) | **Out of scope** |
| **Thin owner UI** | Current vs Recommended + Accept/Reject (no layout editor) | Parallel-optional; not required to close 8A core |
| **Phase 9+** | Projection publishable → eventually canonical; `isDesignLibraryAuthoritative()` may become true only after parity | **Out of scope** |

---

## 1. What could break

| Risk | Why | Mitigation |
|------|-----|------------|
| Accidental public cutover | Preview resolve wired into live storefront or publish | Touch **only** draft/auth preview paths; public routes + publish builders off-limits; `isDesignLibraryAuthoritative()` stays `false` |
| Acceptance conflated with rendering | Reusing acceptance flag for “render projection” | New flag `ENABLE_STOREFRONT_PROJECTION_PREVIEW_RENDER_V1` — acceptance and render are separate concerns |
| Misleading `previewSource: 'legacy'` | Today `GET …/projection-preview` can label legacy while still returning a projection VM | 8A returns peer packages: when legacy wins, payload is legacy structure/VM; when projection wins, projection VM |
| Mutating stored preview shape | Rewriting `preview.website.sections` / `stylePreferences` / template IDs | **Forbidden.** Accepted projection is an alternate **render source**, not a migrate-in-place |
| Capability crashes in preview | Renderer gaps (`safeForControlledCutover: false`) | Keep `safeForPreview` gate; surface compatibility fallbacks; never crash public path (public unchanged) |
| Non-prod defaults mistaken for prod | Staging defaults flags on when unset | Same pattern as Phases 6–7: **off in production** when unset; document in `.env.example` |
| Scope creep into 8B | Publish snapshot branching | Explicitly deferred; no publish code reads new flag |

---

## 2. Why

Phases 1–7 prove the advisory pipeline and owner accept/reject. What is still missing is proving that an **accepted** projection can drive a **real preview render path** side-by-side with legacy, using the same business truth, **without** changing how every store or public visitor works.

Today Phase 6/7 expose a **view-model adapter** + shadow compare + acceptance metadata. They do **not** yet enforce preview-mode render priority, and the preview route does not honestly fall back to a legacy render package.

---

## 3. Impact scope

| Area | 8A change | Unchanged |
|------|-----------|-----------|
| Flags | Add `ENABLE_STOREFRONT_PROJECTION_PREVIEW_RENDER_V1` / `features.projectionPreviewRenderV1` | Acceptance / shadow / preview API flags remain distinct |
| `rendering/` | `resolvePreviewRenderSource` — priority inside **preview mode only** | Adapter/extractor stay; no legacy field removal |
| Draft API | Enrich `GET …/projection-preview` (and optionally a dual-payload endpoint) for side-by-side | Public storefront routes |
| Acceptance | May gate “use projection” on accepted + fingerprint; does not change accept rules | `confirm: true` contract |
| Persist | Optional `meta.designLibraryPreviewRender` audit only if needed | No Prisma migration; no rewrite of sections/stylePreferences |
| Publish | — | **No touch** (8B) |
| Dashboard UI | Optional thin Current/Recommended panel | No layout editor |
| Authority | — | `isDesignLibraryAuthoritative() === false` |

---

## 4. Smallest safe patch (shipped — 8A-Core)

### 4.1 Flag

```
ENABLE_STOREFRONT_PROJECTION_PREVIEW_RENDER_V1
```

- Default: **off** in production when unset; on non-prod/staging when unset (same family as design library).
- Requires `ENABLE_DESIGN_LIBRARY_V1`.
- Independent of acceptance flag: acceptance without this flag → no projection **render priority**; this flag without acceptance → may still allow dual preview packages labeled Current/Recommended, but **must not** treat projection as the primary accepted source unless acceptance criteria are met.

### 4.2 Preview-mode render priority (only)

```
Inside authorised preview mode + PREVIEW_RENDER flag on:

  if accepted && applyToDraftPreview && fingerprint current && safeForPreview
    → source = design_library_projection  (projection render VM)
  else
    → source = legacy                     (legacy structure / legacy-compatible package)

Outside preview mode (public, anonymous, publish):
  → legacy only  (do not call this resolver)
```

### 4.3 Dual package for side-by-side success criteria

`GET …/projection-preview` (or a sibling field under the same auth gate) returns:

| Field | Meaning |
|-------|---------|
| `renderMode` | `preview` only |
| `primarySource` | `legacy` \| `design_library_projection` (respects priority above) |
| `packages.legacy` | Legacy extract / Current package (always when buildable) |
| `packages.projection` | Projection render VM (when buildable + flags) |
| `acceptance` | Existing Phase 7 record |
| `authoritative` | always `false` |
| `robots` | `noindex` |

Success criteria for 8A: for any accepted draft, owner can inspect **Legacy renderer package** and **Projection renderer package** side-by-side on identical business truth — without production change.

### 4.4 What “projection renderer” means in 8A

**In scope for 8A (core):**

- Stable **preview render source resolution** + honest dual packages (projection VM via existing adapter; legacy via existing extractor).
- Auth-gated draft preview API only.
- Tests proving priority + no public route imports.

**Optional parallel (thin UI):**

- Dashboard: Preview Current / Preview Recommended / Differences / Accept / Reject — wired to existing comparison + acceptance APIs + enriched preview.
- No drag-drop, reorder, resize, visual blueprint editor.

**Explicitly not a full rewrite of the React storefront** in 8A unless a **minimal** authorised preview surface already exists to consume the VM. Prefer consuming the dual JSON packages first; a later thin React preview consumer may bind to `packages.projection` without touching public routes.

### 4.5 Forbidden in 8A

- Public visitor storefront cutover  
- Publish snapshot branching (8B)  
- Mutating `Business.stylePreferences`, `preview.website.sections`, template IDs  
- Removing legacy rendering  
- Setting `isDesignLibraryAuthoritative()` true  
- Layout / section editor  

---

## 5. Authority proof (target after ship)

| Check | Required result |
|-------|-----------------|
| `isDesignLibraryAuthoritative()` | `false` |
| Public production storefront | Legacy only; no new resolver |
| Publish path | Unchanged (8B) |
| Preview route | Auth + noindex + `authoritative: false` |
| Acceptance without PREVIEW_RENDER flag | No projection-as-primary render |
| PREVIEW_RENDER without acceptance | Dual packages OK; primary stays legacy unless product explicitly allows Recommended-as-primary for non-accepted (default: **primary = legacy** until accepted) |

---

## 6. File touch list (proposed)

**Core (must for 8A close):**

1. `src/lib/storefrontDesignLibrary/flags.js`  
2. `src/config/features.js` + `.env.example`  
3. `src/lib/storefrontDesignLibrary/rendering/resolvePreviewRenderSource.js` (new)  
4. `src/routes/draftStore.js` — enrich `GET …/projection-preview` only  
5. `src/lib/storefrontDesignLibrary/index.js` exports  
6. Tests: `rendering/__tests__/previewRenderPhase8a.test.js`  
7. This impact report → status Implemented; plan § Phase 8A  

**Optional thin UI (parallel):**

8. Dashboard draft-review surface calling comparison / acceptance / preview APIs  

**Do not touch:**

- Publish snapshot builders  
- Public storefront page routes  
- Contents Studio `DesignLibrary.tsx` (unrelated)  
- Prisma schema  

---

## 7. Verification (passed)

```bash
pnpm exec vitest run src/lib/storefrontDesignLibrary
# 121 tests (Phases 1–8A-Core)
```

Honesty: `primarySource: "legacy"` ⇒ `primaryPackage === packages.legacy` and `viewModel === null` (never projection-only under legacy label).

---

## 8. Phase 8B (deferred — do not implement now)

```
Accepted?  YES → publish Projection Publish Snapshot
           NO  → publish Legacy Publish Snapshot
```

- Single store only; never global.  
- Snapshots are **alternatives**, not “projection mutates legacy.”  
- Rollback = publish legacy snapshot again.

---

## 9. Phase 9 (later)

Only after 8A preview parity and 8B controlled publish stability: projection becomes publishable as the normal path for that store, then eventually canonical structure — and only then consider `isDesignLibraryAuthoritative() === true`.

---

## 10. Acknowledgment / completion

Acknowledged and implemented as **8A-Core only** (API/core). **8A-UI** is the next separate patch. **8B** / public cutover / global authority remain deferred.

| Sub-phase | Status |
|-----------|--------|
| 8A-Core | Done |
| 8A-UI | Done — see `IMPACT_REPORT_STOREFRONT_DESIGN_LIBRARY_PHASE8A_UI.md` |
| 8B | Done — see `IMPACT_REPORT_STOREFRONT_DESIGN_LIBRARY_PHASE8B_PUBLISH_CUTOVER.md` |
