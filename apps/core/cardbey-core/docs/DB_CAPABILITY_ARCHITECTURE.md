# DB capability architecture

## Problem

Staged catalog publish used `product.createMany({ skipDuplicates: true })`. **SQLite’s Prisma driver does not support `skipDuplicates`**, causing runtime failures during store generation/publish.

Separately, **catalog generation** expanded AI menus to `CATALOG_ITEM_LIMIT` (300) using only 10 placeholder names, producing dozens of duplicate products (`House Special`, etc.).

## Design principles

1. **One capability registry** — `src/lib/persistence/dbCapabilityRegistry.js`
2. **One persistence contract** — `src/lib/persistence/catalogPersistence.js`
3. **No inline `if (provider === 'sqlite')` in services**
4. **Dedupe in generation and before insert** — `src/lib/persistence/catalogDedupe.js`
5. **Postgres = production target**; SQLite = deterministic local dev

## Capability registry

`getDbCapabilities()` returns:

| Flag | SQLite (local) | Postgres (prod) |
|------|----------------|-------------------|
| `supportsCreateManySkipDuplicates` | false | true |
| `supportsInteractiveTransactions` | true | true |
| `supportsSerializableIsolation` | false | true |
| `supportsJsonFiltering` | false | true |
| `supportsReturning` | false | true |
| `supportsBatchInsert` | true | true |
| `supportsExtendedBusinessFields` | false | true |

Detection order: `DATABASE_PROVIDER` → `DATABASE_URL` scheme → default `sqlite`.

Logs once: `[DB_CAPABILITIES] { ... }`

Legacy `src/lib/dbCapabilities.js` re-exports schema-drift flags via getters on the same registry.

## Persistence API

### `buildProductCreateManyArgs(data)`

Adds `skipDuplicates` only when supported.

### `batchInsertProducts(prisma, { businessId, rows, chunkSize, dedupe })`

- Client-side `dedupeRowsBeforeInsert` when connector lacks `skipDuplicates`
- Chunked short transactions (20s timeout)
- Logs `[BATCH_INSERT_MODE]` with `mode`: `create_many_skip_duplicates` | `create_many_client_dedupe`

### `batchReplaceCatalog`

Alias for insert after caller runs `deleteMany`.

### Staged publish integration

`stagedCatalogPublish.replaceStoreCatalogInBatches` → `batchInsertProducts`.

## Catalog deduplication (generation)

### Root cause: AI expansion to 300 items

`buildFromAi` used `need = CATALOG_ITEM_LIMIT - products.length` when below 24 items, cycling 10 placeholder names → **280 duplicate rows**.

**Fix:** expand only to `CATALOG_ITEM_MIN` (24), skip names already present.

### Structural guards

- `dedupeCatalogProductsByName` at end of `buildCatalog()`
- Seed expansion skips existing normalized names
- `prepareCatalogProductRows` skips duplicate names (preserves `publishedIdsByDraftIndex` alignment)

Logs: `[CATALOG_DEDUPE] { removedCount, context }`

## Risk analysis

| Risk | Mitigation |
|------|------------|
| Silent drop of legitimate duplicate display names | First wins; log `[CATALOG_DEDUPE]` |
| Postgres relies on skipDuplicates + client dedupe | Redundant but safe |
| Partial batch failure | Existing `rollbackPartialCatalogWrites` |
| miniWebsite featured ids for deduped items | Index left undefined for skipped dupes (same as before skip) |

## Migration notes

- **No DB migration required**
- Set `DATABASE_PROVIDER=postgres` in production (already standard)
- Optional: `LOG_DB_CAPABILITIES=1` in test CI
- `COMMIT_DRAFT_CATALOG_CHUNK_SIZE` unchanged (default 50)

## Acceptance checklist

- [x] `createMany` never passes `skipDuplicates` on SQLite
- [x] Postgres still uses `skipDuplicates` when supported
- [x] Central registry; no scattered provider checks in draft services
- [x] AI expansion capped at minimum catalog size, not 300 placeholders
- [x] Final `buildCatalog` dedupe pass
- [x] Unit tests: registry, persistence, dedupe
- [x] Staged publish uses `batchInsertProducts`

## Files

| File | Role |
|------|------|
| `lib/persistence/dbCapabilityRegistry.js` | Capability detection |
| `lib/persistence/catalogPersistence.js` | Batch insert contract |
| `lib/persistence/catalogDedupe.js` | Pure dedupe helpers |
| `lib/dbCapabilities.js` | Legacy facade + filters |
| `services/draftStore/stagedCatalogPublish.js` | Staged commit/publish |
| `services/draftStore/buildCatalog.js` | Generation dedupe + expansion fix |
