# Staging Deploy Recovery — Ghost Store Migration P3018

**Error:** `type "datetime" does not exist` on migration `20260613120000_add_ghost_store_models`

**Root cause:** Postgres migration copied SQLite `DATETIME` syntax. Fixed to `TIMESTAMP(3)` in commit after this report.

## After fix is pushed (automatic)

Render `preDeployCommand` runs `node scripts/resolve-postgres-failed-migration.mjs` before bootstrap. It marks allowlisted failed migrations (including `20260613120000_add_ghost_store_models`) as **rolled back**, then `migrate deploy` retries with the fixed SQL.

Trigger a **Manual Deploy** on `cardbey-core-staging` after push — no Shell required for the allowlisted ghost-store failure.

## Manual recovery (Render Shell)

If auto-resolve does not run or a different migration failed:

```bash
cd apps/core/cardbey-core

# Mark failed migration as rolled back so deploy can retry
npx prisma migrate resolve --rolled-back 20260613120000_add_ghost_store_models \
  --schema prisma/postgres/schema.prisma

# Apply fixed migration
npx prisma migrate deploy --schema prisma/postgres/schema.prisma
```

Then trigger **Manual Deploy** if pre-deploy does not auto-retry.

## If Business columns already exist

The failed run likely applied the four `ALTER TABLE "Business"` statements before `CREATE TABLE` failed. The fixed migration uses `ADD COLUMN IF NOT EXISTS` so redeploy is safe.

## Verify

```bash
npx prisma migrate status --schema prisma/postgres/schema.prisma
```

Expected: no failed migrations; ghost store tables present.
