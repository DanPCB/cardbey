# Storefront Design Library — Phase 0 Architecture Map

**Status:** Audit complete — no design-library code changes yet.  
**Date:** 2026-07-31  
**Governing principle:** Business evidence determines truth. Blueprints determine structure. Themes determine appearance. Preview samples help users choose a design direction. One “template” object must not own all four.

---

## 1. Current architecture map

```text
Performer create-store
        │
        ├─► Template Library UI (optional)
        │     TemplateLibraryPanel → POST /api/templates/:id/apply-website
        │     → TemplateInstance (ephemeral apply record)
        │     → websiteTemplateId in intake / mission metadata
        │
        ├─► storeCreationResearch / storeResearch
        │     Places + website extract → catalogAuthorityDecision
        │     → researchCatalogDraft (stamp sourced|suggested)
        │
        └─► structured_store_build
              → draftStoreService.generateDraft
              → websiteTemplateFoundation (layout/theme → preview)
              → websiteSectionsGenerator.mergeWebsiteIntoPreview
              → industryBlueprints/* (catalog/service pack generation)
              → DraftStore.input + DraftStore.preview (JSON)

Publish
        → publishDraftService
        → Business.stylePreferences.miniWebsite (raw sections+theme snapshot)
        → Business.storefrontSettings (commerce/CTA/display)
        → PublishedArtifactProjection.projectionJson (parallel canonical path)

Public render
        → GET /api/public/stores/:slug
        → CanonicalStorefrontRenderer → WebsitePreviewPage
        → MiniWebsiteLayout / section components
        ⚠ React hardcodes section order; Core section order is only partially honored
```

### 1.1 Canonical sources of truth today

| Concern | Owner today | Persistence |
|--------|-------------|-------------|
| Business facts | Draft preview → Business (+ Product rows) | Prisma Business / Product |
| Evidence / provenance | Research + catalog grounding | Draft preview JSON + mission `storeCreationResearch`; not a first-class provenance table |
| Structure (“what sections”) | Collapsed into `ContentTemplateVersion.layoutDefinition` + generated `preview.website.sections` | Draft `preview.website`; publish snapshot `stylePreferences.miniWebsite` |
| Visual look | Collapsed into `themeDefinition` + legacy `website.theme.templateId` + `brandColors` + dashboard `WEBSITE_TEMPLATES` | Mixed; no stable VisualThemeId |
| Demo / preview content | Thumbnail/mockup only; seed `defaultData: {}` | No PreviewSample entity |
| Commerce / CTA | `resolveStoreCommerce` + `storefrontSettings.cta` | Business.storefrontSettings |
| Catalog authority | `catalogAuthorityDecision` + `contentOrigin` | Draft preview / catalog meta |

### 1.2 Naming collision (critical)

| Field | Meaning |
|-------|---------|
| `websiteTemplateId` / `ContentTemplate.id` | Library template identity (structure+theme seed) |
| `preview.website.theme.templateId` | Legacy visual enum: `minimal \| bold \| editorial \| warm \| dark` |

These must not be conflated when introducing Blueprint / VisualTheme / PreviewSample IDs.

### 1.3 Industry “blueprints” vs design-library Blueprints

Existing `src/services/draftStore/industryBlueprints/*` are **catalog/content generation packs** (services, beauty, food, retail…), not storefront structural strategies. Keep them for suggested catalog generation. New `StorefrontBlueprint` contracts are a separate layer.

---

## 2. Proposed bounded contexts

```text
┌─────────────────────────────────────────────────────────────┐
│ Business Truth                                              │
│  identity, contact, hours, catalog facts, contentOrigin     │
│  (DraftStore / Business / research evidence)                │
└───────────────────────────┬─────────────────────────────────┘
                            │ classify
┌───────────────────────────▼─────────────────────────────────┐
│ Semantic Classification                                     │
│  BusinessContentRole + confidence + reason                  │
│  (new adapter over research/catalog rows; no fact rewrite)  │
└───────────────────────────┬─────────────────────────────────┘
                            │ score / select
┌───────────────────────────▼─────────────────────────────────┐
│ Storefront Design Library                                   │
│  ├── Blueprints (structure, CTA model, section roles)       │
│  ├── Visual Themes (tokens, component variants)             │
│  └── Preview Samples (demo facts disposable)                │
└───────────────────────────┬─────────────────────────────────┘
                            │ project
┌───────────────────────────▼─────────────────────────────────┐
│ Storefront Projection                                       │
│  sections, variants, primary/secondary actions, origins     │
│  persisted on draft; reproject without re-research          │
└───────────────────────────┬─────────────────────────────────┘
                            │ render
┌───────────────────────────▼─────────────────────────────────┐
│ Public / editor renderer                                    │
│  consumes ProjectedStorefrontSection[]; no research UI      │
└─────────────────────────────────────────────────────────────┘
```

