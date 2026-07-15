# Impact Report: Item image relevance + remove 24-item catalog truncation

**Date:** 2026-07-15  
**Scope:** Store-creation catalog extraction caps + item image seed/Pexels path. Single Runway unchanged (no browser write path).

## Problems confirmed

### Images
- Menu seed accepts coffee/cafe/food fallthrough before item-specific Pexels → generic wrong images stick.
- `menu_upload_seed` is not cleared by QA (only `seed_library`).
- Service resolver miss + `allowNullOnLowConfidence` returns null and skips Pexels.
- finalizeDraft enriches first 30 **rows**, not first 30 **missing** images.
- `CATALOG_IMAGE_ENRICH_MAX` (50) unused by main callers.

### 24-item ceiling
- Research OCR: hardcoded `slice(0, 24)`.
- Research preload: `slice(0, 48)` into `preloadedCatalogItems`.
- Menu normalize: `MAX_MENU_ITEMS = 50`.
- Website crawl: `maxProducts: 20`.
- Preload sanitize: stop at 200.
- `CATALOG_DISPLAY_PAGE_SIZE = 24` is UI-only and must stay.

## What could break
1. Larger catalogs → more Pexels/LLM load and slower create_store.
2. Larger preloads → bigger mission context payloads.
3. Fewer seed images → more null/pending images until Pexels returns (acceptable).
4. Menu imports with 50+ OCR noise items if confidence filter is weak.

## Smallest safe patch (Phase 1 — this change)
1. Align truncation to `CATALOG_ITEM_LIMIT` (300) safety ceiling; keep UI page size 24.
2. Seed: item-matched seed only; no coffee/cafe fallthrough; prefer Pexels with item+category query; tag weak seed as `seed_library`.
3. Service miss falls through to Pexels ranking.
4. Image enrich loops over missing items up to `CATALOG_IMAGE_ENRICH_MAX` per pass; finalize uses missing-index list.

## Out of scope (Phase 2+)
- Full multimodal vision ranking, R2 catalog asset keys, owner image review UI, source manifests/checkpoints, robots-respecting full-site discovery.
- Those remain Single Runway capabilities to add incrementally.

## Decision
Proceed with Phase 1 after this report (user required fix + remove 24 ceil).

---

## Phase 1 implemented (2026-07-15)

### Why images were wrong/missing
1. Seed library accepted coffee/cafe/food fallthrough before item Pexels.
2. `menu_upload_seed` never re-enriched by QA / background fetch.
3. Service image resolver miss short-circuited to null (skipped Pexels).
4. finalizeDraft imaged the first 30 **rows**, not 30 missing images.

### Image providers (current)
| Provider | Status |
|----------|--------|
| Business/source page images | Prefer when `imageUrl` already on imported items |
| Pexels | Primary licensed stock for draft items |
| OpenAI | Fallback when Pexels fails |
| Seed library | Category-matched only; tagged `seed_library` + `needs_review` |
| Unsplash / Pixabay / Google / Bing | Not on draft-item path |

### Query before → after
- Before: often category seed / 2-word name / profile keywords.
- After: `resolveItemImageSearchQuery` + `buildItemImageQueryVariants` (name+category+description); multi-query Pexels ranking.

### 24-item truncation locations fixed
| Location | Before | After |
|----------|--------|--------|
| Research OCR | 24 | `CATALOG_IMPORT_SAFETY_CEILING` (300) |
| Research preload | 48 | 300 (+ optional source imageUrl) |
| Menu normalize | 50 | 300 |
| Website crawl | 20 | 300 / 12 pages |
| Preload sanitize | 200 | 300 |
| Document → products | 50 | 300 |
| UI page size | 24 | **unchanged** (display only) |

### Safety ceilings
- `CATALOG_IMPORT_SAFETY_CEILING` = 300
- `CATALOG_IMAGE_ENRICH_MAX` = 50 per pass (missing-only)
- `CATALOG_IMAGE_FETCH_CONCURRENCY` = 5
- `CATALOG_CRAWL_MAX_PAGES` = 12
- Stop conditions: sources exhausted or ceiling (partial status still Phase 2)

### Tests run
- `catalogLimits.importCeiling.test.js` (5)
- `normalizeMenuExtract.test.js` (12)
- All passed

### Remaining (Phase 2+)
- Multimodal visual match stage, R2 catalog asset persistence, owner review UI, source manifests/checkpoints, partial/complete import statuses, progressive UI counts, robots-respecting multi-page discovery beyond current crawl.
