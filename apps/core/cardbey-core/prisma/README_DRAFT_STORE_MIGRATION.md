# DraftStore.generationRunId migration (dev)

## Schema

`DraftStore` has `generationRunId String? @unique` for O(1) lookup. The migration that adds it is:

- **Migration:** `20260128120000_add_draft_store_generation_run_id`
- **SQL:** `ALTER TABLE "DraftStore" ADD COLUMN "generationRunId" TEXT;` + unique index.

## Apply migration (Windows dev)

1. **Stop the Core server** (stop `pnpm dev` / node / tsx) so the DB and Prisma engine are not locked.
2. From repo root:
   ```bash
   cd apps/core/cardbey-core
   npx prisma migrate dev --name add_draft_store_generation_run_id
   ```
   If that migration is already present, use:
   ```bash
   npx prisma migrate deploy
   ```
3. If Prisma reports **drift** or a migration fails (e.g. duplicate column from an older migration):
   ```bash
   npx prisma migrate reset
   ```
   **Dev-only:** this recreates `prisma/dev.db` and applies all migrations from scratch.
4. Regenerate the client (after server is stopped to avoid EPERM on Windows):
   ```bash
   npx prisma generate
   ```
5. Start Core again and retry QuickStart.

## Verify column in SQLite

```bash
cd apps/core/cardbey-core
sqlite3 prisma/dev.db "PRAGMA table_info(DraftStore);"
```

You should see a row for `generationRunId` (type TEXT).

## If you see "The column 'ownerUse' / 'ownerUserId' does not exist"

- The schema has `ownerUserId` and `guestSessionId` on `DraftStore`; the DB may be missing these columns.
- Apply the migration that adds them: `20260217150000_add_draft_store_owner_guest`.
- From `apps/core/cardbey-core`: run `npx prisma migrate deploy` (or `npx prisma migrate reset` for a clean dev DB), then `npx prisma generate`, then restart the API.

## If you still see "generationRunId column does not exist"

- The API will return `error: 'db_schema_out_of_date'` and `message: 'Run prisma migrate dev/reset to apply DraftStore.generationRunId'`.
- Ensure the process using the DB is the one that has the migrated schema (same `prisma/dev.db` and same `prisma generate` output).