**Non-goals:** parallel store builder; replacing Performer / orchestra / mission pipeline; collapsing the three library layers into one Template row.

---

## 3. Exact canonical contracts (target — Phase 1)

Introduce under Core (plain JS + JSDoc or shared TS types matching repo convention), e.g.:

`apps/core/cardbey-core/src/lib/storefrontDesignLibrary/`

| Contract | Responsibility | Must not own |
|----------|----------------|--------------|
| `StorefrontBlueprint` | Sections, variants, CTA model, compatibility weights | Business facts, demo catalog |
| `VisualTheme` | Palette, type, spacing, radius, shadow, motion, componentVariants | Section necessity, CTAs from evidence |
| `StorefrontPreviewSample` | Sample business + media + blueprintId + themeId | Authority over real draft facts |
| `BusinessContentRole` | Semantic role of a sourced/suggested item | Layout or theme |
| `StorefrontProjection` | Concrete rendered plan for one draft/store | Research re-execution |
| `BlueprintScore` | Score + reasons + missing requirements | Owner override persistence (separate) |

Reuse existing where possible:

- `contentOrigin: sourced | suggested` (research catalog)
- `businessType` / `resolveStoreCommercePresentation` (`service_quote_required`, `food_menu`, …)
- `storefrontSettings.cta` / `resolveStorefrontPrimaryCta`
- `PublishedArtifactProjection` as publish-time consumer of projection (adapt, don’t fork)

---

## 4. Files to reuse (wrap, don’t rewrite)

### Core

| Path | Role |
|------|------|
| `src/lib/templateLibrary/*` | Catalog browse/apply; keep; map to PreviewSample later |
| `src/services/draftStore/websiteTemplateFoundation.js` | Adapter: theme/layout → VisualTheme + section order |
| `src/services/draftStore/websiteSectionsGenerator.js` | Evolve to emit from projection |
| `src/services/draftStore/draftStoreService.js` | Hook projection after catalog/research |
| `src/services/draftStore/researchCatalogDraft.js` | Preserve contentOrigin; feed classifier |
| `src/lib/storeCreationResearch/catalogAuthorityDecision.js` | Authority gate unchanged |
| `src/lib/storeCreationResearch/websiteMenuHtmlExtract.js` | Category extract (MSD path) |
| `src/lib/storeTransactionMode.js` | CTA evidence inputs |
| `src/lib/ctaEngine/resolveStorefrontPrimaryCta.js` | Capability mapping |
| `src/lib/businessSemantic/*` | Business model signals |
| `src/services/draftStore/industryBlueprints/*` | Suggested catalog packs only |
| `src/lib/toolExecutors/store/structured_store_build.js` | Pass blueprint/theme IDs in metadata |
| `src/services/draftStore/publishDraftService.js` | Persist projection + miniWebsite compat |
| `scripts/seed-template-library.js` | Migrate toward PreviewSamples |

### Dashboard

| Path | Role |
|------|------|
| `src/features/performer/templateLibrary/*` | Browse/apply UI → PreviewSample chooser |
| `src/components/mini-website/MiniWebsiteLayout.tsx` | Consume projection sections |
| `src/pages/public/WebsitePreviewPage.tsx` | Public renderer host |
| `src/components/storefront/CanonicalStorefrontRenderer.tsx` | Entry |
| `src/lib/normalizeStorefrontSections.ts` | Replace hardcode with projection-aware normalizer |
| `src/lib/websiteTheme.ts` | Map VisualTheme tokens → CSS vars |
| `src/lib/catalogFidelity/contentOriginBadge.ts` | Owner badges only |
| `src/utils/storeTransactionMode.ts` | Align with Core CTA policy |

