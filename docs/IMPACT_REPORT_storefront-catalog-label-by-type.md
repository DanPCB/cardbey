# Impact Report — Storefront catalog label by business type

**Date:** 2026-07-18  
**Goal:** Footer + catalog heading show **Services** (service), **Menu** (food), **Catalog** (product).

## Cause

Legacy stores often persist `catalogLabel: "Catalog"`. Override logic only replaced
`products` / `our products`, so spas kept “Catalog” despite service classification.
Spa presentation also used “Book Services”.

## Fix

- Canonical labels from business type: Menu / Services / Catalog
- Treat stored “Catalog” / “Book Services” / etc. as overrides to type-canonical labels
- Footer normalizer maps Products / Book Services → Catalog / Services

## Scope

Dashboard label helpers only; no publish/catalog write changes.

## No-parallel-stack proof

Same `getStoreCatalogPresentation` / footer label path; no new nav system.
