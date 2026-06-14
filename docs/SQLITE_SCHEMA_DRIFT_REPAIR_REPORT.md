# SQLite Schema Drift Repair Report

**Date:** 2026-06-13  
**Scope:** Audit `prisma/dev-fresh.db` vs `prisma/schema.prisma` / `prisma/sqlite/schema.prisma`; repair missing columns/tables blocking publish and PIL/loyalty/docs APIs.

---

## Final verdict

**YES** — After `node scripts/repair-sqlite-schema.mjs` and regenerating the SQLite Prisma client (`client-gen`), local dev no longer fails on:

- `prisma.product.createMany()` during store publish (`Product.isFeatured`)
- `POST /api/pil/events` (PilEvent table)
- `GET /api/loyalty/programs/:storeId` (LoyaltyProgramStamp + `_count.stamps`)
- `GET /api/docs` (SmartDocument layer + doc-scoped relations)

Restart the Core API after repair so the running process loads the updated `client-gen`.

---

## Audit findings (`dev-fresh.db` vs schema)

| Item | Expected | Found before repair | Impact |
|------|----------|---------------------|--------|
| `Product.isFeatured` / `featuredAt` | Columns on `Product` | Missing | Publish failed: `Invalid prisma.product.createMany() … column isFeatured does not exist` |
| `PilEvent` | Table | Missing (prior fix added migration + repair entry) | P2021 on `POST /api/pil/events` |
| `LoyaltyProgramStamp` | Table | Missing; legacy `LoyaltyStamp` had `programId` (store loyalty) | P2021 on loyalty program queries with `_count.stamps` |
| `SmartDocument` layer | Tables + indexes | Missing entirely | P2021 on `GET /api/docs` |
| Doc promo redemptions | `DocumentPromoRedemption` | Legacy store table `PromoRedemption` occupied the name | SmartDocument `_count.redemptions` queried wrong table/columns |
| `PublishedArtifactProjection.heroVideoUrl` / `heroMediaType` | Columns on projection table | Missing (migration only in `prisma/sqlite/migrations/`) | Publish failed at `publishedArtifactProjection.upsert()` |

---

## Root cause (PromoRedemption name collision)

Legacy device-engine promos use table **`PromoRedemption`** (`tenantId`, `storeId`, `promoId`, …).

SmartDocument doc promos need a separate table. Postgres already maps:

- `PromoRuleRedemption` → `@@map("PromoRedemption")` (store)
- `PromoRedemption` (doc model) → `@@map("DocumentPromoRedemption")`

SQLite `prisma/sqlite/schema.prisma` was missing these `@@map` directives, so Prisma queried `PromoRedemption.docId` on the legacy store table.

---

## Repair coverage added

**`src/lib/sqliteSchemaRepairDefinitions.js`**

- `Product.isFeatured`, `Product.featuredAt` column repairs + index
- `PublishedArtifactProjection.heroVideoUrl`, `heroMediaType` column repairs
- `LoyaltyProgramStamp` DDL + legacy rename (`LoyaltyStamp` with `programId` → `LoyaltyProgramStamp`)
- Doc-scoped `LoyaltyStamp` creation after rename
- SmartDocument layer tables (`SmartDocument`, `DocVisitor`, …, `EventRsvp`)
- **`DocumentPromoRedemption`** (not legacy `PromoRedemption`)

**`scripts/repair-sqlite-schema.mjs`**

- PilEvent table + indexes (from prior work)
- Loyalty rename before SmartDocument DDL
- Product / SmartDocument / loyalty index ensure
- Fixed helper binding for `tableExists` / `tableColumns` callbacks

**Schema alignment**

- `prisma/schema.prisma` — `@@map("PromoRedemption")` on `PromoRuleRedemption`; `@@map("DocumentPromoRedemption")` on doc `PromoRedemption`
- `prisma/sqlite/schema.prisma` — same maps (runtime uses `client-gen` from this file)

**Migrations (shared `prisma/migrations/`)**

- `20260613130000_add_product_featured_fields`
- `20260613140000_add_loyalty_program_stamp`
- `20260613150000_add_smart_document_layer` (uses `DocumentPromoRedemption`)
- `20260613160000_add_projection_hero_video_columns`

---

## Repair run (dev-fresh.db)

```text
columnsAdded: ['Product.isFeatured', 'Product.featuredAt']
loyaltyTablesRepaired: ['LoyaltyStamp->LoyaltyProgramStamp']
tablesCreated: [SmartDocument layer…, 'LoyaltyStamp.doc.created', 'DocumentPromoRedemption']
```

Idempotent re-run adds only missing pieces (e.g. `DocumentPromoRedemption` on second pass).

---

## Verification

### Schema / Prisma paths

```bash
cd apps/core/cardbey-core
node scripts/repair-sqlite-schema.mjs
npx prisma generate --schema=prisma/sqlite/schema.prisma
node scripts/verify-sqlite-schema-repair.mjs
```

**Result:** all 11 checks PASS (`product.createMany`, `recordPilEvent`, `loyaltyProgram.findMany+stamps`, `smartDocument.findMany`, required tables/columns).

### HTTP endpoints (server restarted on :3001)

```bash
node scripts/verify-sqlite-api-endpoints.mjs
```

| Endpoint | Status | Notes |
|----------|--------|-------|
| `POST /api/pil/events` | 201, `persisted: true` | No P2021 |
| `GET /api/loyalty/programs/:storeId` | 200, `ok: true` | `_count.stamps` works |
| `GET /api/docs` | 200, `{ ok: true, documents: [] }` | No missing-table error |

### Publish (`product.createMany`)

Verified via `verify-sqlite-schema-repair.mjs` using the same `createMany` path as `catalogPersistence.js` during publish. The UI “Publish website” modal error for `isFeatured` is resolved once repair has run and the API process has been restarted.

---

## Operator checklist

1. `node scripts/repair-sqlite-schema.mjs`
2. `npx prisma generate --schema=prisma/sqlite/schema.prisma`
3. Restart Core API (`node --import tsx scripts/dev-api-entry.mjs`)
4. Optional: `node scripts/verify-sqlite-schema-repair.mjs` and `node scripts/verify-sqlite-api-endpoints.mjs`

---

## Files touched

- `src/lib/sqliteSchemaRepairDefinitions.js`
- `scripts/repair-sqlite-schema.mjs`
- `scripts/verify-sqlite-schema-repair.mjs`
- `scripts/verify-sqlite-api-endpoints.mjs` (new)
- `prisma/schema.prisma`, `prisma/sqlite/schema.prisma`
- `prisma/migrations/20260613130000_*`, `20260613140000_*`, `20260613150000_*`