---

## 5. Files expected to change (by phase)

| Phase | Touch |
|-------|-------|
| 1 Contracts | New `storefrontDesignLibrary/` contracts + registry stubs; no renderer change |
| 2 Classification | New classifier + attach roles on research/catalog rows; tests |
| 3–4 Projection + scoring | New projector + blueprint defs; wire after research in `draftStoreService` |
| 5 CTA policy | Thin policy over `resolveStoreCommerce`; stop research defaulting all items to `book` |
| 6 Sourced flow | Projection after authority decision; MSD fixture tests |
| 7 Preview apply | `applyPreviewDesign` adapter; stop sample fact clone |
| 8 Diversity | Persist `blueprintId`, `themeId`, section variant overrides on draft |
| 9 Renderer | `WebsitePreviewPage` / `MiniWebsiteLayout` read projection; drop fake Book/price |
| 10 Re-project | `reprojectStorefront(draftId, options)` Core API |
| 11 Compat | Legacy mapper: no blueprint → synthetic projection from miniWebsite |
| 12 Observability | Decision events listed in product brief |

---

## 6. Migration and rollback

### Forward

1. Feature flags default **off** in production.
2. When off: existing generate → miniWebsite → React path unchanged.
3. When on: write `preview.storefrontProjection` (+ ids) alongside legacy `preview.website`.
4. Publish: write both `stylePreferences.miniWebsite` (compat) and projection slice on `PublishedArtifactProjection` / storefrontSettings.
5. Legacy stores without projection: `legacyProjectionFromMiniWebsite(website)` on read.

### Template → Design Library mapping (compat)

| Legacy | Maps toward |
|--------|-------------|
| `ContentTemplate` + version | PreviewSample (or Blueprint+Theme pair) |
| `layoutDefinition` | Blueprint.defaultSections (lossy today) |
| `themeDefinition` / `website.theme.templateId` | VisualTheme |
| `TemplateInstance` | Optional apply audit; not SOT for publish |
| `industryBlueprints` | Stay as suggested-catalog packs |

### Rollback

- Flip flags off → renderer ignores projection, uses legacy sections.
- No destructive schema drop in v1; additive JSON fields only.
- Do not delete Template Library tables.

---

## 7. Feature flags (proposed)

Follow `src/config/features.js` / env patterns:

| Flag | Purpose |
|------|---------|
| `ENABLE_DESIGN_LIBRARY_V1` | Contracts + registries load; scoring available |
| `ENABLE_STOREFRONT_CLASSIFICATION_V1` | ContentRole attach on research/catalog |
| `ENABLE_STOREFRONT_PROJECTION_V1` | Persist + serve StorefrontProjection |
| `ENABLE_PREVIEW_APPLICATION_V1` | `applyPreviewDesign` path (no sample fact copy) |
| `ENABLE_STOREFRONT_PROJECTION_RENDER_V1` | Dashboard renderer consumes projection |

Roll out: classify → project (shadow write) → CTA → render → preview apply.

---

## 8. Test plan (aligned with product brief)

1. **Contract:** every Blueprint / Theme / PreviewSample validates schema.
2. **Classification:** testimonials/policies/careers excluded from catalogue; service categories preserved; unknown → reviewable.
3. **Scoring:** MSD → `trade-lead-generation`; beauty+booking → `service-booking`; restaurant → `restaurant-menu`; priced retail → `retail-commerce`; creative → `portfolio-showcase`.
4. **CTA:** quote → Request quote; booking evidence → Book; priced product → Buy; none → Enquire; never from preview chrome alone.
5. **Preview apply:** sample address/products/prices not copied; theme+blueprint linked; real facts preserved.
6. **Projection:** policies footer; testimonials section; no flat “Other” when hierarchy exists.
7. **Re-project:** theme/blueprint switch without provenance change; overrides persist.
8. **Public:** no fake price, no Book without evidence, no research-debug UI.

---

## 9. Risks and assumptions

