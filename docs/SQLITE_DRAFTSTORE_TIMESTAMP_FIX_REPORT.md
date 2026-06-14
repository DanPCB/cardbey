# SQLite DraftStore TIMESTAMP(3) Fix Report

**Date:** 2026-06-13  
**Scope:** Local SQLite `DraftStore.create()` failure blocking store draft generation.

---

## Final verdict: Can store creation continue?

**YES**

After migration correction, schema repair on `dev-fresh.db`, and regression tests, `createDraftStoreForUser()` / `prisma.draftStore.create()` succeed on local SQLite without `Conversion failed: Value TIMESTAMP(3) not supported`.

---

## Root cause

Two shared migrations under `prisma/migrations/` used **Postgres-only** `TIMESTAMP(3)` syntax while being applied to local SQLite databases:

| Migration | Problem |
|-----------|---------|
| `20260610120000_add_discovery_pipeline` | `DraftStore.transferredAt TIMESTAMP(3)` plus discovery tables |
| `20260610140000_add_discovery_config` | `discovery_config` datetime columns as `TIMESTAMP(3)` |

SQLite accepted the DDL literally — column **type name** became `TIMESTAMP(3)` in the physical schema. Prisma’s SQLite engine maps `DateTime` fields to `DATETIME`/`NUMERIC` and cannot read or write columns declared as `TIMESTAMP(3)`, so **any** `draftStore.create()` failed even when `transferredAt` was null (Prisma still introspects all columns on the model).

The Prisma schema (`DraftStore.transferredAt DateTime?`) was correct. The bug was **drifted migration SQL**, not bad values passed from `draftStoreService.js`.

---

## Exact field causing the error

**Primary:** `DraftStore.transferredAt` — type `TIMESTAMP(3)` in live DB.

**PRAGMA before repair (`dev-fresh.db`):**

```
25|transferredAt|TIMESTAMP(3)
```

**Also affected (same migration drift):**

- `UnclaimedStore`: `claimedAt`, `createdAt`, `expiresAt`
- `DiscoverySeedSource`: `lastRunAt`, `createdAt`
- `DiscoveryBatchRun`: `startedAt`, `completedAt`
- `discovery_config`: `pausedUntil`, `updatedAt`, `createdAt`

`draftStoreService.js` (lines 584–590) passes valid values — `expiresAt: new Date(...)` and relies on Prisma defaults for `createdAt` / `updatedAt`. No code change was required there.

---

## Schema / migration files changed

| File | Change |
|------|--------|
| `prisma/migrations/20260610120000_add_discovery_pipeline/migration.sql` | Replaced all `TIMESTAMP(3)` with `DATETIME` (aligned with `prisma/sqlite/migrations/` version) |
| `prisma/migrations/20260610140000_add_discovery_config/migration.sql` | Replaced all `TIMESTAMP(3)` with `DATETIME` |

**Not changed:** `prisma/schema.prisma` (already uses plain `DateTime` without `@db.Timestamp`). Postgres migrations in `prisma/postgres/migrations/` remain `TIMESTAMP(3)` as appropriate for Postgres.

---

## Repair script changes

**New:** `src/lib/sqliteTimestampRepair.js`

- Detects columns whose `PRAGMA table_info` type contains `TIMESTAMP`
- Rebuilds affected tables with `TIMESTAMP(3)` → `DATETIME` in DDL
- Preserves row data and recreates indexes

**Updated:** `scripts/repair-sqlite-schema.mjs`

- Backs up DB before timestamp repair: `{db}.backup-before-ts-repair-{iso}`
- Runs `repairAllTimestamp3Columns()` for `DraftStore`, discovery tables, and `discovery_config`
- Then continues existing column/index repairs

**Repair run on `dev-fresh.db` (2026-06-13):**

```
timestampTablesRepaired: DraftStore, UnclaimedStore, DiscoverySeedSource, DiscoveryBatchRun, discovery_config
backup: prisma/dev-fresh.db.backup-before-ts-repair-2026-06-13T00-09-48-058Z
```

**After repair:**

```
transferredAt | DATETIME
```

---

## Regression tests

| File | Coverage |
|------|----------|
| `src/lib/sqliteTimestampRepair.test.js` | Detect + rebuild `TIMESTAMP(3)` column on minimal DraftStore table |
| `src/services/draftStore/draftStoreCreateTimestamp.test.js` | PRAGMA contract + `createDraftStoreForUser()` succeeds with valid `DateTime` fields |

All 4 tests pass.

---

## Validation

```powershell
cd apps/core/cardbey-core
npx prisma generate --schema=prisma/schema.prisma
node scripts/repair-sqlite-schema.mjs
```

Manual create on repaired `dev-fresh.db`:

```
OK draft cmqblmh2r0001jvx4e2cga9kq
```

No `TIMESTAMP(3)` conversion error.

---

## Local dev checklist

1. Run `node scripts/repair-sqlite-schema.mjs` once on any existing SQLite DB that predates this fix.
2. Restart Core (`node --import tsx scripts/dev-api-entry.mjs`).
3. Retry store draft generation in Performer.

Fresh databases created from corrected migrations will not need repair.
