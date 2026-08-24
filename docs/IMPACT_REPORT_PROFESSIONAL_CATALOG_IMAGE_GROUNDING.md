# IMPACT REPORT — Professional catalog collapse + finance service images

**Date:** 2026-08-24  
**Live case:** AWE FINANCIAL (`/s/awe-financial`)  
**Symptom:** Services = single “Book our consultations” with sanitation-truck stock photo; flyer loan services lost; Shows reuse wrong item image.

## What could break

- Professional stores that relied on automatic collapse to a single consultation booking when OCR/research found **unpriced** named offerings will keep those names instead.
- Finance/legal/accounting item images will prefer office/advisor stock photos; handyman-biased queries no longer apply to those verticals.
- Existing tests that expect consultation-only for **empty** finance catalogs remain valid; tests that assume collapse when named offerings exist must be updated.

## Why

1. `collapseProfessionalCatalogWithoutPriceList` / `buildFromBlueprint` wipe any catalog without a “meaningful” `$` price list — Vietnamese loan product lines count as unpriced → replaced by consultation scaffold.
2. `buildServiceImageIntent` / `deriveIntentFromTitle` prepend **handyman** queries and reject “office meeting” for all unresolved service titles, including consultations → truck/worker photos win.

## Impact scope

- `industryBlueprintRegistry.js` — collapse / blueprint professional path
- `serviceImageIntentResolver.js` — professional/finance image intents
- Optional: `serviceImageMismatchGuards.js` — finance reject terms
- Unit tests for registry + image intent

No publish, billing, or auth changes. Existing published AWE store is **not** auto-repaired; needs regenerate/re-enrich after deploy.

## Smallest safe patch

1. Keep named grounded offerings when collapsing (don’t replace with consultation).
2. Use professional office image intents for finance/legal/accounting/consultation titles; never inject handyman defaults there.
3. Add regression tests for AWE-like flyer offerings + consultation image queries.