| Risk | Mitigation |
|------|------------|
| React hardcodes section order (`WebsitePreviewPage` / `normalizeStorefrontSections`) | Projection render flag; gradual cutover |
| Research path forces `service` + `book` on all items | CTA policy + role-aware enrich in Phase 5–6 |
| Dual CTA paths (Core vs hero scroll-to-products) | Renderer consumes `primaryAction` from projection |
| Template ID vs theme.templateId confusion | New explicit `blueprintId` / `themeId` / `previewSampleId` |
| IndustryBlueprints name collision | Keep pack names; new IDs under `storefrontDesignLibrary` |
| Published stores only have raw miniWebsite | Compat projector; no forced re-publish |
| Scope creep into full redesign | Phase gates; wrap adapters; flags |

**Assumptions**

- Fail-open draft creation and owner review gates stay.
- Safe execution / publish confirmation unchanged.
- Preview samples may start as migrated Template Library entries + disposable sample payloads.
- No parallel Intent Runtime or second mission stack.

---

## 10. Recommended implementation order (unchanged)

1. This audit (done)  
2. Canonical contracts + registries (flagged)  
3. Semantic classification  
4. Blueprint defs + scoring  
5. CTA policy  
6. Projection writer  
7. Existing-business sourced integration  
8. New-user preview apply  
9. Public renderer  
10. Re-projection  
11. Migration/compat  
12. Observability  

---

## 11. Acceptance for Phase 0

- [x] Current template library, draft, publish, renderer, CTA, research paths mapped  
- [x] Gaps vs Blueprint / Theme / PreviewSample separation documented  
- [x] Reuse list + change list + flags + tests + risks recorded  
- [x] User acknowledgment to proceed with Phase 1 contracts only  

## 12. Approved Phase 1 boundary (implemented)

**In scope:** `src/lib/storefrontDesignLibrary/` contracts, registries, definitions, read-only adapters, `ENABLE_DESIGN_LIBRARY_V1`, tests, impact report.

**Authority:** Live generation/render remain on ContentTemplate + websiteTemplateFoundation + miniWebsite. `isDesignLibraryAuthoritative() === false`.

See: `docs/IMPACT_REPORT_STOREFRONT_DESIGN_LIBRARY_PHASE1.md`.

## 13. Phase 2 boundary (implemented)

**In scope:** `classification/` module; additive `contentRole` / confidence / reason / version on research + suggested catalog rows; MSD fixture tests; `storefront.classification.completed` diagnostic event.

**Out of scope (still deferred at Phase 2):** blueprint scoring, CTA policy, projection, renderer cutover, catalogue filtering, footer policy moves.

See: `docs/IMPACT_REPORT_STOREFRONT_DESIGN_LIBRARY_PHASE2_CLASSIFICATION.md`.

## 14. Phase 3 boundary (implemented)

**In scope:** `policy/` module — commerce evidence, business-model inference, CTA decision policy; additive `meta.designLibraryCommercePolicy` on research finalize + suggested stamp; `storefront.commerce_policy.completed` diagnostic event.

**Authority:** Advisory only (`authoritative: false`). Does not replace `resolveStoreCommerce` / live `primaryCTA` / renderer.

**Out of scope (still deferred at Phase 3):** blueprint scoring, projection, renderer / section cutover, catalogue filtering, live CTA engine cutover.

See: `docs/IMPACT_REPORT_STOREFRONT_DESIGN_LIBRARY_PHASE3_COMMERCE_POLICY.md`.

## 15. Phase 4 boundary (implemented)

**In scope:** `scoring/` module — evidence gather, dimension weights, eligibility, deterministic recommendation; additive `meta.designLibraryBlueprintRecommendation`; event `storefront.blueprint.scored`.

**Authority:** Advisory only (`authoritative: false`). Does not apply blueprint to public site, reorder sections, or change live CTAs.

**Out of scope (still deferred at Phase 4):** section projection, renderer cutover, theme scoring, publish behaviour, blueprint application.

See: `docs/IMPACT_REPORT_STOREFRONT_DESIGN_LIBRARY_PHASE4_BLUEPRINT_SCORING.md`.

## 16. Phase 5 boundary (implemented)

**In scope:** `projection/` module — role→section mapping, visibility, variants, CTA section hints, validator; additive `meta.designLibraryStorefrontProjection`; event `storefront.projection.completed`.

