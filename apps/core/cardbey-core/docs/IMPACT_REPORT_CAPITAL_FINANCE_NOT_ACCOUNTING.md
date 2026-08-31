# Impact Report: Capital / Finance ≠ Accounting (store create)

**Status:** Ready to ship  
**Branch:** `fix/capital-finance-not-accounting`  
**Symptom:** “Anison Capital Group” (capital / investment advice) generated an accounting catalog (Individual Tax Return, BAS Lodgement, Bookkeeping) with mismatched stock imagery.

## What could break

1. Firms that are both tax *and* capital branded (e.g. “XYZ Accounting & Capital”) now prefer the **accounting** blueprint when both signals are present.
2. Catalog items for finance stores change from tax/BAS scaffolding to investment/capital advisory offerings — expected for this fix.
3. Vertical keyword order: `services.finance` is listed before `services.accounting`; `financial advisor` moved from accounting → finance.

## Why

`services.accounting` `matchPatterns` previously included `capital|finance|investment…`, so name matching returned the accounting blueprint before (or instead of) a finance-specific catalog. Taxonomy also treated “financial advisor” as an accounting keyword.

## Impact scope

- Core draft store seed path: `resolveIndustryBlueprintKey` → industry blueprints → `buildSeedCatalog` / `buildIndustryCatalog`
- Vertical resolution for professional names (`verticalTaxonomy`)
- Store generation context lock (`services.finance` for capital names)

## Smallest safe patch

1. Add `services.finance` blueprint (investment / capital advisory offerings + finance image hints).
2. Narrow accounting `matchPatterns` to tax/bookkeeping/payroll signals only.
3. Explicit finance-vs-accounting disambiguation in `resolveIndustryBlueprintKey`.
4. Move `financial advisor` keywords to `services.finance`.
5. Regression tests for Anison / Anision Capital Group vs explicit accountants.

## No-parallel-stack proof

Reuses existing industry blueprint registry, vertical taxonomy, and seed catalog builder. No new Intent Runtime / MI / Performer stack.
