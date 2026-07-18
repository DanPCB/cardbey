# Impact Report — Fix menu detail extraction (duration × price)

**Date:** 2026-07-18  
**Scope:** Menu import normalize + catalog flatten + vision prompt; review fallback  
**Goal:** Spa-style duration×price boards (Relaxation / Deep Tissue / Double) extract with priced options, not name-only rows with null prices.

## What could break

1. Catalog apply may create more rows (one per duration) instead of 3 unpriced shells — intended.
2. Price parsing from `$60` / `60 Mins` strings could mis-read edge formats.
3. Vision prompt change may alter restaurant single-price menus slightly (should still work).

## Why

Live review shows 3 services with `—` and “prices unclear”. Vision often returns section headings without `options[]`, and when options exist with only `priceText`, `toCatalogMenuItems` skips them (`optPrice == null` continue). Review then shows null prices.

## Impact scope

- `normalizeMenuExtract.js` — normalize option prices; fill parent price from min option
- `menuImportMerge.js` `toCatalogMenuItems` — honor `priceText`; never drop priced options
- `menuVisionExtract.js` — stronger duration-table rules + example
- Review UI fallback — show options when `menuDocument` absent
- Tests for normalize + catalog flatten

## Smallest safe patch

Fix parse/expand path first (deterministic). Prompt reinforcement additive. No catalog apply API change.

## No-parallel-stack proof

Same menu-import job → normalize → merge → toCatalogMenuItems → review → apply path.
