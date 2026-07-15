# Completion Report: Hierarchical Catalog Restore (Phase 1)

**Date:** 2026-07-15  
**Status:** Phase 1 complete for new creates / re-extracts. Existing flat drafts need audit/repair or re-extract.

## Exact stage where hierarchy was lost

1. **Research venue extract** — Fresha `flatMap` discarded category names; Bookwell headings not stamped on offers.  
2. **OCR / offer normalize** — No section tracking; dedupe by item name alone.  
3. **`PATCH …/draft/catalog`** — Defaulted empty category to `General` and dropped `categoryPath`.  
4. **Storefront UI** — Flat product grid under “All”; category pills only when `categories.length > 1`.

Hierarchy was **both data-lost and render-flattened**, depending on path. Menu-import / LLM paths kept section names better; research + catalog apply were destructive.

## Prisma models

| Model | Hierarchy support |
|-------|-------------------|
| `DraftStore.preview` (JSON) | Canonical for create flow: `categories[]` + `items[].categoryId` + `categoryPath` |
| `Product.category` (String?) | Leaf/display string only; no `parentId` tree |
| No `CatalogCategory` table | Not added in Phase 1 |

## Schema changes

None (Prisma). Preview JSON shape extended additively: `parentName`, `path`, `level`, `categoryPath`.

## Extraction / merge / persist

| Area | Before | After |
|------|--------|-------|
| Fresha | Flat items | Category name + `categoryPath: ['Services', name]` |
| Bookwell | Flat items | Heading → `category` + path |
| OCR | No sections | Heading lines → current category |
| Dedupe | name only | `path::name` |
| PATCH catalog | `General` + drop path | Preserve path; no invented General |
| `recomputeDraftCategoriesFromItems` | Flat labels | Path metadata + stable ids |
| Publish category string | Leaf / map name | Prefers `categoryPath` join (`Parent · Sub`) |

## Preview API

Still returns `categories` + `items` (not a new nested envelope). Hierarchy is in category metadata + `categoryPath`. Derived flat list remains the item array.

## Frontend

- `groupDraftItemsByCategory` — flat + nested (path depth ≥ 2)  
- `WebsitePreviewPage` + `MiniWebsiteLayout` — sectioned All view, subcategory headings, nav pills with counts, total heading = full `items.length`

## Recovery scripts

```bash
cd apps/core/cardbey-core
node scripts/audit-flat-catalogs.mjs --limit=100
node scripts/repair-catalog-hierarchy.mjs --draft=<id>          # dry-run
node scripts/repair-catalog-hierarchy.mjs --draft=<id> --apply  # writes revision
```

Repair rebuilds from existing item `categoryPath` / labels only. If everything is `General` with no paths → **re-extract**, do not expect inventing Vietnamese sections.

## Stores detected with flat catalogs

Not run against production DB in this session. Use audit script post-deploy.

## Tests run

- Core: `draftCategoryUtils`, `validateCatalogHierarchy`, `menuImportMerge`, `normalizeMenuExtract` — **23 passed**  
- Dashboard: `groupDraftItemsByCategory` — **3 passed**

## Remaining limitations (not marked complete for full 20-point ask)

- No Prisma category tree / parentId remapping on publish  
- Manual Store Editor category CRUD actions not restored  
- Nested `{ catalog: { categories: [...] } }` API envelope not introduced  
- Instrumentation events defined in docs/helpers only (no full event bus wiring)  
- Existing screenshot draft likely needs **re-extract** if labels were already collapsed to General  
- Full e2e Create→Publish acceptance fixture not automated here  

## Deploy

- **cardbey-core**: research extract, PATCH catalog, recompute, publish category string, scripts  
- **dashboard**: storefront hierarchy UI  

Single Runway / safe-execution governance untouched (no auto-publish).
