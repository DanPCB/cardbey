# Impact Report: Restore hierarchical menu/catalog structure

**Date:** 2026-07-15  
**Symptom:** Live/preview shows flat `Menu (N)` with no category sections.

## Where hierarchy is lost (exact stages)

| Stage | Location | Failure mode |
|-------|----------|--------------|
| 1. Research extract | `freshaVenueDiscovery.js` | `categories.flatMap(items)` dropped category **name** |
| 2. Research extract | `bookwellVenueDiscovery.js` | Heading → services walked; heading never stamped as `category` |
| 3. Research OCR | `serviceMenuExtractor.js` | OCR lines had no section tracking; dedupe by **name alone** |
| 4. Catalog apply | `stores.js` `PATCH …/draft/catalog` | Defaulted missing category to **`General`**; dropped `categoryPath` |
| 5. Normalize (prior) | `normalizeMenuExtract.js` | Invented `General` when category missing |
| 6. LLM flatten (prior) | `flattenToPreviewShape` | Kept leaf name; dropped parent until path added |
| 7. Preview UI | `WebsitePreviewPage` / `MiniWebsiteLayout` | Flat grid; pills only if `categories.length > 1`; **All** ungrouped |

**Data vs render:** Often both. Research/apply paths erased labels (`General` / single bucket). Even when `preview.categories` had 2+ rows, UI still rendered one grid under **All**.

## Schema

- Draft: `DraftStore.preview` JSON — `categories[{id,name,parentName?,path?,level?}]` + `items[].categoryId` + `items[].categoryPath`
- Published: Prisma `Product.category` **string** (no `CatalogCategory` tree table)
- **No Prisma Category table** in Phase 1 (would be a large migration; not required to restore draft/preview hierarchy)

## What could break

- UI order when `categoryId` missing (→ Other)
- Stores that intentionally have a single section (still single heading; pills hidden)
- Fresha GraphQL may reject `name` on category fragment (falls back empty category; items still import)
- OCR heading heuristic may treat price-less item lines as sections (conservative; owner can re-categorize)
- `recomputeDraftCategoriesFromItems` category **ids** change to path-based slugs (remap on recompute only)

## Smallest safe patch (applied)

1. Stop inventing `General`; preserve `categoryPath` through normalize / PATCH / merge / recompute
2. Stamp Fresha/Bookwell category labels onto offers; path-aware dedupe
3. OCR section tracking + path-aware dedupe in `serviceMenuExtractor`
4. Nested “All” rendering via `groupDraftItemsByCategory` (WebsitePreview + MiniWebsite)
5. `validateCatalogHierarchy` + dry-run audit/repair scripts
6. Keep `CATALOG_DISPLAY_PAGE_SIZE` separate from total count

## Explicitly deferred (Phase 2)

- Prisma `CatalogCategory` parent/child table
- Full Manual Store Editor category CRUD actions (`create_catalog_category`, …)
- Nested preview API `{ catalog: { categories: [...] } }` envelope (consumers still get `categories` + `items`)
- Auto-rewrite of all flat production stores (audit dry-run only)
- Full instrumentation event bus wiring for every `catalog_hierarchy_*` event

## Decision

Proceed with Phase 1 (preserve + render + repair dry-run). No Prisma Category migration.
