# Impact Report — Storefront Design Library Phase 1

**Date:** 2026-07-31  
**Scope:** Contracts + registries + read-only adapters only  
**Flag:** `ENABLE_DESIGN_LIBRARY_V1`

## What could break

- Accidental import of design library into hot generate/render paths that treat registries as authoritative (mitigated: `isDesignLibraryAuthoritative()` always `false` in Phase 1; no call sites wired into draft/publish/renderer).
- Confusing `websiteTemplateId` with new `blueprintId` / `visualThemeId` (mitigated: explicit naming + adapter comments).

## Why this change is safe

Phase 1 adds a **parallel semantic layer**. Existing `ContentTemplate`, `websiteTemplateFoundation`, `preview.website.sections`, and `Business.stylePreferences.miniWebsite` remain the live authority. Registries do not alter store generation or public rendering.

## Impact scope

| Area | Change |
|------|--------|
| Core create-store / research / publish | **None** |
| Dashboard renderer | **None** |
| Prisma / migrations | **None** |
| New module | `src/lib/storefrontDesignLibrary/**` |
| Features | `Features.designLibrary.v1` + `.env.example` note |

## Contracts introduced

- `StorefrontBlueprint` + `BlueprintSectionDefinition`
- `VisualTheme`
- `StorefrontPreviewSample` with `sampleContentPolicy: "disposable_demo_only"`
- Vocabulary: section roles, storefront actions, business models, content roles (stub)

## Registries introduced

- Blueprint / VisualTheme / PreviewSample registries
- Boot-time registration + **seal** (no request-handler mutation)
- Cross-reference validation (preview → blueprint/theme; theme → supported blueprints)

## Initial definitions

| Kind | IDs |
|------|-----|
| Blueprints | `trade-lead-generation`, `service-booking`, `restaurant-menu`, `retail-commerce`, `portfolio-showcase` |
| Themes | `premium-blue`, `warm-natural`, `minimal-white`, `bold-dark` |
| Preview samples | `beauty-and-wellness`, `restaurant-and-cafe`, `retail-store`, `trades-and-services` |

## Adapter boundaries

| Adapter | Purpose |
|---------|---------|
| `contentTemplateAdapter` | ContentTemplate(+version) → preview metadata; read-only |
| `legacyThemeAdapter` | `legacyThemeTemplateId` → `visualThemeId` |
| `websiteTemplateFoundationAdapter` | layoutDefinition → structural role metadata |

## Naming decisions

| Name | Meaning |
|------|---------|
| `contentTemplateId` | ContentTemplate.id / slug |
| `legacyThemeTemplateId` | `website.theme.templateId` enum |
| `visualThemeId` | Design-library theme id |
| `blueprintId` | Design-library blueprint id |
| `previewSampleId` | Design-library preview sample id |

Do **not** use bare `templateId` inside this bounded context.

## Feature-flag behavior

| Env | Default when unset |
|-----|-------------------|
| Production | **off** |
| Staging / non-prod | **on** (diagnostics only) |
| Explicit `ENABLE_DESIGN_LIBRARY_V1` | wins |

Even when **on**, `isDesignLibraryAuthoritative()` is **false** — no generate/render cutover.

## Why renderer cutover is deferred

Phase 0 audit: React hardcodes section order; dual CTA paths; research forces bookable services. Cutting over before classification + projection would change owner-visible storefronts without evidence rules. Phase 1 only establishes the semantic layer.

## Migration implications

- Additive only; no schema migration.
- Future phases can shadow-write `preview.storefrontProjection` while keeping miniWebsite.
- Preview samples soft-link to ContentTemplate slugs via `sourceTemplateId`.

## Rollback

- Set `ENABLE_DESIGN_LIBRARY_V1=false` (diagnostics empty).
- Delete or ignore the new module — no live path depends on it yet.

## Test results

```text
pnpm exec vitest run src/lib/storefrontDesignLibrary/__tests__/designLibraryPhase1.test.js
→ 16 passed

node -e "import('./src/lib/storefrontDesignLibrary/index.js')"
→ ok 5 4 4 false  (blueprints, themes, samples, authoritative=false)
```

## Smallest safe patch (completed)

New `src/lib/storefrontDesignLibrary/**` + flag wiring + tests + docs. Zero changes to draftStoreService, publish, or WebsitePreviewPage.

## Phase 2 follow-on (completed)

Classification module + additive hooks in `researchCatalogDraft.js` only. Still non-authoritative. See `IMPACT_REPORT_STOREFRONT_DESIGN_LIBRARY_PHASE2_CLASSIFICATION.md`.