**Authority:** Advisory only (`authoritative: false`). Does not cut over React renderer, live CTAs, or publish snapshots.

**Out of scope (still deferred at Phase 5):** shadow render comparison, projection-to-render adapter, theme scoring, owner layout editor.

See: `docs/IMPACT_REPORT_STOREFRONT_DESIGN_LIBRARY_PHASE5_PROJECTION.md`.

## 17. Phase 6 boundary (implemented)

**In scope:** `rendering/` module — capability contract, projection→render adapter, legacy extractor, shadow comparison, `meta.designLibraryRenderShadow`; flags `ENABLE_STOREFRONT_PROJECTION_SHADOW_V1` + `ENABLE_STOREFRONT_PROJECTION_PREVIEW_V1`; authorised `GET /api/draft-store/:draftId/projection-preview`.

**Authority:** Advisory only. Public production storefront remains legacy. `isDesignLibraryAuthoritative() === false`.

**Out of scope (still deferred at Phase 6):** public cutover, owner acceptance workflow, layout editor, theme scoring, legacy field removal.

See: `docs/IMPACT_REPORT_STOREFRONT_DESIGN_LIBRARY_PHASE6_SHADOW_RENDER.md`.

## 18. Phase 7 boundary (implemented)

**In scope:** `acceptance/` module — Current vs Recommended comparison, accept/reject with `confirm: true`, per-draft `meta.designLibraryProjectionAcceptance`, fingerprint stale fallback; flags `ENABLE_STOREFRONT_PROJECTION_ACCEPTANCE_V1`; `GET …/projection-comparison`, `POST …/projection-acceptance`; accepted source for authorised `GET …/projection-preview` only.

**Authority:** Per-draft preview preference only. `isDesignLibraryAuthoritative() === false`. No public production cutover. No publish mutation.

**Out of scope (still deferred at Phase 7):** public cutover, layout editor, theme scoring, mandatory dashboard wizard, global authority.

See: `docs/IMPACT_REPORT_STOREFRONT_DESIGN_LIBRARY_PHASE7_ACCEPTANCE.md`.

## 19. Phase 8 split

### 8A-Core — Accepted Draft Preview Rendering (implemented)

**In scope:** Flag `ENABLE_STOREFRONT_PROJECTION_PREVIEW_RENDER_V1`; module `previewRendering/` with `resolvePreviewRenderSource` + dual packages; enriched auth `GET …/projection-preview` (`primarySource`, `packages.legacy|projection`, `Cache-Control: private, no-store`); honesty fix (legacy primary never returns projection-only VM); import-isolation tests.

**Authority:** Preview only. Public visitors stay on legacy. `isDesignLibraryAuthoritative() === false`. No publish branching.

**Out of scope for 8A-Core:** thin owner UI (8A-UI), public cutover, publish snapshots (8B), layout editor.

See: `docs/IMPACT_REPORT_STOREFRONT_DESIGN_LIBRARY_PHASE8A_PREVIEW_RENDER.md`.

### 8A-UI — Thin owner comparison surface (implemented)

Current / Recommended + Preview Current / Preview Recommended + Differences + Accept / Reject + acceptance status + fallback reason. Mounted on create-store inline website preview (`ProjectionAcceptancePanel`). Soft-hides when APIs disabled. No layout editor.

See: `docs/IMPACT_REPORT_STOREFRONT_DESIGN_LIBRARY_PHASE8A_UI.md`.

### 8B-Core — Controlled Publish Cutover (implemented)

**In scope:** Flag `ENABLE_STOREFRONT_PROJECTION_PUBLISH_V1`; `publishCutover/` (package + publish validator + resolver + immutable `meta.designLibraryPublish` provenance + `storefront.publish.completed`); wired only on `POST …/draft-store/:draftId/publish`; fail closed → legacy; no draft section mutate-in-place; `isDesignLibraryAuthoritative() === false`.

**Out of scope:** UI, global authority, other publish entrypoints, layout editor, Phase 9 canonical cutover.

See: `docs/IMPACT_REPORT_STOREFRONT_DESIGN_LIBRARY_PHASE8B_PUBLISH_CUTOVER.md`.
