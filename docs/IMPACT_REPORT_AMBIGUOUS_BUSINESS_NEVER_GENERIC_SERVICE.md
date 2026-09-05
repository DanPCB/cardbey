# Impact Report: Ambiguous business never degrades to generic service template

**Date:** 2026-09-05  
**Goal:** Fix My Flower / Melbourne / Home & Garden → Core Service / Emergency Call-out / aviation stock.  
**User instruction:** Proceed with recommended fix (architecture first).

## What could break

1. Stores that previously got a full 24–30 item generic service scaffold when vertical was unknown may get a **sparse** catalog or florist-oriented shell instead.
2. Names containing singular `flower` / `floral` may resolve to `retail.flower` (was often `services.generic`).
3. Blueprint `matchPatterns` on florist may attach florist catalog earlier in MI / orchestra paths.

## Why

- `resolveVertical` falls back to `services.generic` (confidence 0) when no keywords match; singular `flower` is not a keyword.
- `buildSeedCatalog` then calls `buildServicesSeed` (Core Service, Emergency Call-out, …).
- Image fill queries those names → unrelated Pexels stock.

## Impact scope

- `verticalTaxonomy.js` (resolution)
- `retailBlueprints.js` (matchPatterns)
- `seedCatalogBuilder.js` (never generic when low-confidence / flower-inferred sparse)
- Tests for My Flower regression fixture
- Downstream: draft store create, orchestra build_store catalog seeding

## Smallest safe patch

1. Add name/keyword signals so `My Flower` → `retail.flower` (medium confidence).
2. Add florist `matchPatterns` so blueprint can resolve from name.
3. Replace `services.generic` / empty-vertical → `buildServicesSeed` with:
   - sparse florist shell (categories + unpriced category labels) when flower signals present;
   - sparse unknown shell (no Core Service packages) otherwise.
4. Do **not** invent priced bouquet SKUs unless blueprint path is used with verified vertical lock from stronger evidence — for inferred-only flower use unpriced category scaffolds + flower image hints.

## Rollback

Revert the three source files + tests; generic service seed resumes for unknown verticals.
