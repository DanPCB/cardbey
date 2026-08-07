# Impact Report — Storefront Design Library Phase 6 (Shadow Render)

**Date:** 2026-07-31  
**Scope:** Projection→render adapter + legacy structure extraction + shadow comparison + authorised preview API  
**Flags:**
- `ENABLE_DESIGN_LIBRARY_V1` (Phases 1–5)
- `ENABLE_STOREFRONT_PROJECTION_SHADOW_V1` (comparison metadata)
- `ENABLE_STOREFRONT_PROJECTION_PREVIEW_V1` (authorised preview)

**Authority:** `isDesignLibraryAuthoritative() === false` (unchanged)

## Boundary

Phase 6 introduces:

1. **Compare** legacy storefront structure vs advisory projection  
2. **Adapt** projection → renderer-compatible view model (tests / diagnostics / controlled preview)

It does **not** replace the live public renderer by default.

## Three representations (kept separate)

| Layer | Role |
|-------|------|
| Research/catalog evidence | Provenance-aware source rows |
| `StorefrontProjection` | Semantic section plan (Phase 5) |
| `StorefrontRenderViewModel` | UI-facing adapter output (Phase 6) |

React must not consume raw research rows. Projection is not mutated for renderer gaps.

## Module

`src/lib/storefrontDesignLibrary/rendering/`

| File | Role |
|------|------|
| `renderCompatibility.js` | Renderer capability contract + role→rendererType map |
| `projectionItemAdapter.js` | Resolve itemRefs |
| `projectionSectionAdapter.js` | Section + fallbacks |
| `projectionRenderAdapter.js` | Full view model + evidence-aware CTAs |
| `legacyStructureExtractor.js` | Normalize legacy sections (read-only) |
| `shadowComparison.js` | Diff + readiness |
| `renderAdapterValidator.js` | Fail-safe validation |
| `applyDesignLibraryRenderShadow.js` | Attach `meta.designLibraryRenderShadow` |
| `projectionPreviewAccess.js` | Owner/admin preview gate |

## Renderer capability contract

`CURRENT_RENDERER_CAPABILITIES` documents current gaps explicitly:

- no dedicated trust section → `content-block` fallback  
- policies → `footer-links` / `footer_only`  
- grouped services unsupported → flat list  
- collapsed unsupported → hidden in public compatibility view  
- origin badges unsupported  

## Compatibility fallback rules

Safe structural fallbacks only. Forbidden:

- quote service → booking card  
- policy/testimonial/career → service/product  
- unpriced item → purchasable  
- `request_quote` labeled/mapped as Book  

## CTA mapping (Phase 3 only)

Shadow view model uses evidence-aware actions (`Request a quote`, `Call now`, `Book now`, …).  
Live legacy may still show Book until cutover; shadow must show advisory CTA.

## Legacy extraction

`extractLegacyStorefrontStructure` reads `preview.website.sections` or flat catalog.  
Separates `websiteTemplateId` / `contentTemplateId` / `legacyThemeTemplateId`. No mutation.

## Comparison model

Findings include: `SECTION_ADDED`, `CTA_CHANGED`, `BOOK_CHANGED_TO_REQUEST_QUOTE`, `TESTIMONIAL_REMOVED_FROM_SERVICES`, `POLICY_REMOVED_FROM_CATALOG`, `CAREER_REMOVED_FROM_CATALOG`, `PROJECTED_RENDERER_FALLBACK`, blockers like `SOURCED_SERVICE_MISSING`.

Readiness:

- `safeForPreview` — no blockers  
- `safeForControlledCutover` — preview-safe **and** low capability-fallback load  

## Metadata

```json
{
  "designLibraryRenderShadow": {
    "projectedViewModelSummary": { "...": "compact" },
    "comparisonSummary": {},
    "readiness": { "safeForPreview": true, "safeForControlledCutover": false },
    "criticalFindingCodes": [],
    "authoritative": false,
    "adapterVersion": 1,
    "comparisonVersion": 1
  }
}
```

Does not alter `preview.website.sections`, publish snapshots, or public routes.

## Flag behaviour

| Design lib | Shadow | Preview | Behaviour |
|------------|--------|---------|-----------|
| off | * | * | No Phase 1–6 behaviour |
| on | off | off | Phases 1–5 advisory only |
| on | on | off | + shadow metadata / events |
| on | on | on | + authorised projection preview API |

Defaults: **off in production**; on for non-prod/staging when unset (same convention as design library).

## Internal preview mechanism

`GET /api/draft-store/:draftId/projection-preview`

- `requireAuth` + draft ownership / super-admin  
- `canAccessProjectionPreview` (owner / platform_admin / admin / developer)  
- `X-Robots-Tag: noindex, nofollow`  
- Clearly labeled “Projection preview — not live”  
- Does **not** replace public canonical URL  
- Does **not** persist owner approval  

## Validation / fail-safe

Invalid view models → `storefront.render_shadow.failed`, no attach, legacy path unchanged, store creation not failed.

## Modern Security Doors comparison (fixture)

| Legacy | Projected shadow |
|--------|------------------|
| Flat services + Book | trade-lead-generation |
| Testimonials/policies/career as services | Homed to testimonials / policies footer / footer |
| | Request a quote + Call |
| | Projects hidden |
| | Trust + quote added |

`safeForPreview: true`  
`safeForControlledCutover: false` (renderer capability gaps / fallbacks)

## Cutover blockers (current)

- Dedicated trust / policies sections not fully supported  
- Grouped service categories unsupported  
- Footer-only not natively supported (`supportsFooterOnly: false`)  
- High compatibility fallback count on trades-shaped catalogs  

## Test results

```text
pnpm exec vitest run src/lib/storefrontDesignLibrary
  Total: 97 passed (Phases 1–6)

node -e "import('./src/lib/storefrontDesignLibrary/rendering/index.js')" → ok
```

## Recommended Phase 7

**Status:** Implemented — see `docs/IMPACT_REPORT_STOREFRONT_DESIGN_LIBRARY_PHASE7_ACCEPTANCE.md`.

**Controlled owner-preview cutover and acceptance workflow** — owner/admin compares Current vs Recommended and explicitly accepts/rejects the projected structure for a single draft’s authorised preview, without making projection globally authoritative.
