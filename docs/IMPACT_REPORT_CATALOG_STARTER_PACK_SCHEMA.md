# Impact Report: Catalog & Starter Pack Data Model (Prisma + Types)

**Date:** 2026-02-06  
**Scope:** Core data model only (Prisma schema, TS types, seed placeholders, catalog lib stubs). No UI; no route or store-creation changes.

## What could break

- **Prisma migrations:** Existing `Store`/`Product` (Business/Product) tables could be affected if new models used the same names or conflicting relations.
- **Existing APIs:** Any code expecting old product/store schema could fail if we renamed or removed fields.

## Why

- New tables and enums could collide with existing table/index names.
- Changing existing models would break all callers (routes, services, tests).

## Mitigation applied

- **No existing models modified.** Only new models added: `CatalogItem`, `CatalogCategory`, `StarterPack`, `StarterPackItem`, `StarterPackCategory`, `ValidatorRule`, `BusinessType`, `Region`.
- **No relations to Business or Product.** Catalog and starter pack are standalone; feature can be enabled via feature flags later.
- **Migration is additive only.** `prisma/migrations/20260206000000_add_catalog_starter_pack_validators/migration.sql` contains only `CREATE TABLE` and `CREATE INDEX` for the new tables. No drops, renames, or changes to existing tables.
- **Backwards-compatible.** No route behavior changes; `instantiatePackToDraftStore` is a stub (TODO) and not wired into store creation.

## Impact scope

- **Database:** New tables only; existing Store/Product and all other tables unchanged.
- **Application:** New code under `apps/core/cardbey-core/src/lib/catalog/` (types, seed examples, list/get/instantiate stubs). No changes to existing store creation flow or API routes.

## Smallest safe patch (what was done)

1. **Prisma schema:** Appended new enums and models at end of `prisma/schema.prisma`; no edits to Business, Product, or DraftStore.
2. **Migration:** Single migration file that only creates the new tables and indexes (SQLite-compatible: TEXT for JSON columns, INTEGER for booleans).
3. **Types:** `src/lib/catalog/types.ts` mirrors the new Prisma models for use in app code.
4. **Seed placeholders:** `src/lib/catalog/seedStarterPacks.ts` exports empty arrays and two example packs (Cafe AU, Nail Salon AU) for reference only; no DB writes.
5. **Catalog lib:** `src/lib/catalog/index.ts` exposes `listStarterPacks(filters)`, `getStarterPack(id)`, and `instantiatePackToDraftStore(packId, draftStoreId)` (stub with TODO). Uses existing `getPrismaClient()` from `db/prisma.js`.

## Applying the migration

From `apps/core/cardbey-core`:

```bash
npx prisma migrate deploy
```

Or in development (if no drift with existing DB):

```bash
npx prisma migrate dev --name add_catalog_starter_pack_validators
```

If `prisma generate` fails with EPERM on Windows (file in use), close any process using the Prisma client and run `npx prisma generate` again.
