# SQLite Schema Drift — Documented Gaps & Resolutions

This file tracks schema fields that blocked honest executor stubs and their resolution status.
**Do not add Prisma migrations from this doc** — use `db:push` in dev/test only per team workflow.

## Resolved (Master Run)

### StorePromo.promoType — DANH: schema-gap-storepromo-type

| Field | Model | Status |
|-------|-------|--------|
| `promoType` | `StorePromo` | **Added** (`String?`, default `"general"`) |

**Was blocking:** `schedule_loyalty_campaign.js` returned `persisted: false` because loyalty promos could not be typed.

**Executor:** `src/lib/toolExecutors/loyalty/schedule_loyalty_campaign.js` now creates draft promos with `promoType: 'loyalty'`.

---

### Product.isFeatured / Product.featuredAt — DANH: schema-gap-product-featured

| Field | Model | Status |
|-------|-------|--------|
| `isFeatured` | `Product` | **Added** (`Boolean`, default `false`) |
| `featuredAt` | `Product` | **Added** (`DateTime?`) |

**Was blocking:** `apply_homepage_feature.js` returned `featured: false, persisted: false`.

**Executor:** `src/lib/toolExecutors/homepage/apply_homepage_feature.js` now updates `isFeatured` and `featuredAt`.

**Related:** `identify_feature_target.js` orders by `isFeatured: 'asc'` so unfeatured products are preferred.

---

## Apply schema locally

```bash
cd apps/core/cardbey-core
npx prisma generate --schema prisma/sqlite/schema.prisma
npx prisma generate --schema prisma/postgres/schema.prisma
npm run db:push:test
```
