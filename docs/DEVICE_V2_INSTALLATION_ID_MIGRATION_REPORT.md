# Device V2 installationId — Staged Prisma Migration Report

**Date:** 2026-07-15  
**Phase:** 1 (nullable + non-unique index only)

---

## Confirmed cause of Prisma drift

`npx prisma db push` against **`prisma/schema.prisma` (root)** proposes destructive changes because that file is **stale/obsolete for ops** (~190 models) while the real databases were built from:

| Environment | Authoritative schema |
|-------------|----------------------|
| SQLite development | `prisma/sqlite/schema.prisma` (~235 models) |
| Postgres production | `prisma/postgres/schema.prisma` (~238 models) |

Root schema lacks Creator / many commerce tables that exist in the live SQLite DB, so push wants to **drop populated unrelated tables**. Using `--accept-data-loss` would destroy that data.

Additionally, `installationId` had been added only on the root schema (with `@unique`) and not on the authoritative schemas — app code fell back to `DeviceCapability` JSON.

---

## Authoritative schemas

- **SQLite:** `apps/core/cardbey-core/prisma/sqlite/schema.prisma`  
  Migrations: `prisma/sqlite/migrations/`  
  Client generate: `client-gen` via `prisma-generate-for-env.js`
- **Postgres:** `apps/core/cardbey-core/prisma/postgres/schema.prisma`  
  Migrations: `prisma/postgres/migrations/`
- **Root `prisma/schema.prisma`:** not authoritative for migrate/generate; kept for accidental CLI default only. Prefer always passing `--schema`.

---

## Schema / migration files changed

| File | Change |
|------|--------|
| `prisma/sqlite/schema.prisma` | `installationId String?` + `@@index([installationId])` — **not** `@unique` |
| `prisma/postgres/schema.prisma` | same |
| `prisma/schema.prisma` | removed `@unique`; Phase 1 parity comment |
| `prisma/sqlite/migrations/20260715120000_device_installation_id/migration.sql` | ADD COLUMN + non-unique index |
| `prisma/postgres/migrations/20260715120000_device_installation_id/migration.sql` | ADD COLUMN IF NOT EXISTS + non-unique index |

---

## Bootstrap / push safety

| Path | Before | After |
|------|--------|-------|
| `npm run db:push` | `db push --accept-data-loss` | **refuses** (`refuse-prisma-db-push.mjs`) |
| `db:push:test` | unconditional accept-data-loss | only via `db:push:dangerous` + env + test URL |
| `apply-migration.ps1` | root schema `db push --accept-data-loss` | validate + guard + `migrate deploy --schema prisma/sqlite/...` |
| `prisma-bootstrap.js` | empty-migration fallback push | requires `ALLOW_PRISMA_DB_PUSH=1`; still **no** `--accept-data-loss` |

---

## Normalization

`normalizeInstallationId()` in `src/lib/deviceIdentity.js` — used by pairing, heartbeat, persist/reconcile.

Rejects: `""`, whitespace, `unknown`, `null`, `undefined`, etc. → stores **NULL**.

Backend never invents an installation id when the TV already supplies one.

---

## Phase 2 uniqueness

Documented in `apps/core/cardbey-core/docs/DEVICE_INSTALLATION_ID_PHASE2_UNIQUENESS_PLAN.md`.  
**Not applied.** Unique index only after duplicate cleanup + audit green.

---

## Scripts

```
npm run prisma:sqlite:validate
npm run prisma:postgres:validate
npm run prisma:migration:guard
npm run prisma:device:audit
npm run prisma:device:dup-report
npm run prisma:device:migrate:sqlite   # when ready to apply
```

---

## Verification run (2026-07-15)

| Check | Result |
|-------|--------|
| `prisma validate --schema prisma/sqlite/schema.prisma` | OK |
| `prisma validate --schema prisma/postgres/schema.prisma` (with postgres URL) | OK |
| `prisma-migration-diff-guard.mjs` | OK (Device-only SQL) |
| Unit tests (`deviceIdentity` + migration SQL/schema) | 13 passed |
| Pre-migration audit on `dev-fresh.db` | exit 2 (column missing — expected) |
| Apply SQL to **copy** `dev-installid-verify-*.db` via `sqlite3 .read` | OK |
| Post-apply audit on copy | exit 0 |
| Unique install index | absent (Phase 1 correct) |

### Before / after row counts (copy of `dev-fresh.db`)

| Table | Before | After |
|-------|--------|-------|
| Creator | 2 | 2 |
| CreatorClassification | 6 | 6 |
| CreatorContent | 6 | 6 |
| CreatorPublishingDecision | 3 | 3 |
| CreatorPublishingEvent | 36 | 36 |
| Product | 48 | 48 |
| StorePromo | 1 | 1 |
| LoyaltyProgram | 2 | 2 |
| DocumentTopologyRevision | 28 | 28 |
| Device | 0 | 0 |

Device gained column `installationId` + index `Device_installationId_idx` (non-unique). Unrelated tables unchanged.

### Active DB not auto-migrated

`migrate deploy` was **not** run against the live `dev-fresh.db` / `dev.db` in this change set. Apply when ready:

```bash
npx prisma migrate deploy --schema prisma/sqlite/schema.prisma
npx prisma generate --schema prisma/sqlite/schema.prisma
npm run prisma:device:audit
```

Do **not** use `prisma db push --accept-data-loss`.

## Remaining blockers before uniqueness (Phase 3)

1. Apply Phase 1 migrate deploy on each environment  
2. Run `prisma:device:dup-report` and resolve groups  
3. Confirm zero empty-string IDs  
4. Confirm runtime preserve/normalize behavior in release/claim/reassign  
5. Then only add `@unique` / unique index per phase plan doc
