# Local SQLite migration recovery

Cardbey Core local dev uses `prisma/schema.prisma` with `DATABASE_URL=file:../prod.db` (or `dev.db`). Use this guide when `prisma migrate deploy` fails or Core prints **DATABASE MIGRATION HISTORY IS DIRTY**.

## Before anything else

```powershell
cd apps/core/cardbey-core
Copy-Item .\prisma\prod.db .\prisma\prod.backup-dirty.db
```

If `prod.db` does not exist, skip the copy and use Option A on a fresh file.

## Audit (read-only)

```powershell
node scripts/audit-sqlite-migrations.mjs
node scripts/audit-sqlite-migrations.mjs --json
```

Reports SQLite-incompatible SQL, duplicate-column risk, missing-table dependencies, and `_prisma_migrations` drift. Does **not** modify files or the database.

---

## Option A — Fresh local DB (fastest, loses local data)

Use when local data is disposable or already backed up.

```powershell
cd apps/core/cardbey-core
Copy-Item .\prisma\prod.db .\prisma\prod.backup-dirty.db
Remove-Item .\prisma\prod.db
npx prisma migrate deploy --schema=prisma/schema.prisma
node scripts/repair-sqlite-schema.mjs
npx prisma generate --schema=prisma/schema.prisma
npx prisma db seed
```

Then start Core (`pnpm run dev` or `npm run dev`).

---

## Option B — Preserve local data (recommended)

Use when you need to keep existing rows in `prod.db`.

### 1. Backup

```powershell
Copy-Item .\prisma\prod.db .\prisma\prod.backup-before-migration-repair.db
```

### 2. Audit

```powershell
node scripts/audit-sqlite-migrations.mjs
```

Review failed migrations, duplicate-column risks, and missing-table dependencies.

### 3. Idempotent schema repair

```powershell
node scripts/repair-sqlite-schema.mjs
node scripts/repair-sqlite-schema.mjs --cleanup-failed-duplicates
```

Creates missing tables/columns/indexes via `PRAGMA table_info` checks. Optionally rolls back stale duplicate failed rows when the same migration also has a successful applied row.

### 4. Resolve blocked failed migration (only after schema is verified)

If audit/repair confirms the failed migration SQL is already satisfied (or the migration is now a no-op):

```powershell
npx prisma migrate resolve --rolled-back <migration_folder_name> --schema=prisma/schema.prisma
npx prisma migrate deploy --schema=prisma/schema.prisma
```

**Do not** use `migrate resolve --applied` unless you have verified the schema matches the migration.

Example (SkillDispatchLog blocker):

```powershell
npx prisma migrate resolve --rolled-back 20260611180000_skill_dispatch_log_query --schema=prisma/schema.prisma
npx prisma migrate deploy --schema=prisma/schema.prisma
```

### 5. Finish

```powershell
npx prisma generate --schema=prisma/schema.prisma
npx prisma db seed
```

---

## Validation checklist

```powershell
npx prisma migrate status --schema=prisma/schema.prisma
npx prisma migrate deploy --schema=prisma/schema.prisma
node scripts/audit-sqlite-migrations.mjs
node scripts/repair-sqlite-schema.mjs
npx prisma generate --schema=prisma/schema.prisma
npx prisma db seed
```

Expected:

- `Database schema is up to date!`
- No failed migrations in audit section D
- Core starts without the dirty migration banner

---

## Notes

- **Postgres migrations** under `prisma/postgres/migrations/` may use `ADD COLUMN IF NOT EXISTS`; that is valid for Postgres only. The main SQLite chain is `prisma/migrations/`.
- **`prisma/sqlite/migrations/`** is a partial parallel chain; `migrationHealthCheck` scans both folders. A row like `20260611120000_product_catalog_item_type` may exist in `_prisma_migrations` without a matching folder in `prisma/migrations/` — that is legacy drift, not a deploy blocker when `migrate status` is clean.
- **`scripts/repair-sqlite-schema.mjs`** is for local drift only; it never marks migrations applied in `_prisma_migrations`.

See also: [SQLITE_MIGRATION_REPAIR_REPORT.md](./SQLITE_MIGRATION_REPAIR_REPORT.md)
