# Impact Report — Flexible Menu Understanding (source-preserving Menu Document)

**Date:** 2026-07-17  
**Scope:** Performer menu import extraction pipeline (Core)  
**Goal:** Let Performer read, extract, and **organize the store's menu as it is** (sections, packages, duration variants, add-ons, inclusions) instead of collapsing everything into the flat "reset menu" catalog frame.

## Problem

Vision extraction already captures rich structure per item (`durationMinutes`,
`inclusions`, `options`/variants, `addOns`, `category`/`categoryPath`,
`confidence`, `sourceRefs`). But the pipeline then calls `toCatalogMenuItems`,
which **flattens** variants/add-ons/inclusions into a description string and
drops section grouping. The review payload (`normalizedResult.items`) is a flat
list, so the menu's real shape (e.g. Spa Packages / Massage duration tiers /
Waxing price list) is lost before the owner ever reviews it.

## Change (additive, wrap — do not rewrite)

Add a **source-preserving Menu Document** built from the already-merged
extraction, attached to the job alongside the existing flat `items`:

- New pure module `menuDocument.js`:
  - `buildMenuDocument(merged, { currency })` → `{ version, currency, sections[], contact?, openingHours?, notes?, stats }`
  - Sections preserve heading + first-seen order; offerings preserve
    `variants` (from `options`), `addOns`, `inclusions`, price/priceText,
    `durationMinutes`, `confidence`, and `sourceRefs` (evidence).
  - `summarizeMenuDocument(doc)` → agent-first summary string
    ("4 sections · 18 services · 9 duration options · 1 add-on").
- Wire into `runMenuImportExtraction`: after merge, build the document and set
  `job.normalizedResult.menuDocument` + `job.extractedResult.menuDocument` +
  stats. Progress message uses the richer summary.
- Expose `menuDocument` in `publicJobView` (additive field).

## What could break

1. **Contract version** — unchanged (`'1'`). `menuDocument` is an additive
   response field; existing clients that read `items` are unaffected and do not
   trip `MENU_IMPORT_CONTRACT_MISMATCH`.
2. **Catalog apply** — unchanged. `toCatalogMenuItems` and the
   review → `replace_catalog` / `PATCH .../catalog` path are untouched; catalog
   write still happens only after owner review.
3. **Preview growth** — `menuDocument` adds JSON to `DraftStore.preview`
   menu-import bucket. Mitigated by existing "keep last 5 jobs" cap; document is
   bounded by the same catalog import safety ceiling.

## Why safe

- Pure, deterministic transformation over data the pipeline already produced.
- No API route, no Prisma migration, no auth/ownership change.
- No new execution authority; extraction remains read-only until confirm.

## Impact scope

- `apps/core/cardbey-core/src/services/menuImport/menuDocument.js` (new)
- `menuImportService.js` (attach document + summary)
- `menuImportJobStore.js` (`publicJobView` additive field)
- Tests: `menuDocument.test.js` (new)

## No-parallel-stack proof

Reuses the existing menu-import job, merge output, S3 assets, draft-preview
persistence, and review→apply path. Adds one pure projection module + additive
fields; introduces no new pipeline, route, model, or runtime.

## Follow-ups (not in this slice)

- Dashboard review UI to render sections/variants/add-ons from `menuDocument`
  (currently the flat list still drives the modal).
- Optional projection of packages/variants into catalog option groups when the
  catalog model supports them.
